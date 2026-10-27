with open("apps/api/process_capture.py", "r", encoding="utf-8") as f:
    text = f.read()

target = 'os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "web-studio", "public", "downloads", "ArchitectIQ-CaptureAgent-Setup.msi")),'
replacement = 'os.path.abspath(os.path.join(os.path.dirname(__file__), "downloads", "ArchitectIQ-CaptureAgent-Setup.msi")),\n        ' + target

assert target in text
text = text.replace(target, replacement, 1)

with open("apps/api/process_capture.py", "w", encoding="utf-8") as f:
    f.write(text)

print("process_capture.py candidate paths updated")
