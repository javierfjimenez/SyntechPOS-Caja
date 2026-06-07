# Estado del Proyecto — Bitácora (Caja)

> Memoria viva del repo de caja. Lo más reciente arriba. El estado del producto completo vive en `SyntechPOS/docs/ESTADO.md`.

## 📍 AHORA

- **Fase actual**: FASE 4 — POS de caja (arranque)
- **Siguiente tarea**: 4.1 Esqueleto Tauri 2 + Vue 3 + SQLite + kiosk + vinculación/login
- **Bloqueos**: toolchain de Javier incompleto —
  - [ ] `nvm alias default 22` (Node 22 ya instalado, falta hacerlo default)
  - [ ] Instalar Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
  - [ ] Verificar Xcode CLT: `xcode-select -p`
  - [ ] Crear repo privado `SyntechPOS-caja` en GitHub y conectar este folder (`git remote add origin …` + push)

## Checklist Fase 4

(ver CLAUDE.md — se marca aquí el avance)

- [ ] 4.1 · [ ] 4.2 · [ ] 4.3 · [ ] 4.4 · [ ] 4.5 · [ ] 4.6 · [ ] 4.7 · [ ] 4.8 · [ ] 4.9 · [ ] 4.10 · [ ] 4.11 · [ ] 4.12

---

## Bitácora

### 2026-06-07 — Repo creado (decisión D20 de SyntechPOS)
- Javier decidió desarrollar la caja en repo separado del servidor
- Creado con: CLAUDE.md (reglas + plan Fase 4 + referencias al contrato en `SyntechPOS@d555795`), fixtures copiados con procedencia (`docs/fixtures/`), `.nvmrc` (22)
- El servidor ya expone vinculación (`/terminals/link`, código demo `123456`) y heartbeat (`/ping`) — la 4.1 tiene contra qué probar desde el día 1
- Estado del backend al arrancar esta fase: Fases 1-3 + 5 (construible) completas, 170 tests en verde
