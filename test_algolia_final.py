import json
import urllib.request
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

APP_ID = 'QX5IPS1B1Q'
API_KEY = '7a8800d62203ee3a9ff1cdf74f99b268'
INDEX   = 'alkostoIndexAlgoliaPRD'

def algolia_search(query):
    url = f'https://{APP_ID}-dsn.algolia.net/1/indexes/{INDEX}/query'
    payload = json.dumps({
        'query': query,
        'hitsPerPage': 5,
        'attributesToRetrieve': ['name','price','url','brand','categories','sku','originalPrice']
    }).encode('utf-8')
    req = urllib.request.Request(url, data=payload, method='POST', headers={
        'X-Algolia-Application-Id': APP_ID,
        'X-Algolia-API-Key': API_KEY,
        'Content-Type': 'application/json'
    })
    with urllib.request.urlopen(req, context=ctx, timeout=10) as r:
        return json.loads(r.read().decode('utf-8'))

try:
    data = algolia_search('motorola moto g06')
    print(f"Hits: {data.get('nbHits',0)}")
    for hit in data.get('hits', [])[:3]:
        print(json.dumps(hit, indent=2, ensure_ascii=False)[:400])
        print()
except Exception as e:
    print(f"Error: {e}")

import json, urllib.request, ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

APP_ID = 'QX5IPS1B1Q'
API_KEY = '7a8800d62203ee3a9ff1cdf74f99b268'
INDEX   = 'alkostoIndexAlgoliaPRD'

queries = ['HP 7730U portatil', 'HP Ryzen 7 7730U', 'Samsung Galaxy Buds Core']

for q in queries:
    url = f'https://{APP_ID}-dsn.algolia.net/1/indexes/{INDEX}/query'
    payload = json.dumps({'query': q, 'hitsPerPage': 3, 'attributesToRetrieve': ['name_text_es','url_es_string','discountprice_double']}).encode()
    req = urllib.request.Request(url, data=payload, method='POST', headers={
        'X-Algolia-Application-Id': APP_ID, 'X-Algolia-API-Key': API_KEY, 'Content-Type': 'application/json'
    })
    with urllib.request.urlopen(req, context=ctx, timeout=10) as r:
        data = json.loads(r.read().decode('utf-8'))
    print(f"Query: '{q}' → {data.get('nbHits',0)} hits")
    for h in data.get('hits', [])[:3]:
        print(f"  {h.get('name_text_es')} | {h.get('url_es_string')} | ${h.get('discountprice_double')}")
    print()
