import urllib.request
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def fetch(url, extra_headers={}):
    headers = {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'es-419,es;q=0.7',
        'Referer': 'https://www.alkosto.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
    }
    headers.update(extra_headers)
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=10) as r:
            data = r.read().decode('utf-8')
            print(f"✅ {url[:90]} → {len(data)} bytes")
            print(data[:500])
            print()
            return data
    except Exception as e:
        print(f"❌ {url[:90]} → {e}")
        return None

print("=== ALKOSTO — Algolia / Elasticsearch ===")
fetch('https://www.alkosto.com/search?q=motorola+moto+g06&format=json')
fetch('https://search.alkosto.com/api/search?q=motorola')
fetch('https://www.alkosto.com/ajax/products/search?q=motorola')
# Alkosto usa Bloomreach
fetch('https://www.alkosto.com/api/analytics/search?q=motorola')

print("=== MERCADOLIBRE — Public API sin auth ===")
fetch('https://api.mercadolibre.com/sites/MCO/search?q=motorola+g06&limit=5', 
      {'Accept': 'application/json'})
# Try with dummy token
fetch('https://api.mercadolibre.com/sites/MCO/search?q=samsung+galaxy+buds+core&limit=5&access_token=', 
      {'Accept': 'application/json'})

print("=== ÉXITO — VTEX full product ===")
data = fetch('https://www.exito.com/api/catalog_system/pub/products/search/?ft=samsung+galaxy+buds+core&_from=0&_to=4')
if data:
    import json
    products = json.loads(data)
    for p in products[:2]:
        print(f"  Name: {p.get('productName')}")
        print(f"  Link: {p.get('linkText')}")
        items = p.get('items', [])
        for item in items[:1]:
            for seller in item.get('sellers', [])[:1]:
                price = seller.get('commertialOffer', {}).get('Price')
                print(f"  Price: {price}")

