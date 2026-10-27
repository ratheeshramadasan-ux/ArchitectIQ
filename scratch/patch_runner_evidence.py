with open("scratch/pca01_acceptance_runner/Program.cs", "r", encoding="utf-8") as f:
    text = f.read()

target = """                var evidenceReq = new
                {
                    session_id = sessionId,
                    evidence_type = "SCREENSHOT",
                    sha256_checksum = sha256,
                    file_size_bytes = screenshotBytes.Length,
                    storage_uri = $"capture/{sessionId}/screenshot_{DateTime.UtcNow.Ticks}.png",
                    storage_tier = "HOT",
                    is_encrypted = true,
                    encryption_algorithm = "AES_256_GCM"
                };

                var evMsg = new HttpRequestMessage(HttpMethod.Post, "/api/v1/capture/evidence")"""

replacement = """                var evidenceReq = new
                {
                    sequence_number = 1,
                    evidence_type = "SCREENSHOT",
                    content_type = "image/png",
                    file_size_bytes = screenshotBytes.Length,
                    sha256_hash = sha256,
                    data_base64 = Convert.ToBase64String(screenshotBytes),
                    timestamp_offset_ms = 450
                };

                var evMsg = new HttpRequestMessage(HttpMethod.Post, $"/api/v1/capture/sessions/{sessionId}/evidence")"""

assert target in text, "evidence target not found"
text = text.replace(target, replacement, 1)

with open("scratch/pca01_acceptance_runner/Program.cs", "w", encoding="utf-8") as f:
    f.write(text)

print("Updated evidence upload endpoint in Program.cs")
