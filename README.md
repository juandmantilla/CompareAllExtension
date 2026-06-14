# CompareAll — Extensión de Comparación de Precios

CompareAll es una extensión de navegador (compatible con Chromium y Firefox) que te ayuda a rastrear pasivamente los precios de productos tecnológicos y de consumo en las principales tiendas colombianas: **Falabella, Alkosto, Almacenes Éxito y MercadoLibre**.

La extensión guarda el historial de precios hasta por 6 meses de manera 100% local (sin enviar datos a servidores externos), busca automáticamente el mismo producto en otras tiendas y te permite gestionar múltiples perfiles de usuario.

---

## 🛠️ Instalación

### En navegadores basados en Chromium (Chrome, Edge, Brave, Opera)
1. Abre tu navegador y ve a la página de extensiones escribiendo `chrome://extensions` en la barra de direcciones.
2. Activa el **"Modo desarrollador"** (el interruptor suele estar en la esquina superior derecha).
3. Haz clic en el botón **"Cargar extensión sin empaquetar"** (Load unpacked).
4. Selecciona la carpeta `CompareAllExtension` (la carpeta principal que contiene el archivo `manifest.json`).
5. ¡Listo! Verás el icono de CompareAll en la barra de extensiones de tu navegador.

### En Firefox
1. Abre Firefox y escribe `about:debugging#/runtime/this-firefox` en la barra de direcciones.
2. Haz clic en el botón **"Cargar complemento temporal"**.
3. Navega hasta la carpeta `CompareAllExtension` y selecciona el archivo `manifest.json`.
4. La extensión quedará instalada temporalmente (deberás repetir este paso si cierras por completo el navegador, a menos que la empaquetes).

---

## 👤 Añadir y Guardar Perfiles

Los perfiles te permiten organizar tus búsquedas (por ejemplo: "Lista de deseos personales", "Compras para el hogar", "Regalos").

1. Abre el panel de opciones de la extensión. Puedes hacerlo de dos formas:
   - Haciendo clic en el ícono de la extensión y luego en el botón **"⚙️ Opciones"**.
   - Haciendo clic derecho sobre el ícono de la extensión y seleccionando "Opciones".
2. En el panel izquierdo, ve a la sección **"👤 Perfiles"**.
3. Haz clic en el botón azul **"+ Nuevo Perfil"**.
4. Escribe un nombre descriptivo para tu perfil (ej. "Tecnología Oficina") y define en qué porcentaje de caída de precio deseas recibir una alerta.
5. Haz clic en **"Guardar"**.
6. Para que las nuevas búsquedas se guarden en ese perfil, asegúrate de marcarlo como activo haciendo clic en **"Activar"** dentro de la tarjeta del perfil.

---

## 🛒 Cómo Agregar Artículos a Cada Perfil de Búsqueda

CompareAll funciona de forma pasiva, lo que significa que detecta automáticamente los productos mientras navegas.

### Método 1: Navegación Automática (Recomendado)
1. Asegúrate de tener seleccionado tu perfil activo desde el popup o desde la página de opciones.
2. Navega normalmente hacia una página de producto en alguna de las tiendas soportadas (**Falabella, Alkosto, Éxito o MercadoLibre**).
3. Espera a que la página cargue. Verás aparecer un pequeño botón en la parte inferior derecha de la pantalla que dice **"📊 CompareAll: Rastreado ✓"**.
4. ¡El artículo ya se ha añadido a tu perfil actual!
   - *Nota:* La extensión intentará buscar automáticamente el mismo producto en el resto de las tiendas en segundo plano para poder comparar los precios de inmediato.

### Método 2: Vinculación Manual
Si la extensión no logra encontrar automáticamente el producto en otra tienda, puedes añadirlo manualmente:
1. Copia el enlace (URL) del producto que deseas añadir (ej. el link de un artículo en MercadoLibre).
2. Abre el **popup** de CompareAll (haciendo clic en el ícono de la extensión).
3. Ve a la pestaña **"+ Añadir"**.
4. Pega el enlace en la caja de texto debajo de "Agregar manualmente" y presiona la tecla **Enter** o haz clic en el botón de buscar.

---

## 📈 Cómo Visualizar la Serie de Tiempo de los Precios

El historial de precios es uno de los mayores beneficios de CompareAll, permitiéndote saber si estás comprando en un buen momento.

1. Haz clic en el ícono de la extensión en la barra de tu navegador para abrir el **Popup principal**.
2. En la pestaña **"💰 Precios"**, verás una lista con todos los productos de tu perfil activo y el resumen de los precios encontrados en cada tienda.
3. Para ver el historial detallado de un producto, haz clic en el botón **"📈 Ver historial"** situado en la tarjeta del producto correspondiente.
4. Se abrirá la pestaña de **Historial**, mostrando una gráfica lineal interactiva:
   - **Líneas de colores:** Cada tienda tiene un color asignado (Falabella en azul, Alkosto en rojo, Éxito en naranja, MercadoLibre en amarillo).
   - **Rango de tiempo:** En la parte inferior, puedes seleccionar visualizar los últimos `7 Días`, `30 Días` o `6 Meses`.
   - **Estadísticas:** Debajo de la gráfica verás el precio mínimo, máximo y el promedio histórico del artículo en cada tienda.

---

### Consideraciones de Privacidad
*CompareAll está diseñada pensando en tu privacidad. Todo tu historial de productos, precios y perfiles se guarda de manera local en tu navegador utilizando IndexedDB. No existe una base de datos en la nube ni recopilación de información por parte de terceros.*
