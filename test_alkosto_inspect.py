import re

# Look for JS config in alkosto HTML that reveals what search engine they use
with open('alkosto.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Find search endpoints embedded in JS
endpoints = re.findall(r'(?:endpoint|searchUrl|api_url|searchHost|baseUrl|apiUrl)["\s:=]+["\']?(https?://[^"\'<>\s]+)', html, re.IGNORECASE)
print("Endpoints found:", endpoints[:10])

# Find Bloomreach specific config
brtokenMatches = re.findall(r'(brApiUrl|brAccount|brTid|br_uid|br-uid|pixel_id)["\s:=]+["\']?([^"\'<>\s,}]+)', html, re.IGNORECASE)
print("Bloomreach config:", brtokenMatches[:10])

# Find any search-related domains
domains = re.findall(r'https?://([a-zA-Z0-9.-]+(?:search|elastic|solr|algolia|attentive|bloomreach|hawksearch|luigi|constructorio)[a-zA-Z0-9.-]*)', html, re.IGNORECASE)
print("Search domains:", set(domains))

# Look for algolia appId
algolia = re.findall(r'(appId|apiKey|algolia)["\s:=]+["\']([^"\'<>\s,}]+)', html, re.IGNORECASE)
print("Algolia:", algolia[:5])
