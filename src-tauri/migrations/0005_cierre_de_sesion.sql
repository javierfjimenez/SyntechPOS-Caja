-- Cierre de sesión (4.6): quién cerró, la diferencia del arqueo y el
-- detalle (declarado/esperado JSON) — alimenta el aviso de la próxima
-- apertura ("Diferencia del último arqueo") y la historia local.
ALTER TABLE local_sessions ADD COLUMN closed_by INTEGER;
ALTER TABLE local_sessions ADD COLUMN difference TEXT;
ALTER TABLE local_sessions ADD COLUMN closing_data TEXT;
