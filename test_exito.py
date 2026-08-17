import re

with open('exito.html', 'r', encoding='utf-8') as f:
    html = f.read()

# search for "name": "Celular Motorola" or similar
matches = re.findall(r'"name":"[^"]*Motorola[^"]*"', html, re.IGNORECASE)
print(f"Found {len(matches)} matches for name:")
for m in matches[:5]: print(m)

# search for JSON blobs
json_scripts = re.findall(r'<script[^>]*>({[\s\S]*?})</script>', html)
print(f"Found {len(json_scripts)} JSON scripts")

