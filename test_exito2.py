import re
with open('exito.html', 'r', encoding='utf-8') as f: html = f.read()
matches = re.findall(r'<a[^>]+href="([^"]+)"', html)
exito_links = [m for m in matches if '/p' in m or 'celular' in m.lower()]
print(f"Exito links: {len(exito_links)}")
for l in exito_links[:5]: print(l)
