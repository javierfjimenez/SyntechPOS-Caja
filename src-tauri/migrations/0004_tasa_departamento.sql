-- SyntechPOS@3a8fb67: el departamento define la tasa de la venta por
-- departamento (resuelve la pregunta abierta de 4.3). Default ITBIS18.
ALTER TABLE departments ADD COLUMN tax_category TEXT NOT NULL DEFAULT 'ITBIS18';
