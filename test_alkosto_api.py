import urllib.request
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

urls = [
    'https://www.alkosto.com/rest/v2/alkosto/products/search?query=motorola',
    'https://www.alkosto.com/api/v2/alkosto/products/search?query=motorola',
    'https://www.alkosto.com/search/autocomplete?q=motorola'
]

for url in urls:
    print(f"Trying {url}")
    req = urllib.request.Request(url, headers={'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(req, context=ctx) as response:
            print(response.read().decode('utf-8')[:200])
    except Exception as e:
        print("Error:", e)
