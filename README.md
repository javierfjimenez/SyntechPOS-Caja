# SyntechPOS — Caja (POS)

Cliente de punto de venta para SyntechPOS: app de escritorio **Tauri 2 + Vue 3 + TypeScript + SQLite**, 100% operativa sin internet, con impresión ESC/POS.

- El **servidor y los specs del contrato** viven en el repo [`SyntechPOS`](https://github.com/javierfjimenez/SyntechPOS) (privado)
- Lee `CLAUDE.md` para las reglas del proyecto y `docs/ESTADO.md` para saber dónde vamos

## Desarrollo

Requisitos: Node 22 (`nvm use`), Rust estable (`rustup`), Xcode CLT.

```bash
npm install
npm run tauri dev      # contra el servidor local (SyntechPOS/server: composer dev)
```
