# Estado del Proyecto — Bitácora (Caja)

> Memoria viva del repo de caja. Lo más reciente arriba. El estado del producto completo vive en `SyntechPOS/docs/ESTADO.md`.

## 📍 AHORA

- **Fase actual**: FASE 4 — POS de caja
- **Tarea actual**: 4.2 construida — falta el e2e completo (necesita datos demo en el servidor: productos + un cajero CON PIN; el negocio demo está vacío)
- **Siguiente tarea**: 4.3 Pantalla de venta (input siempre-enfocado, parser de balanza contra `scale-barcodes.json`, multiplicador `n*`)
- **Bloqueos**: el seeder demo de SyntechPOS no crea productos ni usuarios con PIN — para probar 4.2/4.3 de verdad hay que sembrar datos allá o crearlos en el panel
  - [ ] Pendiente menor: `nvm alias default 22`

## Checklist Fase 4

(ver CLAUDE.md — se marca aquí el avance)

- [x] 4.1 · [~] 4.2 · [ ] 4.3 · [ ] 4.4 · [ ] 4.5 · [ ] 4.6 · [ ] 4.7 · [ ] 4.8 · [ ] 4.9 · [ ] 4.10 · [ ] 4.11 · [ ] 4.12

## Decisiones locales de implementación (no de contrato)

- **D-caja-1**: credenciales del terminal (`api_token`, `hmac_secret`) viven en `catalog_meta` (SQLite). Cifrado en disco se evalúa en 4.10 (hardening)
- **D-caja-2**: verificación de PIN con bcryptjs en TS (no Rust): testeable en Vitest desde el día 1. Compatibilidad con hashes `$2y$` de Laravel cubierta por test con hash real de PHP
- **D-caja-3**: el anti fuerza bruta local del PIN es POR TERMINAL (5 fallos → 1 min), no por usuario — sin identificar al usuario antes de acertar el PIN, el bloqueo atribuible solo puede hacerlo el servidor

## Preguntas abiertas (para aterrizar en SyntechPOS si aplica)

- [ ] **426/X-Client-Version sin implementar server-side**: eventos-sync.md §2 exige el header y el `426 Upgrade Required` bajo `min_client_version`, pero NINGUNA ruta del servidor (`@ad9c1dd`) lee el header ni responde 426. La caja ya envía el header en toda llamada y respetará `min_client_version` client-side (4.12) — el middleware falta en el servidor
- [ ] **`barcodes` en el delta: spec desactualizado**: eventos-sync.md §7.1 ejemplifica `"barcodes": ["746…"]` (strings), pero la implementación (y su test) devuelve objetos `[{ "barcode": "746…" }]`. `endpoints.md` refleja la implementación; el ejemplo del spec debe corregirse en SyntechPOS
- [x] ~~Lockout de PIN~~ ✅ RESPONDIDA en SyntechPOS@8f71b2a: ui-caja §3 reformulado a espera POR TERMINAL (lo implementado es lo correcto); el bloqueo atribuible lo hará el servidor al reconciliar
- [x] ~~Réplica de usuarios~~ ✅ RESPONDIDA en SyntechPOS@8f71b2a: los usuarios bajan en `GET /sync/catalog` (no en bootstrap) con `id, name, role, pin_hash, is_active, row_version` — el seed dev de 4.1 se reemplaza por el delta real en 4.2

---

## Bitácora

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
