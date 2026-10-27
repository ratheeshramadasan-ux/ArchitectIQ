using System;
using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;

namespace ArchitectIQ.Capture.Agent
{
    public class TrayApplicationContext : ApplicationContext
    {
        private readonly NotifyIcon _trayIcon;
        private readonly AutomationRecorder _recorder;
        private readonly AgentConfig _config;

        private ToolStripMenuItem _statusMenuItem = null!;
        private ToolStripMenuItem _pauseResumeMenuItem = null!;
        private ToolStripMenuItem _stopMenuItem = null!;

        public TrayApplicationContext(AutomationRecorder recorder, AgentConfig config)
        {
            _recorder = recorder;
            _config = config;

            var contextMenu = new ContextMenuStrip();

            var headerItem = new ToolStripMenuItem("ArchitectIQ Process Capture")
            {
                Enabled = false,
                Font = new Font(SystemFonts.DefaultFont, FontStyle.Bold)
            };
            contextMenu.Items.Add(headerItem);

            _statusMenuItem = new ToolStripMenuItem($"Endpoint: {config.AgentHostname} (Online)")
            {
                Enabled = false
            };
            contextMenu.Items.Add(_statusMenuItem);
            contextMenu.Items.Add(new ToolStripSeparator());

            _pauseResumeMenuItem = new ToolStripMenuItem("Pause Recording", null, OnPauseResumeClicked)
            {
                Enabled = false
            };
            contextMenu.Items.Add(_pauseResumeMenuItem);

            _stopMenuItem = new ToolStripMenuItem("Stop & Finalize", null, OnStopClicked)
            {
                Enabled = false
            };
            contextMenu.Items.Add(_stopMenuItem);
            contextMenu.Items.Add(new ToolStripSeparator());

            contextMenu.Items.Add(new ToolStripMenuItem("Open Process Capture Studio...", null, OnOpenStudioClicked));
            contextMenu.Items.Add(new ToolStripMenuItem("Diagnostics & Telemetry...", null, OnDiagnosticsClicked));
            contextMenu.Items.Add(new ToolStripSeparator());

            contextMenu.Items.Add(new ToolStripMenuItem("Exit Agent", null, OnExitClicked));

            _trayIcon = new NotifyIcon
            {
                Icon = SystemIcons.Shield,
                ContextMenuStrip = contextMenu,
                Text = "ArchitectIQ Process Capture Agent (Active)",
                Visible = true
            };

            _recorder.RecordingStateChanged += OnRecordingStateChanged;
        }

        private void OnRecordingStateChanged(bool isRecording)
        {
            if (_trayIcon.ContextMenuStrip?.InvokeRequired == true)
            {
                _trayIcon.ContextMenuStrip.Invoke((MethodInvoker)(() => UpdateRecordingUi(isRecording)));
            }
            else
            {
                UpdateRecordingUi(isRecording);
            }
        }

        private void UpdateRecordingUi(bool isRecording)
        {
            if (isRecording)
            {
                _trayIcon.Icon = SystemIcons.Warning;
                _trayIcon.Text = "ArchitectIQ: RECORDING ACTIVE";
                _statusMenuItem.Text = $"Status: RECORDING ({_config.AgentHostname})";
                _pauseResumeMenuItem.Enabled = true;
                _pauseResumeMenuItem.Text = "Pause Recording";
                _stopMenuItem.Enabled = true;
            }
            else
            {
                _trayIcon.Icon = SystemIcons.Shield;
                _trayIcon.Text = "ArchitectIQ Process Capture Agent (Online)";
                _statusMenuItem.Text = $"Endpoint: {_config.AgentHostname} (Online)";
                _pauseResumeMenuItem.Enabled = false;
                _pauseResumeMenuItem.Text = "Pause Recording";
                _stopMenuItem.Enabled = false;
            }
        }

        private void OnPauseResumeClicked(object? sender, EventArgs e)
        {
            if (_pauseResumeMenuItem.Text == "Pause Recording")
            {
                _recorder.Pause();
                _pauseResumeMenuItem.Text = "Resume Recording";
                _trayIcon.Text = "ArchitectIQ: Recording Paused";
            }
            else
            {
                _recorder.Resume();
                _pauseResumeMenuItem.Text = "Pause Recording";
                _trayIcon.Text = "ArchitectIQ: RECORDING ACTIVE";
            }
        }

        private void OnStopClicked(object? sender, EventArgs e)
        {
            _recorder.Stop();
        }

        private void OnOpenStudioClicked(object? sender, EventArgs e)
        {
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = "http://localhost:8080",
                    UseShellExecute = true
                });
            }
            catch (Exception ex)
            {
                MessageBox.Show($"Unable to open browser: {ex.Message}", "ArchitectIQ", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void OnDiagnosticsClicked(object? sender, EventArgs e)
        {
            using var currentProcess = Process.GetCurrentProcess();
            long memMb = currentProcess.WorkingSet64 / (1024 * 1024);

            string msg = $"ArchitectIQ Process Capture Agent v{_config.AgentVersion}\n" +
                         $"Hostname: {_config.AgentHostname}\n" +
                         $"Agent ID: {_config.AgentId}\n" +
                         $"Tenant ID: {_config.TenantId}\n" +
                         $"Hardware Fingerprint: {_config.HardwareFingerprint}\n" +
                         $"Working Memory: {memMb} MB\n" +
                         $"Server Endpoint: {_config.ServerUrl}\n\n" +
                         $"Security Status: Fail-closed PII protection active.";

            MessageBox.Show(msg, "Agent Diagnostics & Health", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        private void OnExitClicked(object? sender, EventArgs e)
        {
            _recorder.Stop();
            _trayIcon.Visible = false;
            Application.Exit();
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                _recorder.RecordingStateChanged -= OnRecordingStateChanged;
                _trayIcon.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
