import json, urllib.request, ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

APP_ID = 'QX5IPS1B1Q'
API_KEY = '7a8800d62203ee3a9ff1cdf74f99b268'
INDEX   = 'alkostoIndexAlgoliaPRD'

url = f'https://{APP_ID}-dsn.algolia.net/1/indexes/{INDEX}/query'
payload = json.dumps({'query': 'motorola moto g06', 'hitsPerPage': 2}).encode()
req = urllib.request.Request(url, data=payload, method='POST', headers={
    'X-Algolia-Application-Id': APP_ID,
    'X-Algolia-API-Key': API_KEY,
    'Content-Type': 'application/json'
})
with urllib.request.urlopen(req, context=ctx, timeout=10) as r:
    data = json.loads(r.read().decode('utf-8'))

hit = data['hits'][0]
print("Full hit keys:", list(hit.keys()))
print("Full hit sample:")
print(json.dumps(hit, indent=2, ensure_ascii=False)[:1500])
