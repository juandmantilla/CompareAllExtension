import re
with open('alkosto.html', 'r', encoding='utf-8') as f: html = f.read()
linkRegex = re.compile(r'<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)</a>', re.IGNORECASE)
for url, content in linkRegex.findall(html):
    if re.search(r'alkosto\.com/.*?/p(?:/|\?|$)', url) or ('/p/' in url):
        full_match = re.search(r'<a[^>]+href="' + re.escape(url) + r'"[^>]*>', html).group(0)
        name = re.sub(r'<[^>]+>', ' ', content).strip()
        name = re.sub(r'\s+', ' ', name)
        titleMatch = re.search(r'title="([^"]+)"', full_match, re.IGNORECASE)
        if not name or len(name) < 5:
            if titleMatch: name = titleMatch.group(1)
        if 'motorola' in url.lower() or 'moto' in url.lower() or 'motorola' in name.lower() or 'moto' in name.lower():
            print(f"Match: {name} | URL: {url}")
