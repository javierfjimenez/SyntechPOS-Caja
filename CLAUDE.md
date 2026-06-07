# SyntechPOS — Caja (POS Tauri)

Cliente de caja del POS SaaS SyntechPOS: app de escritorio **Tauri 2 + Vue 3 + TypeScript + SQLite** para supermercados independientes de RD. Funciona 100% offline; las ventas son eventos inmutables que viajan a la nube cuando hay internet.

## Protocolo de continuidad (LEER PRIMERO en cada sesión)

1. **Lee `docs/ESTADO.md`** — tarea actual, último avance, bloqueos
2. **El CONTRATO vive en el repo hermano `SyntechPOS`** (`../SyntechPOS/`) — este repo lo implementa, JAMÁS lo redefine (decisión D20 de ese repo):
   - `docs/specs/eventos-sync.md` — el contrato de sync (envelope, eventos, HMAC, idempotencia) ← LA BIBLIA de este repo
   - `docs/specs/ui-caja.md` — wireframes de las 8 pantallas, política de foco, atajos, presupuestos de pulsaciones
   - `docs/specs/topologia-tienda.md` — cómo se montan N cajas
   - `docs/DISENO.md` — tokens, componentes, glosario en español. ES LEY para toda pantalla
   - `docs/specs/esquema.md` §11 — el contrato del SQLite local
   - Implementado contra el commit `8f71b2a` de SyntechPOS — si los specs cambian, actualizar esta referencia
3. **Cambios de contrato**: aterrizan PRIMERO en SyntechPOS (spec + servidor); este repo los implementa después referenciando el hash nuevo. El `schema_version` del envelope es el seguro de compatibilidad
4. **Fixtures compartidos**: `docs/fixtures/` son COPIAS de SyntechPOS (ver `PROCEDENCIA.md`); los tests TS DEBEN pasar los mismos casos que pasa el servidor en PHP
5. **Al cerrar trabajo significativo**: actualiza `docs/ESTADO.md` (bitácora con fecha + checkboxes)

## Reglas del proyecto (heredadas de SyntechPOS)

- **Idioma**: UI, mensajes, docs y commits en ESPAÑOL. Identificadores de código en INGLÉS
- **PROHIBIDO** copiar código del proyecto viejo SYNTECH-POS/UltimatePOS (licencia CodeCanyon)
- **Tests desde el día 1**: Vitest (TS) + tests de Rust donde aplique. Cobertura innegociable: parser de balanza (contra `docs/fixtures/scale-barcodes.json`), construcción/firma de eventos, outbox (idempotencia y orden), crash-recovery de la venta en curso
- **LA CAJA NUNCA SE BLOQUEA**: ni por internet, ni por stock, ni por mora del cliente, ni por impresora sin papel
- **Ventas = eventos inmutables**: ULID generado aquí, al outbox de SQLite, firmados con HMAC del terminal. Reenviar es siempre seguro (idempotencia server-side)
- **El foco del teclado es sagrado**: el input de escaneo es el dueño; los modales lo capturan y lo DEVUELVEN (ui-caja.md §1) — el escáner jamás dispara al vacío
- **UI solo con `@/components/ui/`** (los 19 componentes de ui-caja.md §11) y los tokens de DISENO.md en `tailwind.config`. Cero CSS ad-hoc por pantalla
- **Montos como strings decimales** en eventos (`"150.00"`) — jamás floats en lo fiscal

## Convención de commits

`tipo(módulo): resumen` en español, imperativo, pequeños y frecuentes (igual que SyntechPOS).
**Módulos de este repo**: `ui`, `venta`, `cobro`, `sync`, `impresion`, `sesion`, `hardware`, `infra`
Ejemplos: `feat(venta): input de escaneo con multiplicador 3*` · `fix(sync): el outbox respeta orden ULID tras reconexión`

## Stack

- Tauri 2 (Rust) · Vue 3 + TypeScript + Pinia · SQLite (plugin oficial tauri-plugin-sql) · Tailwind con tokens de DISENO.md
- Impresión ESC/POS 80mm (USB y red) · escáner como teclado · gaveta por pulso de impresora
- Servidor de desarrollo: el repo hermano (`cd ../SyntechPOS/server && composer dev`) — API en `http://localhost:8000/api/v1`, vinculación con el código fijo `123456` del seeder demo

## FASE 4 — Plan de trabajo (del PLAN.md maestro, 8-10 semanas)

- [ ] 4.1 Esqueleto Tauri 2 + Vue 3 + SQLite; login de cajero contra terminal registrado; kiosk mode
- [ ] 4.2 Delta-sync de catálogo (CA: 10k SKUs <30 seg primera vez, <2 seg delta)
- [ ] 4.3 Pantalla de venta: input siempre-enfocado, búsqueda, pesables, multiplicador `n*`, descuentos con permiso, cliente (RNC→tipo 31), suspender/recuperar
- [ ] 4.4 Cobro: efectivo con cambio gigante, tarjeta (ref. manual), crédito (límite), mixto; gaveta
- [ ] 4.5 Impresión ESC/POS: ticket con desglose ITBIS, QR e-CF, datos del negocio
- [ ] 4.6 Sesiones de caja: apertura con fondo, retiros, cierre con arqueo CIEGO y reporte Z
- [ ] 4.7 Outbox: todo evento ULID a SQLite; worker con reintentos exponenciales (CA: reenviar no duplica)
- [ ] 4.8 Devoluciones → NC tipo 34 con PIN supervisor
- [ ] 4.9 Contingencia: ticket sin QR con leyenda; cola visible; reimpresión timbrada al reconectar
- [ ] 4.10 Hardening: crash/apagón a mitad de venta no pierde ni duplica (CA), auto-update, logs
- [ ] 4.11 Matriz de hardware certificado → documentar en SyntechPOS/docs/specs/hardware.md
- [ ] 4.12 Versionado: respetar `min_client_version` del servidor; flush del outbox ANTES de actualizar
- **CA de fase**: cajera real completa venta de 20 items en <60 seg; apagar el WiFi a mitad de jornada no detiene la operación

## Lo que el servidor YA tiene esperando (no construir a ciegas: probar contra él)

**TODO el protocolo de sync está construido y probado server-side** (SyntechPOS@8f71b2a, 195 tests):
- `POST /api/v1/terminals/link` — vinculación → token + hmac_secret
- `GET /api/v1/ping` — heartbeat con `min_client_version` y `server_time`
- `POST /api/v1/sync/events` — sube el outbox (firma HMAC, idempotencia, respuesta por evento)
- `GET /api/v1/sync/catalog?since&cursor` — delta: products(+barcodes), departments, customers, payment_methods y **users** (con `role` y `pin_hash` para el login offline)
- `GET /api/v1/sync/ecf-results?since` — QR de e-CF por terminal (reimpresión)
- `GET /api/v1/sync/bootstrap` — datos del ticket + formato de balanza
- Vector de firma: `docs/fixtures/firma-hmac.json` — la implementación TS del HMAC debe reproducirlo byte a byte ANTES de enviar el primer evento real

## Entorno local

- Node 22 (`.nvmrc` — usa `nvm use`), Rust estable vía rustup, Xcode CLT
- El backend corre desde `../SyntechPOS/server` con MySQL en DBngin (ver CLAUDE.md de allá)
