# Simulate the current cleanProductName behavior
import re

name = 'Portátil HP 15.6" Full HD AMD Ryzen 7 7730U 16GB RAM 512GB SSD Plata'
name2 = 'Audifonos Samsung Galaxy Buds Core'
name3 = 'Celular MOTOROLA G06 4GB 256GB 4G'

stopwords = {
    'y','con','de','el','la','los','las','para','en','un','una',
    'color','negro','blanco','azul','rojo','verde','amarillo','gris','plata','dorado','morado','rosa','rosado','titanio',
    'black','white','blue','red','green','yellow','gray','grey','silver','gold','purple','pink','titanium',
    'cargador','regalo','gratis','combo','estuche','funda','vidrio','templado',
    'cm','mm','pulgadas','inch','unidad','und',
    'celular','smartphone','movil','telefono','libre','nuevo','reacondicionado','open',
    'audifonos','auriculares','inalambricos','bluetooth'
}

BRANDS = {'hp','samsung','motorola','moto','apple','iphone','lenovo','asus','acer','dell','lg','sony','xiaomi',
          'redmi','huawei','honor','oppo','vivo','realme','infinix','tecno','zte','poco','galaxy'}

def clean(name):
    raw = name.replace('"', ' ').replace('"', ' ').replace('"', ' ')
    raw = re.sub(r'[\(\)\[\]\{\}\+\/]', ' ', raw)
    tokens = raw.split()
    brand_tokens = []
    model_tokens = []
    other_tokens = []
    for t in tokens:
        lower = t.lower()
        if not lower or lower in stopwords: continue
        if re.match(r'^\d+(gb|tb|mb)$', lower, re.I): continue
        if lower in ('5g','4g','lte','wifi','nfc','full','hd','fhd','ssd','ram','amd','intel'): continue
        if lower in BRANDS:
            brand_tokens.append(t)
        elif re.search(r'\d', lower):  # has digit = model number
            model_tokens.append(t)
        else:
            other_tokens.append(t)
    combined = brand_tokens + model_tokens + other_tokens
    unique = list(dict.fromkeys(combined))  # dedup preserving order
    return ' '.join(unique[:5])

for n in [name, name2, name3]:
    print(f"Input:  {n}")
    print(f"Output: {clean(n)}")
    print()
