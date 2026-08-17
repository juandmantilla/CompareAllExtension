import urllib.request
import urllib.parse
import ssl

def fetch_url(url, filename):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-419,es;q=0.7'
    })
    try:
        with urllib.request.urlopen(req, context=ctx) as response:
            html = response.read().decode('utf-8')
            with open(filename, 'w', encoding='utf-8') as f:
                f.write(html)
            print(f"Saved {len(html)} bytes to {filename}")
    except Exception as e:
        print(f"Error fetching {url}: {e}")

fetch_url('https://www.alkosto.com/search?text=Celular%20MOTOROLA%20G06%204GB%20256GB%204G', 'alkosto.html')
fetch_url('https://www.exito.com/s?q=Celular%20MOTOROLA%20G06%204GB%20256GB%204G', 'exito.html')
fetch_url('https://listado.mercadolibre.com.co/Celular-MOTOROLA-G06-4GB-256GB-4G', 'ml.html')
