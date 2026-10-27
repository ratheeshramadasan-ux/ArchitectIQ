using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace ArchitectIQ.Capture.Agent
{
    public class AgentConfig
    {
        public string ServerUrl { get; set; } = "http://localhost:8000";
        public Guid TenantId { get; set; }
        public string AgentHostname { get; set; } = Environment.MachineName;
        public string OsVersion { get; set; } = Environment.OSVersion.ToString();
        public string AgentVersion { get; set; } = "1.0.0";
        public string? HardwareFingerprint { get; set; }
        public string? PairingToken { get; set; }
        public Guid? AgentId { get; set; }
    }

    public class AgentRegisterRequest
    {
        [JsonPropertyName("tenant_id")]
        public Guid TenantId { get; set; }

        [JsonPropertyName("agent_hostname")]
        public string AgentHostname { get; set; } = string.Empty;

        [JsonPropertyName("os_version")]
        public string OsVersion { get; set; } = string.Empty;

        [JsonPropertyName("agent_version")]
        public string AgentVersion { get; set; } = "1.0.0";

        [JsonPropertyName("hardware_fingerprint")]
        public string HardwareFingerprint { get; set; } = string.Empty;

        [JsonPropertyName("capabilities")]
        public Dictionary<string, object> Capabilities { get; set; } = new();
    }

    public class AgentRegisterResponse
    {
        [JsonPropertyName("agent_id")]
        public Guid AgentId { get; set; }

        [JsonPropertyName("pairing_token")]
        public string PairingToken { get; set; } = string.Empty;

        [JsonPropertyName("agent_hostname")]
        public string AgentHostname { get; set; } = string.Empty;

        [JsonPropertyName("status")]
        public string Status { get; set; } = string.Empty;
    }

    public class AgentHeartbeatRequest
    {
        [JsonPropertyName("agent_id")]
        public Guid AgentId { get; set; }

        [JsonPropertyName("pairing_token")]
        public string PairingToken { get; set; } = string.Empty;

        [JsonPropertyName("status")]
        public string Status { get; set; } = "ONLINE";

        [JsonPropertyName("active_session_id")]
        public Guid? ActiveSessionId { get; set; }

        [JsonPropertyName("metrics")]
        public Dictionary<string, object> Metrics { get; set; } = new();
    }

    public class AgentHeartbeatResponse
    {
        [JsonPropertyName("status")]
        public string Status { get; set; } = string.Empty;

        [JsonPropertyName("acknowledged_at")]
        public string AcknowledgedAt { get; set; } = string.Empty;

        [JsonPropertyName("command")]
        public string? Command { get; set; }

        [JsonPropertyName("session")]
        public SessionDetails? Session { get; set; }
    }

    public class SessionDetails
    {
        [JsonPropertyName("session_id")]
        public Guid SessionId { get; set; }

        [JsonPropertyName("status")]
        public string Status { get; set; } = string.Empty;

        [JsonPropertyName("target_application")]
        public string? TargetApplication { get; set; }

        [JsonPropertyName("security_exclusions")]
        public Dictionary<string, object>? SecurityExclusions { get; set; }
    }

    public class CaptureEvidenceUpload
    {
        [JsonPropertyName("evidence_type")]
        public string EvidenceType { get; set; } = "KEYFRAME";

        [JsonPropertyName("mime_type")]
        public string MimeType { get; set; } = "image/png";

        [JsonPropertyName("base64_data")]
        public string Base64Data { get; set; } = string.Empty;

        [JsonPropertyName("sha256_hash")]
        public string Sha256Hash { get; set; } = string.Empty;

        [JsonPropertyName("byte_size")]
        public int ByteSize { get; set; }

        [JsonPropertyName("metadata")]
        public Dictionary<string, object> Metadata { get; set; } = new();
    }

    public class CaptureEventItemDto
    {
        [JsonPropertyName("monotonic_offset_ms")]
        public long MonotonicOffsetMs { get; set; }

        [JsonPropertyName("sequence_number")]
        public int SequenceNumber { get; set; }

        [JsonPropertyName("event_type")]
        public string EventType { get; set; } = string.Empty;

        [JsonPropertyName("process_name")]
        public string ProcessName { get; set; } = string.Empty;

        [JsonPropertyName("window_title")]
        public string WindowTitle { get; set; } = string.Empty;

        [JsonPropertyName("window_class")]
        public string? WindowClass { get; set; }

        [JsonPropertyName("ui_element_metadata")]
        public Dictionary<string, object> UiElementMetadata { get; set; } = new();

        [JsonPropertyName("interaction_coordinates")]
        public Dictionary<string, int>? InteractionCoordinates { get; set; }

        [JsonPropertyName("evidence_id")]
        public Guid? EvidenceId { get; set; }

        [JsonPropertyName("is_redacted")]
        public bool IsRedacted { get; set; }

        [JsonPropertyName("redaction_reason")]
        public string? RedactionReason { get; set; }
    }

    public class CaptureEventBatchRequest
    {
        [JsonPropertyName("events")]
        public List<CaptureEventItemDto> Events { get; set; } = new();
    }
}
