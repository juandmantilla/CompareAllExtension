import re
with open('exito.html', 'r', encoding='utf-8') as f: html = f.read()
json_scripts = re.findall(r'<script[^>]*>({[\s\S]*?})</script>', html)
for i, s in enumerate(json_scripts):
    print(f"Script {i} length: {len(s)}")
    if 'motorola' in s.lower() or 'price' in s.lower():
        print(s[:500])
