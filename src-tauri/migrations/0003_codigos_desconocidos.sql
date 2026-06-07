-- Log local de códigos escaneados no reconocidos (ui-caja §9.2): el
-- backoffice los mostrará como candidatos a alta de producto.
CREATE TABLE unknown_codes (
    code         TEXT    PRIMARY KEY,
    times        INTEGER NOT NULL DEFAULT 1,
    last_seen_at TEXT    NOT NULL
);
