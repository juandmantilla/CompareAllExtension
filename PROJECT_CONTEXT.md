# CompareAll — Contexto del Proyecto

> **Leer este archivo al inicio de cada sesión para conocer el estado actual del proyecto.**

---

## 🎯 Objetivo

Extensión de navegador (Chromium / Firefox, Manifest V3) que:
1. **Añade un botón de rastreo manual** cuando el usuario navega a una página de producto tecnológico en las tiendas colombianas soportadas.
2. **Registra el precio** y lo almacena localmente al añadir el producto (IndexedDB, sin backend).
3. **Enriquece y busca automáticamente** el mismo producto en otras tiendas usando inteligencia por modelo técnico e investigación en Internet (con fallback manual).
4. **Muestra el historial de precios** de hasta 2 años con gráfica lineal interactiva (Chart.js).
5. **Indica el mejor precio actual** y en qué tienda conseguirlo.
6. Soporta **múltiples perfiles** de usuario para organizar distintas listas de productos.

---

## 🏬 Tiendas Soportadas (V1)

| Tienda | Dominio | Color en gráficas | Tipo de Integración |
|--------|---------|-------------------|----------------------|
| Falabella | falabella.com.co | `#4A90D9` (azul) | HTML Search + State Blob / Regex Extraction |
| Alkosto | alkosto.com | `#E84040` (rojo) | Algolia REST API (`QX5IPS1B1Q`) |
| Almacenes Éxito | exito.com | `#F5A623` (naranja) | VTEX Catalog API |

> *Nota: Se removió el soporte para MercadoLibre por completo a solicitud del usuario.*

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Estándar | Manifest V3 (Chrome 110+, Firefox 115+) |
| UI | HTML5 + CSS3 Vanilla, tipografía Inter (WOFF2 local) |
| Lógica | JavaScript ES2022 (ES Modules donde MV3 lo permite) |
| Gráficas | Chart.js 4.x (incluido localmente en `/lib/`) |
| Base de datos | IndexedDB (wrapper en `/lib/db.js`) |
| Búsqueda cross-store | Fetch desatendido + Web Enrichment (DuckDuckGo API) + Algolia + VTEX API |

---

## 📁 Estructura de Archivos

```
CompareAllExtension/
├── PROJECT_CONTEXT.md          ← Este archivo
├── README.md                   ← Manual de uso e instalación
├── manifest.json               ← Configuración MV3 y permisos
├── background/
│   └── service-worker.js       ← Alarmas, mensajería, actualizaciones periódicas, notificaciones
├── content-scripts/
│   ├── utils.js                ← Helpers compartidos (extracción de precio, formato COP)
│   ├── falabella.js            ← Extractor para falabella.com.co
│   ├── alkosto.js              ← Extractor para alkosto.com
│   └── exito.js                ← Extractor para exito.com
├── popup/
│   ├── popup.html              ← UI del popup (420px wide)
│   ├── popup.js                ← Lógica del popup (Chart.js, perfiles, mejor precio)
│   └── popup.css               ← Estilos dark mode + glassmorphism
├── options/
│   ├── options.html            ← Página de configuración completa
│   ├── options.js              ← CRUD de perfiles, productos, exportar/importar
│   └── options.css             ← Estilos consistentes con popup
├── lib/
│   ├── db.js                   ← Abstracción IndexedDB (stores: products, price_history, profiles)
│   ├── search.js               ← Motor de búsqueda automática cross-store con enriquecimiento web y modelo
│   └── chart.min.js            ← Chart.js 4.x (local, requerido por CSP MV3)
├── stores/
│   └── selectors.json          ← Selectores DOM y patrones URL por tienda
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## 🔄 Flujo Principal de Datos

```
Usuario navega a página de producto
        ↓
content-script (falabella / alkosto / exito).js
  → Extrae: nombre, precio, imagen, SKU, URL
  → Inyecta botón "Rastrear con CompareAll" en la página
        ↓
Usuario hace clic en el botón
        ↓
service-worker.js recibe { action: 'PRICE_CAPTURED', ... }
  → Guarda en IndexedDB (db.js → price_history)
  → Si es producto nuevo: llama searchAllStores(productName, sourceStore)
        ↓
search.js
  1. Ejecuta enrichProductFromInternet(productName)
     → Consulta desatendida a DuckDuckGo HTML API
     → Identifica el código de modelo oficial (MPN) (ej: "15-fc0287la", "SM-R177")
  2. Genera consulta limpia con cleanProductName(name) (Marca + Modelo + Términos Clave)
  3. Ejecuta búsquedas paralelas en tiendas objetivo (Algolia/VTEX/Falabella HTML)
  4. Evalúa similitud con nameSimilarity(original, candidate)
     → Aplica bonificación (+35%) si coinciden modelos técnicos
     → Aplica penalización (-25%) si los modelos son incompatibles
        ↓
popup.js / options.js leen IndexedDB directamente
  → Renderizan gráfica Chart.js
  → Calculan mejor precio (db.getBestPrice)
```

---

## 🗄️ Esquema de IndexedDB

**Base de datos:** `compareall_db` v1

| Object Store | Key Path | Descripción |
|---|---|---|
| `profiles` | `id` (auto) | `{ id, name, productIds[], alertThreshold, createdAt }` |
| `products` | `id` (auto) | `{ id, name, image, profileId, storeUrls: {falabella, alkosto, exito}, storeStatuses: {falabella, alkosto, exito}, storeSearchUrls: {falabella, alkosto, exito}, sku, addedAt }` |
| `price_history` | `id` (auto) | `{ id, productId, store, price, timestamp }` — almacena hasta 2 años |

---

## ⚙️ Arquitectura de Búsqueda Cross-Store e Inteligencia de Modelos

**Implementada en:** `lib/search.js`

### 1. Enriquecimiento Web Previsto (`enrichProductFromInternet`)
- Antes de consultar las tiendas, se realiza una búsqueda web previa silenciosa en DuckDuckGo HTML API (`https://html.duckduckgo.com/html/?q=...`).
- Su objetivo es extraer el **número de parte / código de modelo oficial del fabricante (MPN)** a partir del nombre comercial de la tienda origen.
- Esto permite convertir nombres genéricos o promocionales en consultas de alta precisión (ej: *"Portátil HP 15.6 Ryzen 7 16GB"* → *"HP 15-fc0287la"*).

### 2. Destilado de Consulta Canónica (`cleanProductName`)
- Extrae la marca principal (HP, Samsung, Lenovo, Apple, Asus, etc.) y prioriza los tokens con formato de modelo (combinación de dígitos y letras como `7730U`, `G06`, `S24`, `fc0287la`).
- Descarta stopwords (colores, términos de regalo, palabras de conexión) y especificaciones técnicas genéricas (RAM, SSD, screen size) para evitar ruido en motores de búsqueda.

### 3. Consultas por Tienda
- **Alkosto**: Algolia API REST con App ID `QX5IPS1B1Q` y API Key pública. Obtiene hasta 10 hits por consulta y los filtra por similitud.
- **Éxito**: VTEX Catalog API (`/api/catalog_system/pub/products/search?ft={query}`).
- **Falabella**: Búsqueda HTML + RegEx fallback / `__NEXT_DATA__` state blobs parsing.

### 4. Algoritmo de Similitud Ponderado (`nameSimilarity`)
- Combina la similitud de Jaccard (conjuntos de palabras) con coincidencia de substrings.
- **Validación de Código de Modelo (`extractModelCodes`)**:
  - **+35% Bonus**: Si ambos nombres comparten el mismo código de modelo oficial alfanumérico.
  - **-25% Penalización**: Si ambos nombres poseen códigos de modelo diferentes (evita falsos positivos entre modelos similares de distinta generación/procesador).

---

## 🔔 Notificaciones

- Alerta al usuario cuando el precio de un producto baje X% o más (configurable por perfil).

---

## 👤 Sistema de Perfiles

- **Perfil activo** guardado en `chrome.storage.local` (`activeProfileId`).
- El popup y el content script agregan automáticamente los productos al perfil activo.
- Desde la interfaz de Opciones se pueden crear, renombrar, eliminar perfiles y transferir productos entre listas.

---

## 📋 Decisiones de Diseño Confirmadas

| # | Decisión |
|---|---------|
| 1 | **Rastreo Manual (Opt-In):** La extensión inyecta un botón flotante en páginas de producto para que el usuario decida activamente qué artículos seguir. |
| 2 | **Búsqueda Inteligente por Modelo e Internet:** Enriquecimiento de modelo mediante DuckDuckGo API previo a la consulta en APIs de tiendas. |
| 3 | **Scoring Ponderado por MPN:** Bonificación del 35% por coincidencia de modelo alfanumérico y penalización del 25% por discrepancia de modelo. |
| 4 | **Sin Backend:** Todos los datos residen localmente en el navegador mediante IndexedDB. |
| 5 | **Depuración de MercadoLibre:** Removido totalmente debido a captchas de listados públicos y solicitud del usuario. |
| 6 | **Selectores Configurables:** Archivo `stores/selectors.json` independiente para mantener selectores CSS/JSON-LD por tienda. |

---

## 📍 Estado Actual del Proyecto

**Fase actual:** ✅ COMPLETO — Enriquecimiento por modelo activo, eliminación de MercadoLibre completada y motor cross-store optimizado.  
**Última actualización:** 2026-08-17  

---

## 📦 Dependencias Externas (incluidas localmente)

| Archivo | Versión | Propósito |
|---------|---------|-----------|
| `lib/chart.min.js` | Chart.js 4.4.x | Gráficas de historial de precios |
