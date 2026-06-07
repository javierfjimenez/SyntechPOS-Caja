# Referencia rápida de la API del servidor

> **DERIVADA, no fuente**: el contrato vive en `SyntechPOS/docs/specs/eventos-sync.md`.
> Esta es la guía práctica de consumo, verificada contra la implementación real
> (`SyntechPOS@ad9c1dd`, 195 tests). Si difiere del spec, manda el spec — y repórtalo.

Base local: `http://localhost:8000/api/v1` (`cd ../SyntechPOS/server && composer dev`)
Autenticación: `Authorization: Bearer {token}` (el token de la vinculación) en todo excepto `/terminals/link`.

---

## 1. POST /terminals/link — vinculación (sin auth, throttle 10/min)

```json
// → { "code": "123456", "app_version": "1.0.0" }       // código demo del seeder
// ← 201
{
  "token": "1|abc…",            // Bearer para TODO lo demás — guardar en catalog_meta
  "hmac_secret": "…64 chars…",  // SE ENTREGA UNA SOLA VEZ — firma de eventos
  "terminal": { "id": 1, "name": "Caja 1", "branch": "Sucursal Centro", "business": "Súper Demo" }
}
// ← 422 código inválido/vencido/usado: { "message": "Código de vinculación inválido o vencido…" }
```

## 2. GET /ping — heartbeat (cada 30 s)

```json
// ← 200
{ "status": "ok", "server_time": "2026-06-07T01:30:00-04:00", "min_client_version": "0.0.0" }
// ← 401 token inválido · 403 terminal revocada → pantalla "Terminal desvinculada"
```

## 3. POST /sync/events — subir el outbox

Lote **máx. 50**, en orden de outbox. Envelope y firma: contrato §3 (vector: `fixtures/firma-hmac.json`).

```json
// → { "events": [ { "ulid": "01JX…", "type": "sale.completed", "schema_version": 1,
//                    "occurred_at": "2026-06-07T10:00:00-04:00", "payload": { … },
//                    "signature": "…64 hex…" } ] }
// ← 200 — SIEMPRE responde por evento, en el mismo orden:
{
  "results": [
    { "ulid": "01JX…", "status": "processed" },
    { "ulid": "01JY…", "status": "duplicate" },                                  // reenvío: inofensivo
    { "ulid": "01JZ…", "status": "quarantined", "detail": "totals: required" },  // NO reintentar: marcar confirmado
    { "ulid": "01K0…", "status": "deferred",    "detail": "La sesión … no existe aún." } // el SERVIDOR reintenta solo
  ],
  "min_client_version": "0.0.0",
  "server_time": "2026-06-07T10:00:02-04:00"
}
```
- `duplicate`/`quarantined`/`deferred` se tratan como `processed` para el outbox (marcar confirmado y seguir)
- 5xx/timeout/red → backoff exponencial con jitter: 1s → 2s → 4s… máx 5 min (contrato §2)
- Este endpoint NUNCA responde 426: el flush va antes de actualizar (D14)

## 4. GET /sync/catalog?since={v}&cursor={c} — delta de catálogo

```json
// ← 200
{
  "catalog_version": 1438,            // guardar SOLO al terminar el lote completo
  "products": [ { "id": 88, "name": "…", "price": "75.00", "tax_category": "ITBIS18",
                  "is_weighable": false, "department_id": 3, "is_active": true,
                  "row_version": 1431, "barcodes": [ { "barcode": "7461234567890" } ] } ],
  "departments": [ … ],
  "customers":   [ … ],               // con credit_limit/credit_balance (crédito offline)
  "payment_methods": [ … ],
  "users": [ { "id": 7, "name": "María P.", "role": "cashier",
               "pin_hash": "$2y$…", "is_active": true, "row_version": 1435 } ],
  "next_cursor": "eyJwIjo4OH0="       // null = lote completo; si no, repetir con cursor
}
```
- `since=0` = catálogo completo (vinculación / re-sync) · página de 500 filas
- Las BAJAS llegan como filas con `is_active: false` (desactivar en la réplica, no borrar)
- Pull: al abrir + cada 5 min + botón manual (contrato §7.1)

## 5. GET /sync/ecf-results?since={cursor} — QR para reimpresión timbrada

```json
// ← 200 (solo ventas de ESTE terminal, máx 100)
{
  "results": [ { "sale_ulid": "01JX…", "encf": "E320000001042", "security_code": "aBcD12",
                 "dgii_url": "https://ecf.dgii.gov.do/…", "qr_image": "data:image/png;base64,…",
                 "status": "accepted", "cursor": 9912 } ],
  "next_cursor": null
}
```
- Polling cada 30 s SOLO cuando hay ventas sin QR (contrato §7.2)
- `status` puede ser `sent` (QR ya imprimible) | `accepted` | `conditional`

## 6. GET /sync/bootstrap — datos de la vinculación

```json
// ← 200
{
  "business": { "rnc": "131234567", "legal_name": "…", "trade_name": "Súper Demo",
                "address": "…", "phone": "…", "receipt_footer": "…", "scale_format": "weight" },
  "branch":   { "id": 1, "name": "Sucursal Centro", "address": "…" },
  "terminal": { "id": 1, "name": "Caja 1" },
  "catalog_version": 1438,
  "min_client_version": "0.0.0",
  "server_time": "…"
}
```
- El catálogo completo se baja aparte con `/sync/catalog?since=0` (paginado)

---

## Códigos transversales

| Código | Significado | La caja… |
|---|---|---|
| 401 | Token inválido/revocado | Pantalla "Terminal desvinculada" (re-vincular) |
| 403 | Terminal revocada | Igual que 401 |
| 422 | Request malformado (no un evento malo) | Bug del cliente: log + no reintentar igual |
| 429/5xx | Throttle / error servidor | Backoff exponencial + jitter, máx 5 min |
