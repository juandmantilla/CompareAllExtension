import urllib.request
import ssl
import re

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# Look for bloomreach/exponea API in Alkosto HTML
with open('alkosto.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Find bloomreach pixel ID or API calls
br_matches = re.findall(r'(brSm[A-Za-z0-9]+|brAccount|api\.exponea|sdk\.exponea|[a-z0-9]+\.bloomreach\.com)["\s=:]+([^"\'<>]{0,80})', html)
print("Bloomreach refs:", br_matches[:5])

# Look for account ID or any API
account = re.findall(r'account["\s=:]+["\']([^"\']+)', html)
print("Accounts:", account[:5])

# Exponea API
def fetch(url):
    req = urllib.request.Request(url, headers={
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
    })
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=8) as r:
            data = r.read().decode('utf-8')
            print(f"✅ {url[:80]} → {len(data)} bytes\n{data[:200]}\n")
    except Exception as e:
        print(f"❌ {url[:80]} → {e}")

# Falabella API (for reference)
print("\n=== FALABELLA ===")
fetch('https://www.falabella.com.co/s/browse/v1/listing/co?Ntt=motorola&zone=999&channel=home&sortByKey=&sortByValue=&page=1&pageSize=5')
fetch('https://www.falabella.com.co/falabella-co/rest/model/atg/commerce/catalog/ProductCatalogActor/getProductsByCategory?q=motorola')

# MercadoLibre OAuth-free
fetch('https://api.mercadolibre.com/sites/MCO/search?q=motorola+g06&limit=3')

