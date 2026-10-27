using System;
using System.Collections.Concurrent;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;

namespace ArchitectIQ.Capture.Agent
{
    public class OfflineBuffer
    {
        private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("ArchitectIQ-Spool-Entropy-v1");
        private readonly string _bufferDirectory;
        private readonly ConcurrentQueue<string> _memoryQueue = new();
        private readonly long _maxDiskQuotaBytes;
        private long _currentDiskUsageBytes;

        public event Action<string>? LogMessage;

        public OfflineBuffer(long maxDiskQuotaBytes = 2L * 1024 * 1024 * 1024) // 2 GB ceiling
        {
            _maxDiskQuotaBytes = maxDiskQuotaBytes;
            _bufferDirectory = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "spool");
            if (!Directory.Exists(_bufferDirectory))
            {
                Directory.CreateDirectory(_bufferDirectory);
            }
            RecalculateDiskUsage();
        }

        public void EnqueueEvent(Guid sessionId, CaptureEventItemDto eventItem)
        {
            try
            {
                string json = JsonSerializer.Serialize(new
                {
                    SessionId = sessionId,
                    Timestamp = DateTime.UtcNow,
                    Event = eventItem
                });

                if (_memoryQueue.Count < 1000)
                {
                    _memoryQueue.Enqueue(json);
                }
                else
                {
                    SpoolToDisk(json);
                }
            }
            catch (Exception ex)
            {
                LogMessage?.Invoke($"[OfflineBuffer] Error enqueuing event: {ex.Message}");
            }
        }

        private void SpoolToDisk(string content)
        {
            if (_currentDiskUsageBytes >= _maxDiskQuotaBytes)
            {
                LogMessage?.Invoke("[OfflineBuffer] Warning: Spool quota ceiling reached. Dropping oldest uncommitted buffer file.");
                EvictOldestSpoolFile();
            }

            try
            {
                byte[] plainBytes = Encoding.UTF8.GetBytes(content);
                byte[] cipherBytes = ProtectedData.Protect(plainBytes, Entropy, DataProtectionScope.CurrentUser);

                string filename = $"spool_{DateTime.UtcNow.Ticks}_{Guid.NewGuid():N}.enc";
                string path = Path.Combine(_bufferDirectory, filename);
                File.WriteAllBytes(path, cipherBytes);
                Interlocked.Add(ref _currentDiskUsageBytes, cipherBytes.Length);
            }
            catch (Exception ex)
            {
                LogMessage?.Invoke($"[OfflineBuffer] Error encrypting/spooling to disk: {ex.Message}");
            }
        }

        private static void SecureDeleteFile(string path)
        {
            try
            {
                if (File.Exists(path))
                {
                    long length = new FileInfo(path).Length;
                    if (length > 0)
                    {
                        byte[] zeroBytes = new byte[length];
                        File.WriteAllBytes(path, zeroBytes);
                    }
                    File.Delete(path);
                }
            }
            catch { }
        }

        private void EvictOldestSpoolFile()
        {
            try
            {
                var files = new DirectoryInfo(_bufferDirectory).GetFiles("spool_*.enc");
                if (files.Length > 0)
                {
                    Array.Sort(files, (a, b) => a.CreationTimeUtc.CompareTo(b.CreationTimeUtc));
                    long len = files[0].Length;
                    SecureDeleteFile(files[0].FullName);
                    Interlocked.Add(ref _currentDiskUsageBytes, -len);
                }
            }
            catch { }
        }

        private void RecalculateDiskUsage()
        {
            try
            {
                long total = 0;
                var files = Directory.GetFiles(_bufferDirectory, "spool_*.enc");
                foreach (var f in files)
                {
                    total += new FileInfo(f).Length;
                }
                _currentDiskUsageBytes = total;
            }
            catch
            {
                _currentDiskUsageBytes = 0;
            }
        }

        public bool TryDequeue(out string? json)
        {
            if (_memoryQueue.TryDequeue(out json))
            {
                return true;
            }

            // Fallback: read oldest from disk, decrypt with DPAPI, securely wipe disk
            try
            {
                var files = Directory.GetFiles(_bufferDirectory, "spool_*.enc");
                if (files.Length > 0)
                {
                    Array.Sort(files);
                    string target = files[0];
                    long len = new FileInfo(target).Length;
                    byte[] cipherBytes = File.ReadAllBytes(target);
                    byte[] plainBytes = ProtectedData.Unprotect(cipherBytes, Entropy, DataProtectionScope.CurrentUser);
                    json = Encoding.UTF8.GetString(plainBytes);

                    SecureDeleteFile(target);
                    Interlocked.Add(ref _currentDiskUsageBytes, -len);
                    return true;
                }
            }
            catch (Exception ex)
            {
                LogMessage?.Invoke($"[OfflineBuffer] Error reading/decrypting spool file: {ex.Message}");
            }

            json = null;
            return false;
        }
    }
}
