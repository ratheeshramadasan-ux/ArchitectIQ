using System;
using System.Drawing;
using System.Windows.Forms;

namespace ArchitectIQ.Capture.Agent
{
    public class ConsentBanner : Form
    {
        private readonly Label _statusLabel;
        private readonly Label _timerLabel;
        private readonly Button _pauseResumeBtn;
        private readonly Button _stopBtn;
        private readonly System.Windows.Forms.Timer _tickTimer;
        private readonly AutomationRecorder _recorder;

        private DateTime _recordStartTime;
        private bool _isPaused;

        public event Action? StopRequested;

        public ConsentBanner(AutomationRecorder recorder)
        {
            _recorder = recorder;

            // Form properties
            FormBorderStyle = FormBorderStyle.None;
            StartPosition = FormStartPosition.Manual;
            TopMost = true;
            ShowInTaskbar = false;
            Size = new Size(420, 48);
            BackColor = Color.FromArgb(24, 24, 27); // Dark gray/zinc-900

            // Position at top center of primary screen
            var screen = Screen.PrimaryScreen?.Bounds ?? new Rectangle(0, 0, 1920, 1080);
            Location = new Point((screen.Width - Width) / 2, 10);

            // Red Recording Pill / Indicator
            var redDot = new Panel
            {
                Size = new Size(12, 12),
                Location = new Point(14, 18),
                BackColor = Color.FromArgb(239, 68, 68), // Bright red
            };

            _statusLabel = new Label
            {
                Text = "ArchitectIQ RECORDING",
                ForeColor = Color.White,
                Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
                Location = new Point(34, 15),
                AutoSize = true
            };

            _timerLabel = new Label
            {
                Text = "00:00.0",
                ForeColor = Color.FromArgb(161, 161, 170),
                Font = new Font("Consolas", 10f, FontStyle.Regular),
                Location = new Point(200, 15),
                AutoSize = true
            };

            _pauseResumeBtn = new Button
            {
                Text = "Pause",
                ForeColor = Color.White,
                BackColor = Color.FromArgb(39, 39, 42),
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 8.5f),
                Size = new Size(60, 28),
                Location = new Point(280, 10)
            };
            _pauseResumeBtn.FlatAppearance.BorderSize = 0;
            _pauseResumeBtn.Click += OnPauseResumeClicked;

            _stopBtn = new Button
            {
                Text = "Stop",
                ForeColor = Color.White,
                BackColor = Color.FromArgb(220, 38, 38), // Red
                FlatStyle = FlatStyle.Flat,
                Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
                Size = new Size(58, 28),
                Location = new Point(348, 10)
            };
            _stopBtn.FlatAppearance.BorderSize = 0;
            _stopBtn.Click += (s, e) => StopRequested?.Invoke();

            Controls.Add(redDot);
            Controls.Add(_statusLabel);
            Controls.Add(_timerLabel);
            Controls.Add(_pauseResumeBtn);
            Controls.Add(_stopBtn);

            _tickTimer = new System.Windows.Forms.Timer { Interval = 100 };
            _tickTimer.Tick += (s, e) =>
            {
                if (!_isPaused)
                {
                    var elapsed = DateTime.UtcNow - _recordStartTime;
                    _timerLabel.Text = $"{elapsed.Minutes:00}:{elapsed.Seconds:00}.{elapsed.Milliseconds / 100}";
                }
            };
        }

        public void ShowBanner()
        {
            _recordStartTime = DateTime.UtcNow;
            _isPaused = false;
            _pauseResumeBtn.Text = "Pause";
            _statusLabel.Text = "ArchitectIQ RECORDING";
            _tickTimer.Start();
            Show();
        }

        public void HideBanner()
        {
            _tickTimer.Stop();
            Hide();
        }

        private void OnPauseResumeClicked(object? sender, EventArgs e)
        {
            if (_isPaused)
            {
                _isPaused = false;
                _pauseResumeBtn.Text = "Pause";
                _statusLabel.Text = "ArchitectIQ RECORDING";
                _recorder.Resume();
            }
            else
            {
                _isPaused = true;
                _pauseResumeBtn.Text = "Resume";
                _statusLabel.Text = "PAUSED";
                _recorder.Pause();
            }
        }
    }
}
