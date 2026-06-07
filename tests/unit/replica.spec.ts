import { describe, expect, it } from "vitest";

import type { CatalogPage, ProductDelta } from "@/api/sync";
import {
  applyCatalogPage,
  mapCustomer,
  mapProduct,
  mapUser,
  type DbExecutor,
} from "@/db/replica";

/**
 * La escritura de réplicas se prueba con un DbExecutor grabador: registra
 * cada sentencia y sus parámetros (el SQLite real corre dentro de Tauri).
 */
class RecordingDb implements DbExecutor {
  calls: { sql: string; params: unknown[] }[] = [];

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    this.calls.push({ sql, params });
  }
}

const PRODUCT: ProductDelta = {
  id: 88,
  name: "Arroz Selecto 5lb",
  sku: "ARZ-5",
  price: "75.00",
  cost: "61.5000",
  tax_category: "ITBIS18",
  is_weighable: false,
  department_id: 3,
  is_active: true,
  row_version: 1431,
  barcodes: [{ barcode: "7461234567890" }, { barcode: "7460000000001" }],
};

function page(partial: Partial<CatalogPage>): CatalogPage {
  return {
    catalog_version: 0,
    products: [],
    departments: [],
    customers: [],
    payment_methods: [],
    users: [],
    next_cursor: null,
    ...partial,
  };
}

describe("mapeos delta → fila SQLite (montos como string, booleanos a 0/1)", () => {
  it("producto: price/cost quedan como string (jamás floats en lo fiscal)", () => {
    const row = mapProduct(PRODUCT);
    expect(row).toEqual([88, "Arroz Selecto 5lb", "ARZ-5", "75.00", "61.5000", "ITBIS18", 0, 3, 1, 1431]);
    expect(typeof row[3]).toBe("string");
    expect(typeof row[4]).toBe("string");
  });

  it("la BAJA viaja como is_active=0 (se upsertea, no se borra)", () => {
    expect(mapProduct({ ...PRODUCT, is_active: false })[8]).toBe(0);
  });

  it("usuario: pin_hash viaja tal cual para el login offline", () => {
    expect(
      mapUser({ id: 7, name: "María P.", role: "cashier", pin_hash: "$2y$12$x", is_active: true, row_version: 9 }),
    ).toEqual([7, "María P.", "cashier", "$2y$12$x", 1, 9]);
  });

  it("cliente: límite y balance de crédito como string decimal", () => {
    expect(
      mapCustomer({
        id: 12,
        name: "Colmado Juan",
        document_type: "rnc",
        document_number: "131234567",
        phone: null,
        credit_limit: "5000.00",
        credit_balance: "1200.00",
        is_active: true,
        row_version: 1435,
      }),
    ).toEqual([12, "Colmado Juan", "rnc", "131234567", null, "5000.00", "1200.00", 1, 1435]);
  });
});

describe("applyCatalogPage (upserts y reemplazo de códigos de barras)", () => {
  it("upsertea el producto y REEMPLAZA su set de barcodes (delete + insert)", async () => {
    const db = new RecordingDb();
    await applyCatalogPage(db, page({ products: [PRODUCT] }));

    const sqls = db.calls.map((c) => c.sql);
    expect(sqls[0]).toContain("INSERT INTO products");
    expect(sqls[0]).toContain("ON CONFLICT (id) DO UPDATE SET");
    expect(sqls[1]).toContain("DELETE FROM barcodes WHERE product_id IN");
    expect(sqls[2]).toContain("INSERT INTO barcodes");
    expect(db.calls[2]!.params).toEqual(["7461234567890", 88, "7460000000001", 88]);
  });

  it("página vacía no toca la base", async () => {
    const db = new RecordingDb();
    await applyCatalogPage(db, page({}));
    expect(db.calls).toEqual([]);
  });

  it("chunking: 200 productos de 10 columnas caben en 3 sentencias (límite 999 params)", async () => {
    const db = new RecordingDb();
    const products = Array.from({ length: 200 }, (_, i) => ({ ...PRODUCT, id: i + 1, barcodes: [] }));
    await applyCatalogPage(db, page({ products }));

    const inserts = db.calls.filter((c) => c.sql.startsWith("INSERT INTO products"));
    expect(inserts).toHaveLength(3); // ⌈200 / 90⌉
    for (const call of inserts) {
      expect(call.params.length).toBeLessThanOrEqual(900);
    }
    expect(inserts.reduce((n, c) => n + c.params.length, 0)).toBe(200 * 10);
  });
});
