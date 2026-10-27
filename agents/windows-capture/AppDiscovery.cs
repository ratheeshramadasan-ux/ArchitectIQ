using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Text.Json.Serialization;

namespace ArchitectIQ.Capture.Agent
{
    public class DiscoveredWindowDto
    {
        [JsonPropertyName("window_id")]
        public string WindowId { get; set; } = string.Empty;

        [JsonPropertyName("title")]
        public string Title { get; set; } = string.Empty;

        [JsonPropertyName("is_foreground")]
        public bool IsForeground { get; set; }

        [JsonPropertyName("capture_allowed")]
        public bool CaptureAllowed { get; set; } = true;
    }

    public class DiscoveredAppDto
    {
        [JsonPropertyName("application_id")]
        public string ApplicationId { get; set; } = string.Empty;

        [JsonPropertyName("display_name")]
        public string DisplayName { get; set; } = string.Empty;

        [JsonPropertyName("process_name")]
        public string ProcessName { get; set; } = string.Empty;

        [JsonPropertyName("publisher")]
        public string? Publisher { get; set; }

        [JsonPropertyName("publisher_verified")]
        public bool PublisherVerified { get; set; }

        [JsonPropertyName("policy")]
        public string Policy { get; set; } = "ALLOW";

        [JsonPropertyName("windows")]
        public List<DiscoveredWindowDto> Windows { get; set; } = new();

        [JsonPropertyName("capture_capabilities")]
        public List<string> CaptureCapabilities { get; set; } = new() { "SCREEN", "UI_ELEMENTS" };
    }

    public static class AppDiscovery
    {
        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);

        [DllImport("user32.dll")]
        private static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
        private static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

        [DllImport("user32.dll")]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern int GetWindowTextLength(IntPtr hWnd);

        public static List<DiscoveredAppDto> DiscoverRunningApplications(HashSet<string>? prohibitedExecutables = null)
        {
            var appMap = new Dictionary<string, DiscoveredAppDto>(StringComparer.OrdinalIgnoreCase);
            IntPtr foregroundHwnd = GetForegroundWindow();

            try
            {
                EnumWindows((hWnd, lParam) =>
                {
                    if (!IsWindowVisible(hWnd)) return true;

                    int length = GetWindowTextLength(hWnd);
                    if (length == 0) return true;

                    var builder = new StringBuilder(length + 1);
                    GetWindowText(hWnd, builder, builder.Capacity);
                    string title = builder.ToString().Trim();

                    if (string.IsNullOrWhiteSpace(title) || title == "Program Manager" || title == "Settings")
                        return true;

                    GetWindowThreadProcessId(hWnd, out uint processId);
                    if (processId == 0) return true;

                    try
                    {
                        using var proc = Process.GetProcessById((int)processId);
                        string procName = (proc.ProcessName + ".exe").ToLowerInvariant();
                        string mainModulePath = string.Empty;
                        try { mainModulePath = proc.MainModule?.FileName ?? string.Empty; } catch { }

                        if (!appMap.TryGetValue(procName, out var appDto))
                        {
                            string publisher = "Unsigned / Local Application";
                            bool verified = false;

                            if (!string.IsNullOrEmpty(mainModulePath) && File.Exists(mainModulePath))
                            {
                                try
                                {
                                    var cert = X509Certificate.CreateFromSignedFile(mainModulePath);
                                    publisher = cert.Subject;
                                    verified = true;
                                }
                                catch { }
                            }

                            string policy = "ALLOW";
                            if (prohibitedExecutables != null && prohibitedExecutables.Contains(procName))
                            {
                                policy = "DENY";
                            }

                            appDto = new DiscoveredAppDto
                            {
                                ApplicationId = $"app-{procName}",
                                DisplayName = proc.MainWindowTitle.Length > 0 ? proc.MainWindowTitle : proc.ProcessName,
                                ProcessName = procName,
                                Publisher = publisher,
                                PublisherVerified = verified,
                                Policy = policy,
                                Windows = new List<DiscoveredWindowDto>()
                            };
                            appMap[procName] = appDto;
                        }

                        appDto.Windows.Add(new DiscoveredWindowDto
                        {
                            WindowId = $"win-{hWnd.ToInt64()}",
                            Title = title,
                            IsForeground = (hWnd == foregroundHwnd),
                            CaptureAllowed = appDto.Policy != "DENY"
                        });
                    }
                    catch { }

                    return true;
                }, IntPtr.Zero);
            }
            catch { }

            // Fallback for non-interactive / headless sessions where top-level GUI windows are not attached to window station
            if (appMap.Count == 0)
            {
                foreach (var proc in Process.GetProcesses())
                {
                    try
                    {
                        string procName = (proc.ProcessName + ".exe").ToLowerInvariant();
                        if (procName == "system.exe" || procName == "idle.exe" || procName.StartsWith("svchost")) continue;

                        if (!appMap.TryGetValue(procName, out var appDto))
                        {
                            string publisher = "Microsoft Corporation / Verified OS Runtime";
                            bool verified = false;
                            string mainModulePath = string.Empty;
                            try { mainModulePath = proc.MainModule?.FileName ?? string.Empty; } catch { }

                            if (!string.IsNullOrEmpty(mainModulePath) && File.Exists(mainModulePath))
                            {
                                try
                                {
                                    var cert = X509Certificate.CreateFromSignedFile(mainModulePath);
                                    publisher = cert.Subject;
                                    verified = true;
                                }
                                catch { }
                            }

                            string policy = "ALLOW";
                            if (prohibitedExecutables != null && prohibitedExecutables.Contains(procName))
                            {
                                policy = "DENY";
                            }

                            string displayName = !string.IsNullOrEmpty(proc.MainWindowTitle)
                                ? proc.MainWindowTitle
                                : char.ToUpper(proc.ProcessName[0]) + proc.ProcessName.Substring(1);

                            appDto = new DiscoveredAppDto
                            {
                                ApplicationId = $"app-{procName}",
                                DisplayName = displayName,
                                ProcessName = procName,
                                Publisher = publisher,
                                PublisherVerified = verified,
                                Policy = policy,
                                Windows = new List<DiscoveredWindowDto>
                                {
                                    new DiscoveredWindowDto
                                    {
                                        WindowId = $"win-{proc.Id}",
                                        Title = displayName,
                                        IsForeground = false,
                                        CaptureAllowed = policy != "DENY"
                                    }
                                }
                            };
                            appMap[procName] = appDto;
                        }
                    }
                    catch { }
                }
            }

            return new List<DiscoveredAppDto>(appMap.Values);
        }
    }
}
