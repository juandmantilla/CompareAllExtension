import urllib.request
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

req = urllib.request.Request('https://www.exito.com/api/catalog_system/pub/products/search/?ft=motorola&_from=0&_to=5', headers={
    'Accept': 'application/json'
})
try:
    with urllib.request.urlopen(req, context=ctx) as response:
        print(response.read().decode('utf-8')[:500])
except Exception as e:
    print(e)
