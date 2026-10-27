using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Automation;

namespace ArchitectIQ.Capture.Agent
{
    public class AutomationRecorder : IDisposable
    {
        private readonly EvidenceUploader _uploader;
        private readonly HashSet<string> _excludedProcesses = new(StringComparer.OrdinalIgnoreCase);
        private readonly HashSet<string> _excludedWindows = new(StringComparer.OrdinalIgnoreCase);
        private readonly Stopwatch _stopwatch = new();

        private Guid _currentSessionId;
        private string? _targetApplication;
        private bool _isRecording;
        private bool _isPaused;
        private int _sequenceCounter;
        private IntPtr _mouseHookHandle = IntPtr.Zero;
        private IntPtr _keyboardHookHandle = IntPtr.Zero;
        private HookProc? _mouseProc;
        private HookProc? _keyboardProc;

        public event Action<string>? LogMessage;
        public event Action<bool>? RecordingStateChanged;

        public Guid? CurrentSessionId => _isRecording ? _currentSessionId : null;
        public bool IsRecording => _isRecording;

        public AutomationRecorder(EvidenceUploader uploader)
        {
            _uploader = uploader;
        }

        public void StartSession(Guid sessionId, string? targetApplication, Dictionary<string, object>? securityExclusions)
        {
            _currentSessionId = sessionId;
            _targetApplication = targetApplication;
            _sequenceCounter = 0;
            _isRecording = true;
            _isPaused = false;

            _excludedProcesses.Clear();
            _excludedProcesses.Add("keepass.exe");
            _excludedProcesses.Add("1password.exe");
            _excludedProcesses.Add("bitwarden.exe");
            _excludedProcesses.Add("credentialmanager.exe");

            if (securityExclusions != null && securityExclusions.TryGetValue("excluded_applications", out var exclObj))
            {
                if (exclObj is IEnumerable<object> list)
                {
                    foreach (var item in list)
                    {
                        var str = item.ToString();
                        if (!string.IsNullOrEmpty(str))
                        {
                            _excludedProcesses.Add(str);
                        }
                    }
                }
            }

            _stopwatch.Restart();
            InstallHooks();
            RecordingStateChanged?.Invoke(true);
            LogMessage?.Invoke($"[PCS Recorder] Session {_currentSessionId} started recording monotonic clock.");
        }

        public void Pause()
        {
            _isPaused = true;
            _stopwatch.Stop();
            LogMessage?.Invoke("[PCS Recorder] Session paused.");
        }

        public void Resume()
        {
            _isPaused = false;
            _stopwatch.Start();
            LogMessage?.Invoke("[PCS Recorder] Session resumed.");
        }

        public void Stop()
        {
            _isRecording = false;
            _isPaused = false;
            _stopwatch.Stop();
            UninstallHooks();
            RecordingStateChanged?.Invoke(false);
            LogMessage?.Invoke("[PCS Recorder] Session stopped.");
        }

        private void InstallHooks()
        {
            _mouseProc = MouseHookCallback;
            _keyboardProc = KeyboardHookCallback;

            using var curProcess = Process.GetCurrentProcess();
            using var curModule = curProcess.MainModule!;
            var hMod = GetModuleHandle(curModule.ModuleName);

            _mouseHookHandle = SetWindowsHookEx(WH_MOUSE_LL, _mouseProc, hMod, 0);
            _keyboardHookHandle = SetWindowsHookEx(WH_KEYBOARD_LL, _keyboardProc, hMod, 0);
        }

        private void UninstallHooks()
        {
            if (_mouseHookHandle != IntPtr.Zero)
            {
                UnhookWindowsHookEx(_mouseHookHandle);
                _mouseHookHandle = IntPtr.Zero;
            }
            if (_keyboardHookHandle != IntPtr.Zero)
            {
                UnhookWindowsHookEx(_keyboardHookHandle);
                _keyboardHookHandle = IntPtr.Zero;
            }
        }

        private IntPtr MouseHookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0 && _isRecording && !_isPaused)
            {
                int msg = wParam.ToInt32();
                if (msg == WM_LBUTTONDOWN || msg == WM_RBUTTONDOWN)
                {
                    var hookStruct = Marshal.PtrToStructure<MSLLHOOKSTRUCT>(lParam);
                    ThreadPool.QueueUserWorkItem(_ =>
                    {
                        ProcessUserClick(hookStruct.pt.x, hookStruct.pt.y, msg == WM_LBUTTONDOWN ? "UI_CLICK" : "UI_RIGHT_CLICK");
                    });
                }
            }
            return CallNextHookEx(_mouseHookHandle, nCode, wParam, lParam);
        }

        private IntPtr KeyboardHookCallback(int nCode, IntPtr wParam, IntPtr lParam)
        {
            if (nCode >= 0 && _isRecording && !_isPaused)
            {
                int msg = wParam.ToInt32();
                if (msg == WM_KEYDOWN)
                {
                    var hookStruct = Marshal.PtrToStructure<KBDLLHOOKSTRUCT>(lParam);
                    if (hookStruct.vkCode == 0x0D) // Enter key
                    {
                        ThreadPool.QueueUserWorkItem(_ =>
                        {
                            ProcessKeyStroke("KEY_ENTER");
                        });
                    }
                }
            }
            return CallNextHookEx(_keyboardHookHandle, nCode, wParam, lParam);
        }

        private void ProcessUserClick(int screenX, int screenY, string eventType)
        {
            try
            {
                long offsetMs = _stopwatch.ElapsedMilliseconds;
                int seq = Interlocked.Increment(ref _sequenceCounter);

                var (procName, windowTitle, windowClass) = GetActiveWindowInfo();

                // Check security policy: is process or window excluded?
                bool isExcluded = _excludedProcesses.Contains(procName);
                string? redactionReason = isExcluded ? $"Process '{procName}' matches enterprise security exclusions." : null;

                // Inspect UIAutomation element at point
                var elemMeta = new Dictionary<string, object>();
                bool isPasswordField = false;
                Rectangle? elemBounds = null;

                try
                {
                    var pt = new System.Windows.Point(screenX, screenY);
                    var uiaElem = AutomationElement.FromPoint(pt);
                    if (uiaElem != null)
                    {
                        elemMeta["automation_id"] = uiaElem.Current.AutomationId ?? string.Empty;
                        elemMeta["control_type"] = uiaElem.Current.ControlType.ProgrammaticName;
                        elemMeta["name"] = uiaElem.Current.Name ?? string.Empty;
                        elemMeta["class_name"] = uiaElem.Current.ClassName ?? string.Empty;
                        elemMeta["is_enabled"] = uiaElem.Current.IsEnabled;

                        isPasswordField = uiaElem.Current.IsPassword;
                        if (isPasswordField)
                        {
                            elemMeta["is_password"] = true;
                            elemMeta["sanitized_input_value"] = "[REDACTED_PASSWORD_FIELD]";
                            redactionReason = "Password element detected; input and bounding region sanitized.";
                        }

                        var rect = uiaElem.Current.BoundingRectangle;
                        if (!rect.IsEmpty)
                        {
                            elemBounds = new Rectangle((int)rect.X, (int)rect.Y, (int)rect.Width, (int)rect.Height);
                        }
                    }
                }
                catch
                {
                    // Degrade gracefully if UIA element is unavailable
                }

                // Capture keyframe snapshot
                Guid? evidenceId = null;
                if (!isExcluded)
                {
                    evidenceId = CaptureAndUploadScreenshot(screenX, screenY, isPasswordField ? elemBounds : null);
                }

                var eventDto = new CaptureEventItemDto
                {
                    MonotonicOffsetMs = offsetMs,
                    SequenceNumber = seq,
                    EventType = eventType,
                    ProcessName = procName,
                    WindowTitle = windowTitle,
                    WindowClass = windowClass,
                    UiElementMetadata = elemMeta,
                    InteractionCoordinates = new Dictionary<string, int> { { "x", screenX }, { "y", screenY } },
                    EvidenceId = evidenceId,
                    IsRedacted = isExcluded || isPasswordField,
                    RedactionReason = redactionReason
                };

                _uploader.EnqueueEvent(_currentSessionId, eventDto);
            }
            catch (Exception ex)
            {
                LogMessage?.Invoke($"[PCS Recorder] Error capturing click event: {ex.Message}");
            }
        }

        private void ProcessKeyStroke(string keyName)
        {
            try
            {
                long offsetMs = _stopwatch.ElapsedMilliseconds;
                int seq = Interlocked.Increment(ref _sequenceCounter);

                var (procName, windowTitle, windowClass) = GetActiveWindowInfo();

                var eventDto = new CaptureEventItemDto
                {
                    MonotonicOffsetMs = offsetMs,
                    SequenceNumber = seq,
                    EventType = "UI_KEYPRESS",
                    ProcessName = procName,
                    WindowTitle = windowTitle,
                    WindowClass = windowClass,
                    UiElementMetadata = new Dictionary<string, object> { { "key", keyName } },
                    IsRedacted = _excludedProcesses.Contains(procName),
                    RedactionReason = _excludedProcesses.Contains(procName) ? $"Process '{procName}' is excluded." : null
                };

                _uploader.EnqueueEvent(_currentSessionId, eventDto);
            }
            catch (Exception ex)
            {
                LogMessage?.Invoke($"[PCS Recorder] Error capturing keystroke: {ex.Message}");
            }
        }

        private Guid? CaptureAndUploadScreenshot(int clickX, int clickY, Rectangle? redactRegion)
        {
            try
            {
                var bounds = System.Windows.Forms.Screen.PrimaryScreen?.Bounds ?? new Rectangle(0, 0, 1920, 1080);
                using var bmp = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format32bppArgb);
                using (var g = Graphics.FromImage(bmp))
                {
                    g.CopyFromScreen(bounds.X, bounds.Y, 0, 0, bounds.Size, CopyPixelOperation.SourceCopy);

                    // If sensitive region detected, draw opaque black overlay
                    if (redactRegion.HasValue)
                    {
                        using var brush = new SolidBrush(Color.Black);
                        g.FillRectangle(brush, redactRegion.Value);
                        using var pen = new Pen(Color.Red, 2);
                        g.DrawRectangle(pen, redactRegion.Value);
                    }

                    // Highlight operator cursor location
                    using var clickPen = new Pen(Color.LimeGreen, 3);
                    g.DrawEllipse(clickPen, clickX - 12, clickY - 12, 24, 24);
                }

                using var ms = new MemoryStream();
                bmp.Save(ms, ImageFormat.Png);
                var rawBytes = ms.ToArray();

                using var sha256 = SHA256.Create();
                string hash = BitConverter.ToString(sha256.ComputeHash(rawBytes)).Replace("-", "").ToLowerInvariant();

                var uploadDto = new CaptureEvidenceUpload
                {
                    EvidenceType = "KEYFRAME",
                    MimeType = "image/png",
                    Base64Data = Convert.ToBase64String(rawBytes),
                    Sha256Hash = hash,
                    ByteSize = rawBytes.Length,
                    Metadata = new Dictionary<string, object>
                    {
                        { "click_x", clickX },
                        { "click_y", clickY },
                        { "screen_width", bounds.Width },
                        { "screen_height", bounds.Height }
                    }
                };

                return _uploader.UploadEvidenceSync(_currentSessionId, uploadDto);
            }
            catch (Exception ex)
            {
                LogMessage?.Invoke($"[PCS Recorder] Screen capture error: {ex.Message}");
                return null;
            }
        }

        private static (string ProcessName, string WindowTitle, string WindowClass) GetActiveWindowInfo()
        {
            IntPtr hWnd = GetForegroundWindow();
            if (hWnd == IntPtr.Zero)
                return ("unknown", "unknown", "unknown");

            GetWindowThreadProcessId(hWnd, out uint pid);
            string procName = "unknown";
            try
            {
                using var proc = Process.GetProcessById((int)pid);
                procName = proc.ProcessName.ToLowerInvariant();
            }
            catch { }

            var titleSb = new StringBuilder(256);
            GetWindowText(hWnd, titleSb, titleSb.Capacity);

            var classSb = new StringBuilder(256);
            GetClassName(hWnd, classSb, classSb.Capacity);

            return (procName, titleSb.ToString(), classSb.ToString());
        }

        public void Dispose()
        {
            Stop();
        }

        #region Win32 API
        private delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);

        private const int WH_MOUSE_LL = 14;
        private const int WH_KEYBOARD_LL = 13;
        private const int WM_LBUTTONDOWN = 0x0201;
        private const int WM_RBUTTONDOWN = 0x0204;
        private const int WM_KEYDOWN = 0x0100;

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT { public int x; public int y; }

        [StructLayout(LayoutKind.Sequential)]
        private struct MSLLHOOKSTRUCT
        {
            public POINT pt;
            public uint mouseData;
            public uint flags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [StructLayout(LayoutKind.Sequential)]
        private struct KBDLLHOOKSTRUCT
        {
            public uint vkCode;
            public uint scanCode;
            public uint flags;
            public uint time;
            public IntPtr dwExtraInfo;
        }

        [DllImport("user32.dll", SetLastError = true)]
        private static extern IntPtr SetWindowsHookEx(int idHook, HookProc lpfn, IntPtr hMod, uint dwThreadId);

        [DllImport("user32.dll", SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        private static extern bool UnhookWindowsHookEx(IntPtr hhk);

        [DllImport("user32.dll")]
        private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

        [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern IntPtr GetModuleHandle(string lpModuleName);

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
        #endregion
    }
}
