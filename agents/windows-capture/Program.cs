using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace ArchitectIQ.Capture.Agent
{
    public static class Program
    {
        [STAThread]
        public static void Main(string[] args)
        {
            Application.SetHighDpiMode(HighDpiMode.PerMonitorV2);
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            Console.WriteLine("=========================================================");
            Console.WriteLine("  ArchitectIQ Windows Process Capture Agent (PCA-01)");
            Console.WriteLine("  Governed Process Intelligence & Native Capture Runtime");
            Console.WriteLine("=========================================================");

            var config = LoadOrCreateConfig();

            // Check if enrollment is needed
            var enrollmentClient = new EnrollmentClient(config.ServerUrl);
            enrollmentClient.LogMessage += Console.WriteLine;

            if (enrollmentClient.TryLoadStoredToken(out var token, out var agentId, out var tenantId))
            {
                config.PairingToken = token;
                if (agentId.HasValue) config.AgentId = agentId;
                if (tenantId.HasValue) config.TenantId = tenantId.Value;
                Console.WriteLine($"[PCS Agent] Device authenticated for Tenant: {config.TenantId}");
            }
            else
            {
                Console.WriteLine("[PCS Agent] Device not yet enrolled. Starting RFC 8628 activation flow...");
                var enrollTask = Task.Run(async () =>
                {
                    var res = await enrollmentClient.StartInteractiveEnrollmentAsync(
                        config.AgentHostname,
                        config.HardwareFingerprint ?? "hw_unknown");

                    if (res != null)
                    {
                        config.PairingToken = res.access_token;
                        if (Guid.TryParse(res.agent_id, out var aid)) config.AgentId = aid;
                        if (Guid.TryParse(res.tenant_id, out var tid)) config.TenantId = tid;
                    }
                });
                enrollTask.Wait();
            }

            var offlineBuffer = new OfflineBuffer();
            offlineBuffer.LogMessage += Console.WriteLine;

            using var uploader = new EvidenceUploader(config);
            uploader.LogMessage += Console.WriteLine;
            uploader.Start();

            using var recorder = new AutomationRecorder(uploader);
            recorder.LogMessage += Console.WriteLine;

            var banner = new ConsentBanner(recorder);
            banner.StopRequested += () =>
            {
                recorder.Stop();
                banner.HideBanner();
                Console.WriteLine("[PCS Agent] Operator manually terminated recording from sticky banner.");
            };

            recorder.RecordingStateChanged += isRecording =>
            {
                banner.Invoke((MethodInvoker)delegate
                {
                    if (isRecording)
                        banner.ShowBanner();
                    else
                        banner.HideBanner();
                });
            };

            // Start background heartbeat loop
            var cts = new CancellationTokenSource();
            Task.Run(() => HeartbeatLoopAsync(config, recorder, uploader, banner, cts.Token));

            // Run with System Tray Application Context
            var trayContext = new TrayApplicationContext(recorder, config);
            Application.Run(trayContext);

            cts.Cancel();
        }

        private static AgentConfig LoadOrCreateConfig()
        {
            string configPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "agent-config.json");
            AgentConfig config;

            if (File.Exists(configPath))
            {
                string json = File.ReadAllText(configPath);
                config = JsonSerializer.Deserialize<AgentConfig>(json) ?? new AgentConfig();
            }
            else
            {
                config = new AgentConfig
                {
                    ServerUrl = "http://localhost:8000",
                    TenantId = Guid.Empty, // Populated during enrollment
                    HardwareFingerprint = GenerateHardwareFingerprint(),
                };
                File.WriteAllText(configPath, JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true }));
            }

            if (string.IsNullOrEmpty(config.HardwareFingerprint))
            {
                config.HardwareFingerprint = GenerateHardwareFingerprint();
            }

            return config;
        }

        private static string GenerateHardwareFingerprint()
        {
            using var sha = SHA256.Create();
            string raw = $"{Environment.MachineName}-{Environment.UserName}-{Environment.ProcessorCount}-{Environment.OSVersion}";
            byte[] bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(raw));
            return BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant().Substring(0, 32);
        }

        private static async Task HeartbeatLoopAsync(
            AgentConfig config,
            AutomationRecorder recorder,
            EvidenceUploader uploader,
            ConsentBanner banner,
            CancellationToken ct)
        {
            using var client = new HttpClient();
            client.Timeout = TimeSpan.FromSeconds(5);

            while (!ct.IsCancellationRequested)
            {
                try
                {
                    if (config.AgentId.HasValue && !string.IsNullOrEmpty(config.PairingToken))
                    {
                        var req = new AgentHeartbeatRequest
                        {
                            AgentId = config.AgentId.Value,
                            PairingToken = config.PairingToken ?? string.Empty,
                            Status = "ONLINE",
                            ActiveSessionId = recorder.CurrentSessionId,
                        };

                        var json = JsonSerializer.Serialize(req);
                        var content = new StringContent(json, Encoding.UTF8, "application/json");

                        var url = $"{config.ServerUrl}/api/v1/capture/agents/{config.AgentId.Value}/heartbeat";
                        var resp = await client.PostAsync(url, content, ct);

                        if (resp.IsSuccessStatusCode)
                        {
                            var respJson = await resp.Content.ReadAsStringAsync(ct);
                            var ack = JsonSerializer.Deserialize<AgentHeartbeatResponse>(respJson);

                            // Handle remote control command dispatch from ArchitectIQ
                            if (ack?.Command == "START" && ack.Session != null)
                            {
                                recorder.StartSession(
                                    ack.Session.SessionId,
                                    ack.Session.TargetApplication,
                                    ack.Session.SecurityExclusions);
                            }
                            else if (ack?.Command == "PAUSE")
                            {
                                recorder.Pause();
                            }
                            else if (ack?.Command == "RESUME")
                            {
                                recorder.Resume();
                            }
                            else if (ack?.Command == "STOP")
                            {
                                recorder.Stop();
                            }
                        }
                    }
                }
                catch (Exception ex)
                {
                    // Fail-silent in background loop
                }

                await Task.Delay(5000, ct);
            }
        }
    }
}
