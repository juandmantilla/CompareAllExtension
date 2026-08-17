import re

with open('alkosto.html', 'r', encoding='utf-8') as f:
    html = f.read()

linkRegex = re.compile(r'<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)</a>', re.IGNORECASE)
links = linkRegex.findall(html)

for url, content in links:
    if re.search(r'alkosto\.com/.*?/p(?:/|\?|$)', url) or '/p/' in url:
        print("URL:", url)
        print("CONTENT:", content.strip()[:100])
        full_match = re.search(r'<a[^>]+href="' + re.escape(url) + r'"[^>]*>', html)
        print("TAG:", full_match.group(0) if full_match else "None")
        print("---")
