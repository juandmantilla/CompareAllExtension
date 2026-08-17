import re
import json

def parse_alkosto(html):
    print("--- ALKOSTO ---")
    linkRegex = re.compile(r'<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)</a>', re.IGNORECASE)
    links = linkRegex.findall(html)
    valid_links = []
    for url, content in links:
        if re.search(r'alkosto\.com/.*?/p(?:/|\?|$)', url):
            valid_links.append((url, content))
    
    print(f"Found {len(valid_links)} valid links in Alkosto")
    for url, content in valid_links[:3]:
        name = re.sub(r'<[^>]+>', ' ', content).strip()
        name = re.sub(r'\s+', ' ', name)
        if not name or len(name) < 5:
            # try to find title
            pass
        print(f"URL: {url}")
        print(f"Content text: {name}")
        print("---")

def parse_exito(html):
    print("--- EXITO ---")
    linkRegex = re.compile(r'<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)</a>', re.IGNORECASE)
    links = linkRegex.findall(html)
    valid_links = []
    for url, content in links:
        # Exito URLs might be relative
        full_url = url
        if url.startswith('/'):
            full_url = 'https://www.exito.com' + url
        if re.search(r'exito\.com/.*?/p(?:/|\?|$)', full_url):
            valid_links.append((full_url, content))
    
    print(f"Found {len(valid_links)} valid links in Exito (using /p/)")
    
    # Try alternate regex for Exito if 0 found
    if len(valid_links) == 0:
        alt_links = []
        for url, content in links:
            if url.startswith('/'): url = 'https://www.exito.com' + url
            if 'exito.com' in url and '/p' not in url and 'celular' in url.lower():
                alt_links.append((url, content))
        print(f"Found {len(alt_links)} links with 'celular' in URL")
        for url, content in alt_links[:3]:
            print(f"URL: {url}")

with open('alkosto.html', 'r', encoding='utf-8') as f: parse_alkosto(f.read())
with open('exito.html', 'r', encoding='utf-8') as f: parse_exito(f.read())
