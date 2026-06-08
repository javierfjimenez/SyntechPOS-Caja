-- Grid de productos (D24/D23): marca e imagen del producto bajan en el delta.
-- image_url es nullable (hoy SIEMPRE null → la caja muestra un avatar generado).
-- brand_id es atributo (no afecta precio ni fiscalidad). Tolerar ausencia.
ALTER TABLE products ADD COLUMN brand_id INTEGER;
ALTER TABLE products ADD COLUMN image_url TEXT;

CREATE TABLE brands (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL,
    is_active   INTEGER NOT NULL DEFAULT 1,
    row_version INTEGER NOT NULL DEFAULT 0
);

-- Las columnas/tabla nuevas nacen vacías; el delta INCREMENTAL no re-baja
-- filas sin cambios. Forzar UN re-pull completo (since=0) en el próximo sync
-- para backfill de brand_id/image_url/brands en terminales ya sincronizados.
UPDATE catalog_meta SET value = '0' WHERE key = 'catalog_version';

