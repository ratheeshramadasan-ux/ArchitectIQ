using System;
using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace ArchitectIQ.Capture.Agent
{
    public class EnrollmentInitiateResponse
    {
        public string device_code { get; set; } = string.Empty;
        public string user_code { get; set; } = string.Empty;
        public string verification_uri { get; set; } = string.Empty;
        public string verification_uri_complete { get; set; } = string.Empty;
        public int expires_in { get; set; } = 900;
        public int interval { get; set; } = 5;
    }

    public class EnrollmentTokenResponse
    {
        public string access_token { get; set; } = string.Empty;
        public string token_type { get; set; } = "Bearer";
        public string agent_id { get; set; } = string.Empty;
        public string tenant_id { get; set; } = string.Empty;
        public string agent_hostname { get; set; } = string.Empty;
        public string status { get; set; } = string.Empty;
    }

    public class EnrollmentClient
    {
        private readonly string _serverUrl;
        private readonly HttpClient _http;
        private readonly string _tokenStoragePath;

        public event Action<string>? LogMessage;

        public EnrollmentClient(string serverUrl)
        {
            _serverUrl = serverUrl.TrimEnd('/');
            _http = new HttpClient();
            _tokenStoragePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "agent-auth.dat");
        }

        public bool TryLoadStoredToken(out string? token, out Guid? agentId, out Guid? tenantId)
        {
            token = null;
            agentId = null;
            tenantId = null;

            if (!File.Exists(_tokenStoragePath))
                return false;

            try
            {
                byte[] encrypted = File.ReadAllBytes(_tokenStoragePath);
                byte[] raw = ProtectedData.Unprotect(encrypted, null, DataProtectionScope.CurrentUser);
                string json = Encoding.UTF8.GetString(raw);
                var doc = JsonSerializer.Deserialize<EnrollmentTokenResponse>(json);
                if (doc != null && !string.IsNullOrEmpty(doc.access_token))
                {
                    token = doc.access_token;
                    if (Guid.TryParse(doc.agent_id, out var aid)) agentId = aid;
                    if (Guid.TryParse(doc.tenant_id, out var tid)) tenantId = tid;
                    return true;
                }
            }
            catch (Exception ex)
            {
                LogMessage?.Invoke($"[Enrollment] Failed to decrypt stored token: {ex.Message}");
            }

            return false;
        }

        public async Task<EnrollmentTokenResponse?> StartInteractiveEnrollmentAsync(
            string hostname,
            string hardwareFingerprint,
            CancellationToken ct = default)
        {
            LogMessage?.Invoke("[Enrollment] Initiating RFC 8628 Device Authorization Flow...");

            var reqBody = new
            {
                agent_hostname = hostname,
                hardware_fingerprint = hardwareFingerprint,
                os_name = "Windows",
                os_version = Environment.OSVersion.ToString(),
                agent_version = "1.0.0"
            };

            var postContent = new StringContent(
                JsonSerializer.Serialize(reqBody),
                Encoding.UTF8,
                "application/json");

            var resp = await _http.PostAsync($"{_serverUrl}/api/v1/capture/agents/enroll", postContent, ct);
            if (!resp.IsSuccessStatusCode)
            {
                LogMessage?.Invoke($"[Enrollment] Failed to initiate enrollment: {resp.StatusCode}");
                return null;
            }

            var respString = await resp.Content.ReadAsStringAsync(ct);
            var initData = JsonSerializer.Deserialize<EnrollmentInitiateResponse>(respString);
            if (initData == null) return null;

            LogMessage?.Invoke($"============================================================");
            LogMessage?.Invoke($"  ArchitectIQ Device Pairing Code: {initData.user_code}");
            LogMessage?.Invoke($"  Activation URL: {initData.verification_uri_complete}");
            LogMessage?.Invoke($"============================================================");

            // Launch system default browser to activation URL
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = initData.verification_uri_complete,
                    UseShellExecute = true
                });
            }
            catch
            {
                LogMessage?.Invoke("[Enrollment] Please open the activation URL manually in your browser.");
            }

            // Poll for operator authorization
            int pollInterval = Math.Max(2, initData.interval);
            var deadline = DateTime.UtcNow.AddSeconds(initData.expires_in);

            while (DateTime.UtcNow < deadline && !ct.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(pollInterval), ct);

                var tokenReq = new { device_code = initData.device_code };
                var tokenContent = new StringContent(
                    JsonSerializer.Serialize(tokenReq),
                    Encoding.UTF8,
                    "application/json");

                var tokenResp = await _http.PostAsync($"{_serverUrl}/api/v1/capture/agents/enroll/token", tokenContent, ct);
                if (tokenResp.IsSuccessStatusCode)
                {
                    var tokenJson = await tokenResp.Content.ReadAsStringAsync(ct);
                    var tokenData = JsonSerializer.Deserialize<EnrollmentTokenResponse>(tokenJson);
                    if (tokenData != null && !string.IsNullOrEmpty(tokenData.access_token))
                    {
                        // Securely store token with Windows DPAPI
                        byte[] raw = Encoding.UTF8.GetBytes(tokenJson);
                        byte[] encrypted = ProtectedData.Protect(raw, null, DataProtectionScope.CurrentUser);
                        File.WriteAllBytes(_tokenStoragePath, encrypted);

                        LogMessage?.Invoke($"[Enrollment] Device successfully paired to Tenant {tokenData.tenant_id}!");
                        return tokenData;
                    }
                }
            }

            LogMessage?.Invoke("[Enrollment] Pairing session expired or timed out.");
            return null;
        }
    }
}
