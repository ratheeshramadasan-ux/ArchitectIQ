with open("agents/windows-capture/Program.cs", "r", encoding="utf-8") as f:
    text = f.read()

old = """                        var req = new AgentHeartbeatRequest
                        {
                            Status = "ONLINE",
                        };"""

new = """                        var req = new AgentHeartbeatRequest
                        {
                            AgentId = config.AgentId.Value,
                            PairingToken = config.PairingToken ?? string.Empty,
                            Status = "ONLINE",
                            ActiveSessionId = recorder.CurrentSessionId,
                        };"""

assert old in text, "Target not found in Program.cs"
text = text.replace(old, new, 1)

with open("agents/windows-capture/Program.cs", "w", encoding="utf-8") as f:
    f.write(text)

print("Program.cs updated successfully")
