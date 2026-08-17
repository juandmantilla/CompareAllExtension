import urllib.request
import ssl
import json

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
            print(data[:600])
            print()
            return data
    except Exception as e:
        print(f"❌ [{label}] → {e}")
        return None

# Alkosto - the site uses Salesforce Commerce Cloud (SFCC)
# SFCC endpoints
fetch('ALK-SFCC-search', 'https://www.alkosto.com/on/demandware.store/Sites-alkosto_co-Site/default/Search-ProductHits?q=motorola&format=ajax')
fetch('ALK-SFCC2', 'https://www.alkosto.com/on/demandware.store/Sites-alkosto_co-Site/es_CO/Search-GetSuggestions?q=motorola')
fetch('ALK-SFCC3', 'https://www.alkosto.com/on/demandware.store/Sites-alkosto_co-Site/es_CO/SearchServices-GetSuggestions?q=motorola+g06&maxSuggestions=5')

# Falabella search API (correct format)
fetch('FAL-browse', 'https://www.falabella.com.co/s/browse/v1/listing/co?Ntt=motorola+g06&zone=999&channel=home&page=1&pageSize=3')

# MercadoLibre - try scraping suggestion endpoint
fetch('ML-suggest', 'https://http2.mlstatic.com/resources/frontend/statics/growth-hackaton-mco/1.5.0/localhost.json')
fetch('ML-suggest2', 'https://api.mercadolibre.com/sites/MCO/autosuggest?q=motorola+g06&limit=5')

