-- Esquema inicial del SQLite local de la caja (esquema.md §11 del repo SyntechPOS).
-- Regla de oro: la caja NUNCA escribe en tablas de réplica; el servidor NUNCA
-- conoce current_sale. Hacia arriba solo viajan eventos del outbox.

-- Clave-valor: catalog_version local, credenciales del terminal (token, hmac_secret)
-- y datos del negocio/sucursal/terminal para el ticket.
CREATE TABLE catalog_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- ── Réplicas de solo-lectura (las llena el delta-sync, tarea 4.2) ──────────────

CREATE TABLE departments (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL,
    is_active   INTEGER NOT NULL DEFAULT 1,
    row_version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE products (
    id            INTEGER PRIMARY KEY,
    name          TEXT    NOT NULL,
    price         TEXT    NOT NULL, -- string decimal "75.00" — jamás float en lo fiscal
    tax_category  TEXT    NOT NULL, -- ITBIS18 | ITBIS16 | ITBIS0 | EXENTO
    is_weighable  INTEGER NOT NULL DEFAULT 0,
    department_id INTEGER NOT NULL,
    is_active     INTEGER NOT NULL DEFAULT 1,
    row_version   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE barcodes (
    code       TEXT    PRIMARY KEY,
    product_id INTEGER NOT NULL
);
CREATE INDEX idx_barcodes_product ON barcodes (product_id);

CREATE TABLE customers (
    id              INTEGER PRIMARY KEY,
    name            TEXT    NOT NULL,
    document_type   TEXT,             -- rnc | cedula
    document_number TEXT,
    credit_limit    TEXT,             -- string decimal
    credit_balance  TEXT,             -- string decimal
    is_active       INTEGER NOT NULL DEFAULT 1,
    row_version     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE payment_methods (
    id          INTEGER PRIMARY KEY,
    code        TEXT    NOT NULL,     -- cash | card | transfer | credit
    name        TEXT    NOT NULL,
    is_active   INTEGER NOT NULL DEFAULT 1,
    row_version INTEGER NOT NULL DEFAULT 0
);

-- Usuarios del negocio: el PIN se verifica 100% offline contra esta réplica
-- (ui-caja.md §3). pin_hash es bcrypt; el pin_hmac del servidor NO baja.
CREATE TABLE users (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL,
    role        TEXT    NOT NULL,     -- owner | supervisor | cashier
    pin_hash    TEXT,
    is_active   INTEGER NOT NULL DEFAULT 1,
    row_version INTEGER NOT NULL DEFAULT 0
);

-- ── Origen-caja (lo único que escribe la app) ──────────────────────────────────

-- Outbox de eventos inmutables: el sobre se firma al CREARSE (offline).
-- Reintento exponencial con jitter, máx 5 min. Ilimitado en disco.
CREATE TABLE outbox (
    ulid          TEXT    PRIMARY KEY,
    type          TEXT    NOT NULL,
    payload       TEXT    NOT NULL,   -- JSON del sobre completo (envelope firmado)
    status        TEXT    NOT NULL DEFAULT 'pending', -- pending | sent | confirmed
    attempts      INTEGER NOT NULL DEFAULT 0,
    next_retry_at TEXT,
    created_at    TEXT    NOT NULL
);
CREATE INDEX idx_outbox_status ON outbox (status, ulid);

-- Venta en curso: persistida tecla a tecla → crash/apagón no pierde ni duplica (CA 4.10)
CREATE TABLE current_sale (
    id         INTEGER PRIMARY KEY CHECK (id = 1), -- una sola fila
    data       TEXT    NOT NULL,                   -- JSON de la venta en construcción
    updated_at TEXT    NOT NULL
);

-- Ventas suspendidas (máx. 5 — ui-caja.md §9.4); sobreviven reinicio
CREATE TABLE suspended_sales (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    data            TEXT    NOT NULL,
    cashier_user_id INTEGER NOT NULL,
    suspended_at    TEXT    NOT NULL
);

-- Sesión de caja activa + histórico local (acumuladores del reporte X llegan en 4.6)
CREATE TABLE local_sessions (
    ulid           TEXT    PRIMARY KEY,
    opened_by      INTEGER NOT NULL,
    opening_amount TEXT    NOT NULL,  -- string decimal
    opened_at      TEXT    NOT NULL,
    closed_at      TEXT,
    z_number       INTEGER,
    status         TEXT    NOT NULL DEFAULT 'open' -- open | closed
);

-- e-CF resueltos que baja el servidor → reimpresión timbrada (D9)
CREATE TABLE ecf_results (
    sale_ulid     TEXT    PRIMARY KEY,
    encf          TEXT    NOT NULL,
    security_code TEXT    NOT NULL,
    dgii_url      TEXT    NOT NULL,
    qr_image      TEXT    NOT NULL,
    status        TEXT    NOT NULL,
    cursor        INTEGER NOT NULL
);
