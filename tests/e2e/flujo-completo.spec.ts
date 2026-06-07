import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { postEvents } from "@/api/events";
import { ping } from "@/api/terminals";
import { linkTerminal } from "@/api/terminals";
import { getBootstrap, getCatalogPage } from "@/api/sync";
import { applyCatalogPage, type DbExecutor } from "@/db/replica";
import { toIsoWithOffset } from "@/lib/datetime";
import { ulid } from "@/lib/ulid";
import { findSupervisorByPin, findUserByPin, type UserRow } from "@/services/auth";
import { pullCatalog } from "@/services/catalog-sync";
import { buildEnvelope } from "@/services/event-signing";
import { cashPayment } from "@/services/payment";
import { buildSaleCompletedPayload, buildSessionOpenedPayload } from "@/services/sale-event";

/**
 * E2E contra el servidor REAL (Herd: https://server.test) con el CÓDIGO DE
 * PRODUCCIÓN de la caja: vinculación → bootstrap → pull paginado → réplica
 * SQLite (node:sqlite con las MISMAS migraciones) → login PIN → heartbeat.
 *
 * Correr con:  E2E=1 NODE_TLS_REJECT_UNAUTHORIZED=0 npm test
 * Usa el terminal DEDICADO "Caja 2 (e2e)" (código 654321) para no tocar la
 * caja vinculada de desarrollo. El código es de un solo uso: restaurarlo con
 *   php artisan tinker → Terminal 'Caja 2 (e2e)' → link_code 654321, unlinked
 * Requiere Node con node:sqlite (--experimental-sqlite en Node 22).
 */

const RUN = process.env.E2E === "1";
const BASE_URL = process.env.E2E_API_URL ?? "https://server.test/api/v1";
const APP_VERSION = "0.1.0";
const LINK_CODE = process.env.E2E_LINK_CODE ?? "654321";

/** Adaptador DbExecutor → node:sqlite (convierte $N posicionales a ?) */
async function makeDb(): Promise<DbExecutor & { all: (sql: string) => unknown[] }> {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  // TODAS las migraciones de la app, en orden — la réplica e2e jamás se desfasa
  const dir = join(dirname(fileURLToPath(import.meta.url)), "../../src-tauri/migrations");
  for (const file of readdirSync(dir).sort()) {
    db.exec(readFileSync(join(dir, file), "utf8"));
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
    expect(link.terminal.name).toBe("Caja 2 (e2e)");

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

    // 6. EVENTOS REALES (4.7): el servidor verifica NUESTRA firma HMAC
    const cashier = (await findUserByPin("1234", users))!;
    const sessionUlid = ulid();
    const sessionEnvelope = await buildEnvelope(link.hmac_secret, {
      ulid: ulid(),
      type: "cash_session.opened",
      occurred_at: toIsoWithOffset(new Date()),
      payload: buildSessionOpenedPayload({ sessionUlid, openedBy: cashier.id, openingAmount: "2000.00" }),
    });

    const arroz = products.find((p) => (p as { name: string }).name.includes("Arroz")) as {
      name: string;
      price: string;
      cost: string | null;
      tax_category: "ITBIS18";
    };
    const salePayload = buildSaleCompletedPayload({
      sale: {
        lines: [
          {
            product_id: 1,
            department_id: 1,
            description: arroz.name,
            quantity: "2.000",
            unit_price: arroz.price,
            discount_amount: "0.00",
            tax_category: arroz.tax_category,
            unit_cost: arroz.cost ?? "0.0000",
            is_weighable: false,
          },
        ],
        customer: null,
        supervisor_user_id: null,
      },
      payments: [cashPayment("150.00", "200.00")],
      saleUlid: ulid(),
      ticketNumber: 1,
      cashSessionUlid: sessionUlid,
      cashierUserId: cashier.id,
    });
    const saleEnvelope = await buildEnvelope(link.hmac_secret, {
      ulid: ulid(),
      type: "sale.completed",
      occurred_at: toIsoWithOffset(new Date()),
      payload: salePayload,
    });

    // Lote en orden de outbox: sesión ANTES que venta (FIFO por ULID)
    const first = await postEvents([sessionEnvelope, saleEnvelope], opts);
    expect(first.results.map((r) => r.status)).toEqual(["processed", "processed"]);

    // 7. CA de 4.7: REENVIAR NO DUPLICA (idempotencia server-side por ULID)
    const resent = await postEvents([sessionEnvelope, saleEnvelope], opts);
    expect(resent.results.map((r) => r.status)).toEqual(["duplicate", "duplicate"]);

    // Para re-vincular la app de escritorio sin repetir el seeder:
    console.log(`E2E_TOKEN=${link.token}`);
    console.log(`E2E_HMAC=${link.hmac_secret}`);
  }, 60_000);
});
