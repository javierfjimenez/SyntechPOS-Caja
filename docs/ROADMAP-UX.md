# Roadmap de paridad UX — funcionalidades de POS

> Funcionalidades que POS estándar de la industria (Loyverse, Square, Odoo, NCR…) traen y
> esta caja aún no. NO se copia código de ningún POS (UltimatePOS está PROHIBIDO por licencia,
> CLAUDE.md): solo se toma la *idea* de la funcionalidad y se diseña desde cero con los tokens
> de `DISENO.md`. Las que tocan el contrato aterrizan PRIMERO en SyntechPOS (regla D20).
>
> El núcleo transaccional/fiscal/offline (Fase 4) ya está; esto es la capa de comodidad y
> diferenciación comercial.

## ✅ Construido (tanda UX 2026-06-08)

Funcionalidades de **pura UI**:

- **Calculadora** — herramienta flotante (+ − × ÷ %), decimal exacto sin floats (`lib/calculator.ts`)
- **Pantalla completa** — toggle manual (F11 / barra), sin romper el kiosk (`toggle_fullscreen` en Rust)
- **Transacciones recientes** — ver y reimprimir las ventas/NC del turno (`services/transactions.ts`)
- **Barra de accesos directos** — saca a la vista lo que estaba escondido en F10 (productos, calculadora, pantalla completa, recientes, gasto, cierre)
- **Grid de productos (F3)** — `GridProductos.vue`: tiles con **avatar generado** (`lib/avatar.ts`, sin imágenes aún), filtro por departamento/marca, **click = +1**, `+/-` por tile con badge de cantidad, los pesables piden peso. Réplica ampliada (migración 0006: `brand_id`/`image_url` en products + tabla `brands`; fuerza un re-pull completo una vez para backfill). `+/-` también en las líneas del carrito.

## 🔜 Antes del piloto (baratas, no tocan el contrato)

- **Anulación de venta (`sale.voided`) con UI** — el evento YA existe en el contrato (eventos-sync §4.2); solo falta la pantalla. Hoy un error de cobro obliga a una NC (más lento, dos documentos). Anular dentro de la sesión abierta es lo correcto fiscalmente.
- **Atajo dedicado para la calculadora** y pulido de accesos directos según feedback de cajera.
- *(Reimpresión por número de ticket: ya cubierta por Transacciones recientes.)*

## 🟢 Ahora — habilitado por el servidor (SyntechPOS@c8d9170, D24)

- **Grid de productos con AVATAR** — DESBLOQUEADO. El servidor ya manda `image_url` en el delta
  (hoy siempre `null`) y los productos ya traen `brand_id`. La caja construye el grid YA: tiles con
  nombre + precio + **avatar generado del nombre** (inicial + color determinista) como imagen
  fallback. Navegable por `departments`/`brands` (ambos replicados). Cuando lleguen las fotos reales
  (Fase 2) el grid NO cambia: solo se sustituye el avatar por la imagen cacheada. Spec en `docs/ESTADO.md`.

## 🟡 v1.1 (toca el servidor levemente)

- **Display al cliente** — segunda pantalla mostrando el total al comprador. Requiere ventana
  secundaria en Tauri; no toca el contrato pero sí el shell de la app.
- **Reportes de producto/categoría en el X/Z** — hoy el arqueo da totales por método, no "qué se
  vendió". Necesita que el evento/servidor expongan el desglose o que la caja lo agregue local.

## 🔴 v2 (toca el servidor / costoso)

- **Imágenes de producto (Fase 2 — el "100%")** — la ESTRUCTURA ya está (D24): el campo y
  `image_url` viajan en el delta. Falta el pipeline caro: subida en backoffice → servidor sirve la
  URL → la caja **cachea la imagen en disco** (offline en N cajas) y la muestra, con el avatar de
  respaldo mientras no esté cacheada. Se construye cuando el piloto confirme que las fotos valen.
- ~~**Marcas (Brands)**~~ ✅ HECHO en SyntechPOS@80e5154 (D23): tabla + `brand_id` + delta; falta
  implementar tabla local + filtro en esta caja.
- **Stock en vivo en el tile** — no replicamos stock (es referencial por diseño); habría que bajarlo.
- **Promociones** — 2x1, 3x2, descuento por volumen, combos, precio por horario. Motor de reglas
  en el servidor + evaluación en la caja.
- **Fidelización / puntos** y **tarjetas de regalo / monedero** — nuevas entidades + medio de pago.
- **Integración con datáfono (pinpad)** — hoy la tarjeta es referencia manual; integrar Azul/CardNet
  para leer el monto y reducir errores de cuadre.
- **Pago móvil / QR** (tPago, transferencia con QR) y **vales de empleado** (Sodexo/Edenred).
- **Apartado (layaway) y cotizaciones/proformas** — nuevos tipos de documento.
- **Báscula serial integrada** — leer el peso del puerto, no solo etiquetas EAN-13 `2X`.
- **Tipos e-CF adicionales** — 32 (crédito fiscal), 33 (nota de débito), 43 (gastos menores),
  44 (régimen especial). El servidor ya soporta el campo `ecf_type`; la caja expone 31 y 34.

## Notas de priorización

- Para **supermercado con escáner** (el caso primario) el grid visual importa menos: se escanea el
  ~95%. Donde sí aporta es en lo que **no tiene código** (granel) — por eso el grid-texto de v1.1.
- El diseño es **teclado-first** (ui-caja.md): toda funcionalidad nueva debe ser completable sin
  mouse y JAMÁS robar el foco del input de escaneo (§1).
- Las que tocan el contrato (imágenes, marcas, stock, promociones, e-CF, layaway) requieren primero
  spec + servidor en SyntechPOS, luego implementación aquí referenciando el hash.
