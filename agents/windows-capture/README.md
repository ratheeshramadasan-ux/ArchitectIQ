# ArchitectIQ Windows Process Capture Agent (PCS-01)

The **ArchitectIQ Windows Process Capture Agent** is a governed native desktop recording and process-discovery service integrated into the ArchitectIQ platform.

---

## Architectural Principles

1. **Native Windows Engine, Not REA:**
   - **REA (Reverse Engineer Anything)** is an optional developer investigation CLI tool used solely for internal static exploration. It is **never** invoked or required as a runtime recording engine.
   - The runtime recording engine is this native .NET 6.0 Windows desktop agent utilizing the official Microsoft Windows UI Automation (`UIAutomationClient`) framework and Win32 low-level event hooks.

2. **Zero Dummy Data & Tenant Scoping:**
   - Every captured session, event, and keyframe is cryptographically paired, authenticated via hardware fingerprinting, and scoped to the enterprise `tenant_id` in PostgreSQL.

3. **Enterprise Privacy & Security Guardrails:**
   - **Operator Consent:** A visible, floating, sticky recording banner with a glowing red indicator and high-contrast status text is displayed on top of all application windows throughout recording. The operator can pause, resume, or abort recording instantly.
   - **Password Field Sanitization:** Any element identified as a password field (`elem.Current.IsPassword == true`) has its text replaced with `[REDACTED_PASSWORD_FIELD]` and its screen coordinate bounding box occluded with an opaque black rectangle prior to evidence upload.
   - **Application Exclusions:** Password managers (e.g. `1Password`, `KeePass`, `Bitwarden`) and enterprise-excluded executables configured in the session policy are actively ignored and redacted.

4. **Monotonic Event Sequencing:**
   - Captures high-precision monotonic timestamps (`Stopwatch.ElapsedMilliseconds`) synchronized with screen keyframe captures, guaranteeing determinism when exported to Flow Studio.

---

## Directory Structure

```text
agents/windows-capture/
├── ArchitectIQ.Capture.Agent.csproj   # .NET 6.0 Windows desktop project definition
├── app.manifest                       # Per-monitor DPI awareness and execution level
├── Models.cs                          # Typed DTOs matching FastAPI /api/v1/capture
├── AutomationRecorder.cs              # Win32 hooks & UIAutomation capture engine
├── EvidenceUploader.cs                # Background queue, SHA-256 deduplication & TLS upload
├── ConsentBanner.cs                   # Top-level sticky consent & control banner
├── Program.cs                         # Entry point, hardware fingerprinting & heartbeat loop
└── README.md                          # Documentation and deployment manual
```

---

## Building and Running

### Prerequisites
- .NET 6.0 SDK or higher (`dotnet --version`)
- Windows 10/11 Enterprise or Professional

### Build
```powershell
cd agents/windows-capture
dotnet build -c Release
```

### Configuration (`agent-config.json`)
When first executed, the agent generates an `agent-config.json` file:
```json
{
  "ServerUrl": "http://localhost:8000",
  "TenantId": "242c817b-d701-4583-8e29-c22c99b381e6",
  "AgentHostname": "DESKTOP-OPERATOR-01",
  "OsVersion": "Microsoft Windows NT 10.0.22631.0",
  "AgentVersion": "1.0.0",
  "HardwareFingerprint": "a3f58912bc4d89..."
}
```

### Execution
```powershell
dotnet run
```
Once connected, the agent periodically heartbeats to `/api/v1/capture/agents/{id}/heartbeat`. When a capture session is initiated from the ArchitectIQ Web Studio, the server issues a `START_RECORDING` command, displaying the sticky consent banner and streaming user interactions and keyframes.
