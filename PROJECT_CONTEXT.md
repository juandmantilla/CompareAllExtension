# CompareAll — Contexto del Proyecto

> **Leer este archivo al inicio de cada sesión para conocer el estado actual del proyecto.**

---

## 🎯 Objetivo

Extensión de navegador (Chromium / Firefox, Manifest V3) que:
1. **Detecta automáticamente** cuando el usuario navega a una página de producto tecnológico en las tiendas colombianas soportadas.
2. **Registra el precio** y lo almacena localmente (IndexedDB, sin backend).
3. **Busca automáticamente** el mismo producto por nombre en las otras tiendas (con fallback manual).
4. **Muestra el historial de precios** de los últimos 6 meses con gráfica (Chart.js).
5. **Indica el mejor precio actual** y en qué tienda conseguirlo.
6. Soporta **múltiples perfiles** de usuario para organizar distintas listas de productos.

---

## 🏬 Tiendas Soportadas (V1)

| Tienda | Dominio | Color en gráficas |
|--------|---------|-------------------|
| Falabella | falabella.com.co | `#4A90D9` (azul) |
| Alkosto | alkosto.com | `#E84040` (rojo) |
| Almacenes Éxito | exito.com | `#F5A623` (naranja) |

---

## 🛠️ Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Estándar | Manifest V3 (Chrome 110+, Firefox 115+) |
| UI | HTML5 + CSS3 Vanilla, tipografía Inter (WOFF2 local) |
| Lógica | JavaScript ES2022 (ES Modules donde MV3 lo permite) |
| Gráficas | Chart.js 4.x (incluido localmente en `/lib/`) |
| Base de datos | IndexedDB (wrapper en `/lib/db.js`) |
| Búsqueda cross-store | Fetch desde service worker a endpoints de búsqueda de cada tienda |

---

## 📁 Estructura de Archivos

```
CompareAllExtension/
├── PROJECT_CONTEXT.md          ← Este archivo
├── manifest.json               ← Configuración MV3
├── background/
│   └── service-worker.js       ← Alarmas, mensajería, actualizaciones periódicas, búsqueda cross-store
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
│   ├── search.js               ← Motor de búsqueda automática cross-store
│   └── chart.min.js            ← Chart.js 4.x (local, requerido por CSP MV3)
├── stores/
│   └── selectors.json          ← Selectores DOM y patrones URL por tienda (editar aquí si cambian)
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
content-script (falabella/alkosto/exito).js
  → Extrae: nombre, precio, imagen, SKU, URL
  → Inyecta badge "Rastreado ✓" en la página
  → Envía mensaje al Service Worker
        ↓
service-worker.js recibe { action: 'PRICE_CAPTURED', ... }
  → Guarda en IndexedDB (db.js → price_history)
  → Si es producto nuevo: llama search.js para buscar en otras tiendas
  → Si el precio bajó del umbral: dispara notificación Chrome
        ↓
popup.js / options.js leen IndexedDB directamente
  → Renderizan gráfica Chart.js
  → Calculan mejor precio (db.getBestPrice)
  → Muestran delta % vs semana pasada
```

---

## 🗄️ Esquema de IndexedDB

**Base de datos:** `compareall_db` v1

| Object Store | Key Path | Descripción |
|---|---|---|
| `profiles` | `id` (auto) | `{ id, name, productIds[], alertThreshold, createdAt }` |
| `products` | `id` (auto) | `{ id, name, image, profileId, storeUrls: {falabella, alkosto, exito}, sku, addedAt }` |
| `price_history` | `id` (auto) | `{ id, productId, store, price, timestamp }` — purga entradas > 6 meses |

---

## ⚙️ Búsqueda Automática Cross-Store

**Implementada en:** `lib/search.js`

**Estrategia:**
1. Cuando se captura un producto nuevo, el service worker invoca `searchAllStores(productName)`.
2. Para cada tienda, se construye una URL de búsqueda y se hace `fetch()` del HTML de resultados.
3. Se parsea el primer resultado con `DOMParser` y se extrae la URL del producto + precio.
4. Si la búsqueda falla o el resultado no coincide (similitud de nombre < 70%), se marca como **"buscar manualmente"** y se notifica al usuario.
5. El usuario puede corregir/confirmar los URLs vinculados desde la página de opciones.

**Endpoints de búsqueda:**
- Falabella: `https://www.falabella.com.co/falabella-co/search?Ntt={query}`
- Alkosto: `https://www.alkosto.com/search?text={query}`
- Éxito: `https://www.exito.com/search?text={query}`

---

## 🔔 Notificaciones

- Notificación cuando el precio de un producto rastreado baja X% o más (configurable por perfil).
- Notificación cuando la búsqueda automática cross-store requiere confirmación manual.

---

## 👤 Sistema de Perfiles

- **Perfil activo** guardado en `chrome.storage.local` (`activeProfileId`).
- El popup siempre muestra los productos del perfil activo.
- Desde opciones se puede crear, renombrar, eliminar perfiles y mover productos entre perfiles.
- **Perfil por defecto** creado automáticamente en la primera instalación ("Mi Lista").

---

## 📋 Decisiones de Diseño Confirmadas

| # | Decisión |
|---|---------|
| 1 | **Rastreo Pasivo:** La extensión detecta automáticamente páginas de producto, sin necesidad de que el usuario pegue URLs. |
| 2 | **Búsqueda cross-store automática** por nombre de producto. Fallback a vinculación manual si la búsqueda no es confiable (similitud < 70%). |
| 3 | **Sin backend:** Todo el almacenamiento es local (IndexedDB). No se envían datos a servidores externos. |
| 4 | **Selectores configurables:** `stores/selectors.json` permite actualizar selectores DOM sin modificar código JS cuando las tiendas cambien su frontend. |

---

## 📍 Estado Actual del Proyecto

**Fase actual:** ✅ COMPLETO — Todos los archivos creados y listos para cargar  
**Última actualización:** 2026-06-07  
**Próximo paso:** Cargar en Chrome (`chrome://extensions`) y hacer pruebas manuales

### Checklist de Fases
- [x] Fase 1 — Fundación (manifest.json, selectors.json)
- [x] Fase 2 — Content Scripts (falabella, alkosto, exito + utils.js)
- [x] Fase 3 — Service Worker & IndexedDB (db.js, search.js, service-worker.js)
- [x] Fase 4 — Popup UI (Chart.js, dark mode, 3 tabs: precios/historial/agregar)
- [x] Fase 5 — Página de Opciones (perfiles CRUD, tabla de productos, config, export/import)
- [x] Fase 6 — Iconos (16px, 48px, 128px) + Chart.js 4.4.4 local
- [ ] Pruebas manuales en Chrome — navegar a producto Falabella
- [ ] Pruebas manuales en Chrome — navegar a producto Alkosto
- [ ] Pruebas manuales en Chrome — navegar a producto Éxito
- [ ] Verificar búsqueda cross-store automática
- [ ] Verificar gráfica de historial en popup
- [ ] Pruebas en Firefox

---

## 🐛 Problemas Conocidos / TODOs

- Los selectores DOM en `selectors.json` pueden necesitar actualización si las tiendas rediseñan su frontend. Verificar periódicamente.
- La búsqueda cross-store con `fetch()` puede fallar si las tiendas bloquean requests sin cookies de sesión. En ese caso, se activa el fallback manual.
- Firefox MV3: verificar que `chrome.*` APIs funcionen con el polyfill `browser.*`.

---

## 🚀 Cómo Cargar la Extensión para Pruebas

**Chrome / Chromium:**
1. Ir a `chrome://extensions`
2. Activar "Modo desarrollador" (toggle superior derecho)
3. Clic en "Cargar extensión sin empaquetar"
4. Seleccionar la carpeta `CompareAllExtension/`

**Firefox:**
1. Ir a `about:debugging#/runtime/this-firefox`
2. Clic en "Cargar complemento temporal"
3. Seleccionar el archivo `manifest.json` dentro de `CompareAllExtension/`

---

## 📦 Dependencias Externas (incluidas localmente)

| Archivo | Versión | Propósito |
|---------|---------|-----------|
| `lib/chart.min.js` | Chart.js 4.4.x | Gráficas de historial de precios |

> **Nota:** No usar CDN. Todas las dependencias deben estar en el paquete de la extensión (requerimiento de CSP MV3).
