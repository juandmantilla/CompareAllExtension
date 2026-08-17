import urllib.request
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def fetch(label, url, headers_extra={}):
    headers = {
        'Accept': 'application/json',
        'Accept-Language': 'es-419,es;q=0.7',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36'
    }
    headers.update(headers_extra)
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=10) as r:
            data = r.read().decode('utf-8')
            print(f"✅ [{label}] → {len(data)} bytes")
            print(data[:400])
            print()
            return data
    except Exception as e:
        print(f"❌ [{label}] → {e}")
        return None

# MercadoLibre: public search without auth (different endpoint)
fetch('ML-search-public', 'https://www.mercadolibre.com.co/jms/mco/sch/api?ft=samsung+galaxy+buds+core')
fetch('ML-search-public2', 'https://listado.mercadolibre.com.co/jms/mco/sch/api?ft=motorola+g06')

# Alkosto: try Exponea/Magnolia/Solr endpoints
fetch('ALK-solr', 'https://www.alkosto.com/on/demandware.store/Sites-alkosto_co-Site/es_CO/Search-Show?q=motorola&srule=best-match&sz=5&start=0&format=ajax')
fetch('ALK-search-api', 'https://www.alkosto.com/api/store/v1/products/search?query=motorola+moto')
fetch('ALK-ocapi', 'https://www.alkosto.com/s/alkosto_co/dw/shop/v20_2/product_search?q=motorola&count=5')

# Falabella actual search API
fetch('FAL-search', 'https://www.falabella.com.co/s/browse/v1/listing/co?Ntt=motorola+g06&zone=999&channel=home&page=1&pageSize=3&jsonType=organic')

