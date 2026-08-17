import re, json, urllib.request, ssl

BRANDS = {'hp','samsung','motorola','moto','apple','iphone','lenovo','asus','acer','dell','lg','sony',
          'xiaomi','redmi','huawei','honor','oppo','vivo','realme','infinix','tecno','zte','poco',
          'epson','brother','canon','logitech','microsoft','intel','amd','nvidia','toshiba','hisense',
          'tcl','whirlpool','haceb','challenger','kalley','xtratech','blackview'}

STOPWORDS = {'y','con','de','el','la','los','las','para','en','un','una','o','e',
    'color','negro','blanco','azul','rojo','verde','amarillo','gris','plata','dorado','morado','rosa','rosado','titanio',
    'black','white','blue','red','green','yellow','gray','grey','silver','gold','purple','pink','titanium',
    'cargador','regalo','gratis','combo','estuche','funda','vidrio','templado',
    'cm','mm','pulgadas','inch','unidad','und','nuevo','reacondicionado','open','libre',
    'celular','smartphone','movil','telefono','portatil','laptop','computador','computadora',
    'audifonos','auriculares','inalambricos',
    'full','hd','fhd','uhd','qhd','led','ips','amoled','oled','ssd','hdd','nvme',
    'tactil','touch','wifi','bluetooth','dual','sim'}

def clean(name):
    raw = name.replace('\u201c',' ').replace('\u201d',' ').replace('"',' ')
    raw = re.sub(r'[\(\)\[\]\{\}\+\/\\]', ' ', raw)
    tokens = re.split(r'[\s,;:\-]+', raw)
    brand_tokens, model_tokens, other_tokens = [], [], []
    for t in tokens:
        lower = t.lower()
        if not lower or lower in STOPWORDS: continue
        if re.match(r'^\d+(gb|tb|mb)$', lower, re.I): continue
        if lower in ('5g','4g','3g','lte','nfc','ram','amd','intel','core','ultra','ryzen','geforce','snapdragon'): continue
        if re.match(r'^\d+$', lower) and len(lower) <= 2: continue
        if len(lower) <= 1: continue
        if lower in BRANDS: brand_tokens.append(t)
        elif re.search(r'\d', lower): model_tokens.append(t)
        elif len(lower) >= 3: other_tokens.append(t)
    combined = brand_tokens + model_tokens + other_tokens
    unique = list(dict.fromkeys(combined))
    return ' '.join(unique[:5])

tests = [
    'Portátil HP 15.6" Full HD AMD Ryzen 7 7730U 16GB RAM 512GB SSD Plata',
    'Audifonos Samsung Galaxy Buds Core',
    'Celular MOTOROLA G06 4GB 256GB 4G',
    'Televisor LG 55" 4K UHD OLED C3 Smart TV',
]
for t in tests:
    print(f"IN:  {t}")
    print(f"OUT: {clean(t)}")
    print()

# Verify with Algolia
ctx = ssl.create_default_context(); ctx.check_hostname=False; ctx.verify_mode=ssl.CERT_NONE
APP_ID='QX5IPS1B1Q'; API_KEY='7a8800d62203ee3a9ff1cdf74f99b268'; INDEX='alkostoIndexAlgoliaPRD'

for t in tests[:3]:
    q = clean(t)
    url = f'https://{APP_ID}-dsn.algolia.net/1/indexes/{INDEX}/query'
    payload = json.dumps({'query':q,'hitsPerPage':3,'attributesToRetrieve':['name_text_es','discountprice_double']}).encode()
    req = urllib.request.Request(url, data=payload, method='POST', headers={
        'X-Algolia-Application-Id':APP_ID,'X-Algolia-API-Key':API_KEY,'Content-Type':'application/json'})
    with urllib.request.urlopen(req, context=ctx, timeout=10) as r:
        data = json.loads(r.read().decode())
    print(f"Algolia query='{q}' → {data.get('nbHits')} hits")
    for h in data.get('hits',[])[:2]:
        print(f"  {h.get('name_text_es')} | ${h.get('discountprice_double')}")
    print()
