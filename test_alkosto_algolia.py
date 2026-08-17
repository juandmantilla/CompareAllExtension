import urllib.request
import ssl
import json

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

APP_ID = 'QX5IPS1B1Q'
API_KEY = '7a8800d62203ee3a9ff1cdf74f99b268'

def algolia_search(query, index='alkosto_co_products'):
    url = f'https://{APP_ID}-dsn.algolia.net/1/indexes/{index}/query'
    payload = json.dumps({
        'query': query,
        'hitsPerPage': 5,
        'attributesToRetrieve': ['name','productName','price','url','brand','sku']
    }).encode('utf-8')
    req = urllib.request.Request(url, data=payload, method='POST', headers={
        'X-Algolia-Application-Id': APP_ID,
        'X-Algolia-API-Key': API_KEY,
        'Content-Type': 'application/json'
    })
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=10) as r:
            data = json.loads(r.read().decode('utf-8'))
            print(f"✅ Algolia [{index}] → {data.get('nbHits',0)} hits")
            for hit in data.get('hits', [])[:3]:
                print(f"  Name: {hit.get('name') or hit.get('productName')}")
                print(f"  URL: {hit.get('url')}")
                print(f"  Price: {hit.get('price') or hit.get('prices')}")
                print()
    except Exception as e:
        print(f"❌ Algolia [{index}] → {e}")

# Try common index names
for idx in ['alkosto_co_products', 'alkosto_co', 'products', 'alkosto_products']:
    algolia_search('motorola moto g06', idx)

# Also test with Exito VTEX and MercadoLibre scraping
print("\n=== ÉXITO full result structure ===")
url2 = 'https://www.exito.com/api/catalog_system/pub/products/search/?ft=motorola+moto+g06&_from=0&_to=3'
req2 = urllib.request.Request(url2, headers={
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0'
})
with urllib.request.urlopen(req2, context=ctx, timeout=10) as r:
    products = json.loads(r.read().decode('utf-8'))
    for p in products[:2]:
        link = p.get('linkText','')
        items = p.get('items', [])
        price = None
        for item in items[:1]:
            for seller in item.get('sellers', [])[:1]:
                price = seller.get('commertialOffer', {}).get('Price')
        print(f"  Name: {p.get('productName')} | Link: https://www.exito.com/{link}/p | Price: {price}")
