with open("scratch/pca01_acceptance_runner/Program.cs", "r", encoding="utf-8") as f:
    text = f.read()

target1 = 'Guid.Parse("11111111-1111-1111-1111-111111111111")'
replacement1 = 'Guid.Parse("11520c5a-d1f3-4b28-b180-a9a87ef7610b")'

target2 = '"Bearer test-dev-bypass-token"'
replacement2 = '"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhcmNoaXRlY3RpcS1uYXRpdmUiLCJhdWQiOiJhcmNoaXRlY3RpcS1hcGkiLCJzdWIiOiJhMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDIiLCJqdGkiOiJiMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJpYXQiOjE3OTMxMTY4NTIsImV4cCI6MTc5MzIwMzI1Mn0.QnTf8DyY6X57SZPokFo1cdU5Kx-Z4iSWCLtPzHFNH48"'

assert target1 in text, "target1 not found"
assert target2 in text, "target2 not found"

text = text.replace(target1, replacement1, 1)
text = text.replace(target2, replacement2)

with open("scratch/pca01_acceptance_runner/Program.cs", "w", encoding="utf-8") as f:
    f.write(text)

print("Runner updated with live tenant and auth token")
