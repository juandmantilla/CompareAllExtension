import re
import json
import urllib.request
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

with open('alkosto.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Extract Algolia index name from HTML
idx_matches = re.findall(r'indexName["\s:=]+["\']([^"\']+)', html)
print("Index names:", idx_matches[:10])

# Also look for 'index' near algolia
algolia_idx = re.findall(r'"index"\s*:\s*"([^"]+)"', html)
print("Index direct:", algolia_idx[:10])

# Look for any "indexes" call pattern
idx2 = re.findall(r'/1/indexes/([^/"&?]+)', html)
print("Indexes in URLs:", idx2[:10])

APP_ID = 'QX5IPS1B1Q'
API_KEY = '7a8800d62203ee3a9ff1cdf74f99b268'

# Try multiSearch to discover indexes
url = f'https://{APP_ID}-dsn.algolia.net/1/indexes/*/queries'
payload = json.dumps({'requests': [{'indexName': 'alkosto_co_products_query_suggestions', 'query': 'motorola', 'hitsPerPage': 3}]}).encode()
req = urllib.request.Request(url, data=payload, method='POST', headers={
    'X-Algolia-Application-Id': APP_ID,
    'X-Algolia-API-Key': API_KEY,
    'Content-Type': 'application/json'
})
try:
    with urllib.request.urlopen(req, context=ctx, timeout=10) as r:
        data = json.loads(r.read().decode('utf-8'))
        print("Algolia multi:", json.dumps(data)[:500])
except Exception as e:
    print("multi error:", e)

