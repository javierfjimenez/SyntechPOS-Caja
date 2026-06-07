# Estado del Proyecto — Bitácora (Caja)

> Memoria viva del repo de caja. Lo más reciente arriba. El estado del producto completo vive en `SyntechPOS/docs/ESTADO.md`.

## 📍 AHORA

- **Fase actual**: FASE 4 — POS de caja
- **Tarea actual**: 4.7 COMPLETA — el ciclo caja→servidor cerrado y probado e2e. 4.5 sigue pendiente solo del hardware (conectar la 2Connect → F10 → Impresora → prueba)
- **Siguiente tarea**: 4.6 cierre de sesión (arqueo CIEGO + reporte Z + retiros) — con el worker vivo, cash_session.closed viajará solo
- **Bloqueos**: ninguno
  - [ ] Pendiente menor: `nvm alias default 22`
  - [ ] Deuda de CA 4.2: correr `php artisan db:seed --class=BulkCatalogSeeder` y medir el pull de 10k
  - [ ] Deuda de CA 4.3: cronometrar venta de 20 items < 60 seg con cajera real (fase 9)

## Checklist Fase 4

(ver CLAUDE.md — se marca aquí el avance)

- [x] 4.1 · [x] 4.2 · [x] 4.3 · [x] 4.4 · [~] 4.5 (falta validar con hardware) · [~] 4.6 (apertura adelantada) · [x] 4.7 · [ ] 4.8 · [ ] 4.9 · [ ] 4.10 · [ ] 4.11 · [ ] 4.12

## Decisiones locales de implementación (no de contrato)

- **D-caja-1**: credenciales del terminal (`api_token`, `hmac_secret`) viven en `catalog_meta` (SQLite). Cifrado en disco se evalúa en 4.10 (hardening)
- **D-caja-2**: verificación de PIN con bcryptjs en TS (no Rust): testeable en Vitest desde el día 1. Compatibilidad con hashes `$2y$` de Laravel cubierta por test con hash real de PHP
- **D-caja-3**: el anti fuerza bruta local del PIN es POR TERMINAL (5 fallos → 1 min), no por usuario — sin identificar al usuario antes de acertar el PIN, el bloqueo atribuible solo puede hacerlo el servidor
- **D-caja-4** (actualizada con @3a8fb67): el descuento pide PIN solo POR ENCIMA de `settings.max_discount_percent` (del bootstrap, aplica offline); el evento registra `supervisor_user_id`
- **D-caja-7**: en cobro mixto el `amount` de cada pago se recorta a lo que FALTA; el cambio solo sale de filas de efectivo (`amount_tendered − amount`)
- **D-caja-8**: `catalog_version` guardada es la de la PRIMERA página del pull (los cambios de mitad de descarga se re-traen en el próximo delta)
- **D-caja-5**: balanza con precio embebido → línea `1.000 × total de la etiqueta` (la etiqueta es el hecho; el peso no viaja en el código y los montos cuadran al centavo). Peso embebido → `peso × precio del catálogo`
- **D-caja-6**: multiplicador `n*` es de UN solo uso (se consume con el próximo escaneo) y no aplica a pesables

## Preguntas abiertas (para aterrizar en SyntechPOS si aplica)

- [x] ~~Seeder sin row_version~~ ✅ RESUELTA en SyntechPOS@3a8fb67: WithoutModelEvents eliminado + test de regresión; además `BulkCatalogSeeder` (10k SKUs con barcode) para medir el CA 4.2: `php artisan db:seed --class=BulkCatalogSeeder`
- [ ] **Flujo "Terminal desvinculada" sin construir en la caja**: si el servidor revoca el token (401/403), hoy la app queda atrapada con credenciales muertas. Falta la pantalla/flujo de re-vinculación (endpoints.md, códigos transversales) — agendar en 4.x
- [x] ~~D21 ecf_enabled~~ ✅ APLICADA en el ticket (4.5): `settings.ecf_enabled` baja en bootstrap y aplica offline (default conservador false); sin e-CF no hay QR ni leyenda. Queda pendiente aplicarla en la pantalla de Estado (4.10) y en el polling de ecf-results (4.9)
- [x] ~~Tasa de venta por departamento~~ ✅ RESUELTA en SyntechPOS@3a8fb67: `departments.tax_category` (default ITBIS18; Frutas y Verduras EXENTO en el demo) — ya viaja en el delta; la caja debe usar la tasa del departamento en el modal
- [x] ~~Settings del negocio~~ ✅ RESUELTA en SyntechPOS@3a8fb67: `GET /sync/bootstrap` ahora trae `settings` con claves CURADAS: `max_discount_percent` (default 10) y `allow_department_sale` (default true) — editables en el panel; la caja los aplica offline y los refresca al re-bootstrapear

- [x] ~~426/X-Client-Version~~ ✅ RESUELTA en SyntechPOS@d9074fd: middleware `RequireMinimumClientVersion` en la bajada (catalog/ecf-results/bootstrap); `/sync/events` y `/ping` quedan FUERA a propósito (el outbox se drena antes de actualizar; el ping es quien INFORMA el mínimo). 426 trae `min_client_version` + `client_version` en el body
- [x] ~~barcodes en el spec~~ ✅ RESUELTA en SyntechPOS@d9074fd: ejemplo corregido a objetos `[{ "barcode": "…" }]`
- [x] ~~Lockout de PIN~~ ✅ RESPONDIDA en SyntechPOS@8f71b2a: ui-caja §3 reformulado a espera POR TERMINAL (lo implementado es lo correcto); el bloqueo atribuible lo hará el servidor al reconciliar
- [x] ~~Réplica de usuarios~~ ✅ RESPONDIDA en SyntechPOS@8f71b2a: los usuarios bajan en `GET /sync/catalog` (no en bootstrap) con `id, name, role, pin_hash, is_active, row_version` — el seed dev de 4.1 se reemplaza por el delta real en 4.2

---

## Bitácora

### 2026-06-07 — 4.7 CERRADA: el worker del outbox y el ciclo completo probado e2e

- **`drainOutbox`** (deps inyectadas, 9 tests): lotes de máx. 50 en orden ULID hasta vaciar; TODOS los status confirman localmente (`quarantined` se reporta — el forense vive en el servidor); fallo de red → backoff exponencial 1s→2s→4s…máx 5 min con jitter ±20% (`lib/backoff.ts` puro); 401/403 → `terminal.markRevoked()` (barra ROJA "Atención requerida", sin martillar el servidor)
- **Disparadores**: tras cada venta y cada apertura (`drainNow`) + cada 15 seg; `min_client_version` de cada respuesta se guarda (semilla de 4.12)
- **E2E contra el servidor real con terminal DEDICADO** ("Caja 2 (e2e)", código `654321` — no toca la caja vinculada de Javier): vinculación → catálogo → **`cash_session.opened` + `sale.completed` FIRMADOS por nosotros → `processed`/`processed`** → reenvío del mismo lote → **`duplicate`/`duplicate`** ✓ — el CA "reenviar no duplica" probado contra el servidor de verdad
- El e2e consume el código de Caja 2: restaurarlo con tinker (`status unlinked + link_code 654321`) — **sugerencia para SyntechPOS**: que el seeder demo cree también "Caja 2 (e2e)"
- La réplica del e2e ahora carga TODAS las migraciones dinámicamente (se desfasó con la 0004 — corregido)
- **138 tests**

### 2026-06-07 — 4.5: impresión ESC/POS (código completo; falta el hardware)

- **Builder ESC/POS puro** (`src/services/escpos.ts`): comandos estándar compatibles con genéricas (2Connect/Xprinter) y Epson — CP850 para ñ/acentos, QR nativo GS(k, corte parcial, pulso de gaveta ESC p 0. Bytes testeados sin impresora (14 tests)
- **Ticket 80mm** (`src/services/ticket.ts`): encabezado del negocio (bootstrap), líneas con descuentos, **desglose ITBIS por tasa**, pagos/cambio, y QR del e-CF **o leyenda de CONTINGENCIA** (D9) — ambos caminos listos desde ya. Página de prueba con diagnóstico de acentos+QR
- **Transporte Rust** (`src-tauri/src/printer.rs`): USB = primera interfaz clase 7 con bulk OUT (rusb, libusb empaquetado — sin deps del sistema); red = RAW a :9100 con timeouts. Errores en español de cajera
- **Config en menú F10**: USB/red + IP + Imprimir prueba (guarda en catalog_meta)
- **Cobro**: gaveta (solo efectivo) + ticket en un solo viaje, SIN bloquear; si falla → toast rojo persistente "Ticket pendiente de imprimir" + **Reimprimir** (la venta ya está a salvo en el outbox)
- **128 tests** · La impresora 2Connect de Javier aún no se conecta: al enchufarla → F10 → Impresora → prueba. Posibles ajustes con hardware real: QR nativo vs raster, columnas (48 vs 42), permisos USB de macOS

### 2026-06-07 — 4.4: COBRO + apertura de sesión + el primer evento firmado

- **Fundación de eventos** (innegociable de CLAUDE.md cubierta): ULID propio monotónico (48+80 bits, mismo ms jamás se desordena), `occurred_at` ISO con offset local, `canonicalJson` + HMAC-SHA256 con WebCrypto que **reproduce byte a byte** `firma-hmac.json`
- **`buildSaleCompletedPayload` reproduce campo a campo** el fixture del contrato; cliente inline solo sin id; `is_credit` por método; `buildSessionOpenedPayload` §4.3
- **Apertura de sesión adelantada de 4.6** (sale.completed exige `cash_session_ulid`): fondo + Enter → `cash_session.opened` firmado al outbox (FIFO lo entrega antes que las ventas) → a vender. Guard login → ¿sesión? → apertura | venta. Pendiente de 4.6: cierre con arqueo CIEGO, retiros, reporte Z, sesión de OTRO cajero
- **Pantalla COBRO** (ui-caja §6): EXACTO preseleccionado (pago justo = 2 pulsaciones), +100/+200/+500/+1000, cambio en vivo verde, mixto (Falta → 0 habilita), tarjeta/transf con referencia, crédito F7 (cliente registrado; sin cliente → F4; excede límite → PIN con el dato visible). CONFIRMAR: `ticket_number` local → evento firmado → outbox → venta limpia → toast "Venta #N — cambio RD$ X"
- **Contrato @3a8fb67 integrado**: `departments.tax_category` (migración 0004) define la tasa de venta por departamento; settings curados del bootstrap (`max_discount_percent` gobierna el PIN del descuento en BigInt; `allow_department_sale` apaga el modal); se refrescan al abrir la app
- **⏶ pendientes REALES** en la barra de estado (cuenta del outbox cada 30 s y tras cada venta)
- **114 tests** · pendiente manual: flujo completo apertura → venta → cobro; impresión/gaveta = 4.5; worker de envío = 4.7

### 2026-06-07 — 4.3: pantalla de venta completa

- **Aritmética decimal BigInt** (`src/lib/decimal.ts`): centavos/milésimas, half-up como PHP; `itbisBreakdown` reproduce el fixture (150.00 → 127.12 + 22.88) y base+impuesto SIEMPRE suman el total
- **Parser de balanza TS** (`src/services/scale-barcode.ts`): pasa los 9 casos canónicos de `scale-barcodes.json`
- **Modelo de venta** (`src/services/sale.ts`): líneas y totals con la MISMA forma del evento sale.completed — al cobrar (4.4) se firman sin transformación. `computeTotals` reproduce exacto el fixture del contrato
- **Store de venta** (`src/stores/sale.ts`): persistencia tecla a tecla a `current_sale` (test de crash-recovery: store nuevo sobre la misma base recupera la venta intacta), merge de repetidos, pesables siempre línea nueva, `n*` de un solo uso, suspendidas máx 5
- **InputEscaneo**: dueño del foco (blur sin modal → re-foco <50ms; las teclas imprimibles de cualquier parte caen al input), búsqueda en vivo 2+ letras, clasificador puro testeado
- **Pantalla VENTA**: layout 60/40, TOTAL 56px, F4 cliente (buscar/crear rápido tipo 31, aviso moroso, crédito disponible), F6 cantidad/descuento (PIN supervisor), F8/F9 suspender/recuperar, F10 menú, F12 cobro (stub 4.4), ESC + Deshacer 5 seg, beep + venta por departamento (`product_id null`)
- **84 tests** (83 unit + e2e) · migración 0003 (`unknown_codes`)
- Consultas del lookup verificadas contra la réplica real (PLU `20012` → Pollo fresco; búsqueda "arroz"; cliente RNC con crédito)
- **Guía de prueba manual**: escanear `7461234567890` (si existe) o teclear `20011` + Enter · `arroz` + Enter · `3*` y luego un código · `2020012003453` (balanza: Pollo 0.345 = 22.43) · código falso `999999` → beep + departamento · F6 con descuento → PIN `9999` · F8/F9 · ESC + Deshacer

### 2026-06-07 — 4.2 CERRADA: e2e completo en verde contra el servidor real

- `tests/e2e/flujo-completo.spec.ts` (se corre con `E2E=1 NODE_TLS_REJECT_UNAUTHORIZED=0 NODE_OPTIONS=--experimental-sqlite npm test`): vinculación con `123456` → bootstrap → pull paginado → réplica en SQLite REAL (node:sqlite con las mismas migraciones de la app) → **login PIN contra los `pin_hash` que bajó el delta** (María 1234 ✓, Ana supervisora 9999 ✓, PIN errado rechazado ✓) → ping con offset `-04:00` ✓
- El e2e destapó el bug del seeder (`WithoutModelEvents` → `row_version=0` → delta vacío); remediado a mano, fix real pendiente en SyntechPOS (ver Preguntas abiertas)
- El e2e consume el código de un solo uso: re-correr `php artisan db:seed` lo restaura. Credenciales locales de la app limpiadas para que la verificación visual arranque de cero
- Detectado de paso: falta el flujo "Terminal desvinculada" en la caja (token revocado → re-vincular)

### 2026-06-06 — 4.2: delta-sync de catálogo (vinculación e2e OK contra server.test)

- Javier vinculó la caja real contra `https://server.test` (`.env` con `VITE_API_URL`) ✓
- **Bajada completa**: `getBootstrap`/`getCatalogPage` tipados; réplicas con upserts multi-fila por chunks (CA 10k SKUs); barcodes se REEMPLAZAN por producto; bajas = `is_active=0`
- **`pullCatalog`**: cursor hasta agotar; guarda la versión de la PRIMERA página y SOLO al cerrar el lote (test: pull interrumpido no guarda nada). Pull al abrir + cada 5 min; sin red falla en silencio
- **Vinculación** ahora baja bootstrap + catálogo con progreso y REANUDA si quedó a medias (`catalog_synced_at` — un negocio vacío con versión 0 también cuenta como sincronizado, caso real detectado probando contra server.test)
- **Seed dev eliminado**: los cajeros llegan por el delta con su `pin_hash`; el PIN se asigna en el panel (Usuarios)
- Probado contra el servidor REAL con el token del terminal vinculado: `/sync/catalog?since=0` y `/sync/bootstrap` responden la forma exacta de endpoints.md ✓
- **36 tests en verde** · migración 0002 (cost/sku/phone)
- Notas server-side detectadas: el seeder demo no trae productos ni usuarios con PIN (bloquea el e2e completo); `trade_name` del negocio demo aparece como "Audit Bis 855" (¿polución de tests en la BD de dev?); `server_time` llega en UTC (+00:00) — el spec ejemplifica con offset -04:00; mensajes de validación sin traducir (`validation.required`)

### 2026-06-06 — endpoints.md validado contra el servidor real (@ad9c1dd)

- Los 6 endpoints de `docs/endpoints.md` cotejados contra routes + controllers + tests del servidor: **todo coincide** (shapes, códigos, throttle, página 500, lote 50, statuses de e-CF, campos de bootstrap incl. `scale_format` con default `weight`)
- **Vector de firma HMAC reproducido byte a byte en Node** (claves ordenadas + `JSON.stringify` + HMAC-SHA256): `cadena_canonica_sha256` y `signature_esperada` de `fixtures/firma-hmac.json` coinciden — la réplica TS de 4.2/4.7 es viable tal como la describe el spec
- 2 hallazgos para SyntechPOS (ver Preguntas abiertas): 426/X-Client-Version sin implementar server-side; ejemplo de `barcodes` desactualizado en eventos-sync §7.1
- Nota de consumo: las filas del delta traen MÁS columnas que las del ejemplo (p. ej. `products` incluye `cost`, `sku`; `barcodes` trae `id`/`product_id`) — la caja toma lo que necesita e ignora el resto

### 2026-06-06 — 4.1: esqueleto, vinculación, login PIN y kiosk

- **Esqueleto**: Tauri 2 + Vue 3 + TS + Pinia + vue-router + tauri-plugin-sql (SQLite) + Tailwind 4 con los tokens de DISENO.md (`src/assets/main.css` `@theme`) + Inter/JetBrains Mono empaquetadas offline (fontsource) + Vitest
- **SQLite local** (esquema.md §11): migración `0001_esquema_inicial.sql` — `catalog_meta` (KV), réplicas (`products`, `barcodes`, `departments`, `customers`, `payment_methods`, `users`), `outbox`, `current_sale`, `suspended_sales`, `local_sessions`, `ecf_results`
- **Vinculación** (pantalla 1): código 6 dígitos contra `POST /terminals/link` real; persiste token + `hmac_secret` + datos del ticket; 5 códigos errados → espera 1 min; sin red → mensaje claro
- **Login PIN** (pantalla 2): offline, bcrypt contra réplica local, teclado físico + touch; espera anti fuerza bruta persiste reinicios. SEED DEV temporal (`src/db/seed-dev.ts`): María 1234 (cajera), Ana 9999 (supervisora) — se elimina al cablear bootstrap en 4.2
- **Kiosk**: release = fullscreen sin chrome; cerrar/Cmd+Q interceptado en Rust → modal `PinAutorizacion` (supervisor) → `authorize_exit`. En dev la ventana es normal
- **Componentes ui** (inventario ui-caja.md §11): `BarraEstado` (con heartbeat `/ping` cada 30 s), `BotonAccion`, `TecladoNumerico`, `ModalBase` (focus-trap + devolución de foco), `PinAutorizacion`, `PieAtajos`
- **Tests**: 23 en verde (formato RD$ y hora 12h, lockout, login PIN con hash `$2y$` real de PHP, cliente de vinculación con respuesta exacta del servidor)
- Pendiente de 4.1: prueba end-to-end de vinculación contra el servidor local y validar kiosk en build release

### 2026-06-06 — Repo creado (decisión D20 de SyntechPOS)
- Javier decidió desarrollar la caja en repo separado del servidor
- Creado con: CLAUDE.md (reglas + plan Fase 4 + referencias al contrato en `SyntechPOS@d555795`), fixtures copiados con procedencia (`docs/fixtures/`), `.nvmrc` (22)
- El servidor ya expone vinculación (`/terminals/link`, código demo `123456`) y heartbeat (`/ping`) — la 4.1 tiene contra qué probar desde el día 1
- Estado del backend al arrancar esta fase: Fases 1-3 + 5 (construible) completas, 170 tests en verde
