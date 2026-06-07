-- Columnas que el delta real trae y la venta necesita (4.2):
-- cost → unit_cost de las líneas de venta (4 decimales, string)
-- sku  → búsqueda por código en la pantalla de venta (4.3)
-- phone → BuscadorCliente (ui-caja.md §9.3)
ALTER TABLE products ADD COLUMN cost TEXT;
ALTER TABLE products ADD COLUMN sku TEXT;
ALTER TABLE customers ADD COLUMN phone TEXT;
