using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace ArchitectIQ.Capture.Agent
{
    public class EvidenceUploader : IDisposable
    {
        private readonly HttpClient _httpClient;
        private readonly AgentConfig _config;
        private readonly ConcurrentQueue<(Guid SessionId, CaptureEventItemDto Event)> _eventQueue = new();
        private readonly CancellationTokenSource _cts = new();
        private Task? _flushTask;

        public event Action<string>? LogMessage;

        public EvidenceUploader(AgentConfig config)
        {
            _config = config;
            _httpClient = new HttpClient
            {
                BaseAddress = new Uri(config.ServerUrl),
                Timeout = TimeSpan.FromSeconds(30)
            };
            if (!string.IsNullOrEmpty(config.PairingToken))
            {
                _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", config.PairingToken);
            }
        }

        public void UpdateToken(string token)
        {
            _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
        }

        public void Start()
        {
            _flushTask = Task.Run(FlushLoopAsync);
        }

        public void EnqueueEvent(Guid sessionId, CaptureEventItemDto eventDto)
        {
            _eventQueue.Enqueue((sessionId, eventDto));
        }

        public Guid? UploadEvidenceSync(Guid sessionId, CaptureEvidenceUpload evidence)
        {
            try
            {
                string json = JsonSerializer.Serialize(evidence);
                using var content = new StringContent(json, Encoding.UTF8, "application/json");

                var response = _httpClient.PostAsync($"/api/v1/capture/sessions/{sessionId}/evidence", content).GetAwaiter().GetResult();
                if (response.IsSuccessStatusCode)
                {
                    string respBody = response.Content.ReadAsStringAsync().GetAwaiter().GetResult();
                    using var doc = JsonDocument.Parse(respBody);
                    if (doc.RootElement.TryGetProperty("evidence_id", out var evIdProp))
                    {
                        return Guid.Parse(evIdProp.GetString()!);
                    }
                }
                else
                {
                    LogMessage?.Invoke($"[PCS Uploader] Evidence upload returned {(int)response.StatusCode}: {response.ReasonPhrase}");
                }
            }
            catch (Exception ex)
            {
                LogMessage?.Invoke($"[PCS Uploader] Failed to upload evidence: {ex.Message}");
            }
            return null;
        }

        private async Task FlushLoopAsync()
        {
            var batchMap = new Dictionary<Guid, List<CaptureEventItemDto>>();

            while (!_cts.Token.IsCancellationRequested)
            {
                try
                {
                    await Task.Delay(1000, _cts.Token);

                    batchMap.Clear();
                    while (_eventQueue.TryDequeue(out var item))
                    {
                        if (!batchMap.TryGetValue(item.SessionId, out var list))
                        {
                            list = new List<CaptureEventItemDto>();
                            batchMap[item.SessionId] = list;
                        }
                        list.Add(item.Event);

                        if (list.Count >= 50)
                            break;
                    }

                    foreach (var kvp in batchMap)
                    {
                        var sessionId = kvp.Key;
                        var batch = kvp.Value;
                        if (batch.Count == 0) continue;

                        var req = new CaptureEventBatchRequest { Events = batch };
                        string json = JsonSerializer.Serialize(req);
                        using var content = new StringContent(json, Encoding.UTF8, "application/json");

                        var resp = await _httpClient.PostAsync($"/api/v1/capture/sessions/{sessionId}/events", content, _cts.Token);
                        if (!resp.IsSuccessStatusCode)
                        {
                            LogMessage?.Invoke($"[PCS Uploader] Batch event ingest error: {resp.StatusCode}");
                        }
                        else
                        {
                            LogMessage?.Invoke($"[PCS Uploader] Ingested {batch.Count} events for session {sessionId}.");
                        }
                    }
                }
                catch (OperationCanceledException) { break; }
                catch (Exception ex)
                {
                    LogMessage?.Invoke($"[PCS Uploader] Flush loop error: {ex.Message}");
                }
            }
        }

        public void Dispose()
        {
            _cts.Cancel();
            try { _flushTask?.Wait(2000); } catch { }
            _httpClient.Dispose();
        }
    }
}
