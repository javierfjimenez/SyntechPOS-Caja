import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { ping } from "@/api/terminals";
import { linkTerminal } from "@/api/terminals";
import { getBootstrap, getCatalogPage } from "@/api/sync";
import { applyCatalogPage, type DbExecutor } from "@/db/replica";
import { findSupervisorByPin, findUserByPin, type UserRow } from "@/services/auth";
import { pullCatalog } from "@/services/catalog-sync";

/**
 * E2E contra el servidor REAL (Herd: https://server.test) con el CÓDIGO DE
 * PRODUCCIÓN de la caja: vinculación → bootstrap → pull paginado → réplica
 * SQLite (node:sqlite con las MISMAS migraciones) → login PIN → heartbeat.
 *
 * Correr con:  E2E=1 NODE_TLS_REJECT_UNAUTHORIZED=0 npm test
 * (consume el link_code demo 123456 — re-sembrar el servidor lo restaura)
 * Requiere Node con node:sqlite (--experimental-sqlite en Node 22).
 */

const RUN = process.env.E2E === "1";
const BASE_URL = process.env.E2E_API_URL ?? "https://server.test/api/v1";
const APP_VERSION = "0.1.0";
const LINK_CODE = process.env.E2E_LINK_CODE ?? "123456";

/** Adaptador DbExecutor → node:sqlite (convierte $N posicionales a ?) */
async function makeDb(): Promise<DbExecutor & { all: (sql: string) => unknown[] }> {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  const here = dirname(fileURLToPath(import.meta.url));
  for (const file of ["0001_esquema_inicial.sql", "0002_replica_completa.sql", "0003_codigos_desconocidos.sql"]) {
    db.exec(readFileSync(join(here, "../../src-tauri/migrations", file), "utf8"));
  }
  return {
    async execute(sql: string, params: unknown[] = []) {
      db.prepare(sql.replace(/\$\d+/g, "?")).run(...(params as never[]));
    },
    all: (sql: string) => db.prepare(sql).all(),
  };
}

describe.runIf(RUN)("flujo completo contra el servidor real", () => {
  it("vincular → bootstrap → catálogo → login PIN → ping", async () => {
    // 1. Vinculación (código de un solo uso del seeder demo)
    const link = await linkTerminal(LINK_CODE, { baseUrl: BASE_URL, appVersion: APP_VERSION });
    expect(link.token).toBeTruthy();
    expect(link.hmac_secret).toHaveLength(64);
    expect(link.terminal.name).toBe("Caja 1");

    const opts = { baseUrl: BASE_URL, appVersion: APP_VERSION, token: link.token };

    // 2. Bootstrap: datos del ticket
    const boot = await getBootstrap(opts);
    expect(boot.business.rnc).toMatch(/^\d{9}$/);
    expect(["weight", "price"]).toContain(boot.business.scale_format);

    // 3. Pull completo a una réplica SQLite real (mismas migraciones de la app)
    const db = await makeDb();
    const result = await pullCatalog(0, {
      fetchPage: (since, cursor) => getCatalogPage(since, cursor, opts),
      applyPage: (page) => applyCatalogPage(db, page),
      saveVersion: async () => {},
    });
    expect(result.rows).toBeGreaterThan(0);

    const products = db.all("SELECT name, price, cost, tax_category, is_weighable FROM products WHERE is_active = 1");
    const barcodes = db.all("SELECT code, product_id FROM barcodes");
    const users = db.all("SELECT id, name, role, pin_hash, is_active FROM users") as UserRow[];

    expect(products.length).toBeGreaterThanOrEqual(10); // seeder demo: ~20 productos
    expect(barcodes.length).toBeGreaterThan(0);
    // precios como string decimal en la réplica (jamás floats en lo fiscal)
    expect((products[0] as { price: unknown }).price).toMatch(/^\d+\.\d{2}$/);

    // 4. Login PIN offline contra los pin_hash REALES que bajó el delta
    const maria = await findUserByPin("1234", users);
    expect(maria?.name).toContain("María");
    const ana = await findSupervisorByPin("9999", users);
    expect(ana).not.toBeNull();
    expect(await findUserByPin("0000", users)).toBeNull();

    // 5. Heartbeat con el token nuevo
    const pong = await ping(opts);
    expect(pong.status).toBe("ok");
    expect(pong.server_time).toMatch(/[+-]\d{2}:\d{2}$/); // offset RD, ya no UTC

    // Para re-vincular la app de escritorio sin repetir el seeder:
    console.log(`E2E_TOKEN=${link.token}`);
    console.log(`E2E_HMAC=${link.hmac_secret}`);
  }, 60_000);
});
