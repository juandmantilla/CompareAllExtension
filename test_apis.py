import urllib.request
import ssl
import json

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def fetch(url, extra_headers={}):
    headers = {
        'Accept': 'application/json',
        'Accept-Language': 'es-419,es;q=0.7',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
    }
    headers.update(extra_headers)
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=10) as r:
            data = r.read().decode('utf-8')
            print(f"✅ {url[:80]} → {len(data)} bytes")
            print(data[:300])
            print()
            return data
    except Exception as e:
        print(f"❌ {url[:80]} → {e}")
        print()
        return None

print("=== ALKOSTO ===")
fetch('https://www.alkosto.com/rest/v2/alkosto/products/search?q=motorola&count=5')
fetch('https://www.alkosto.com/search?q=samsung&format=json')
fetch('https://www.alkosto.com/api/catalog/search?text=samsung&page=1')
fetch('https://www.alkosto.com/api/v1/search?q=samsung')

print("\n=== ÉXITO (VTEX) ===")
fetch('https://www.exito.com/api/catalog_system/pub/products/search/?ft=motorola&_from=0&_to=3')
fetch('https://exitocol.vtexcommercestable.com.br/api/catalog_system/pub/products/search/?ft=motorola&_from=0&_to=3')
fetch('https://www.exito.com/_v/segment/graphql/v1?extensions={"persistedQuery":{"version":1,"sha256Hash":"9177ba6f883473505dc99fcf2b679a6a"}}&variables={"query":"motorola","map":"ft","from":0,"to":3}&workspace=master&maxAge=short&appsEtag=remove&domain=store&locale=es-CO')

print("\n=== MERCADO LIBRE ===")
fetch('https://api.mercadolibre.com/sites/MCO/search?q=motorola+moto+g06&limit=5')

