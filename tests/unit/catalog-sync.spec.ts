import { describe, expect, it, vi } from "vitest";

import type { CatalogPage } from "@/api/sync";
import { countRows, pullCatalog } from "@/services/catalog-sync";

/** Página del delta con la forma exacta de docs/endpoints.md §4 */
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

const product = (id: number): CatalogPage["products"][number] => ({
  id,
  name: `Producto ${id}`,
  sku: null,
  price: "75.00",
  cost: "61.5000",
  tax_category: "ITBIS18",
  is_weighable: false,
  department_id: 3,
  brand_id: null,
  image_url: null,
  is_active: true,
  row_version: 10,
  barcodes: [],
});

describe("pullCatalog (paginación y catalog_version — eventos-sync §7.1)", () => {
  it("pagina con cursor hasta agotar y aplica TODAS las páginas", async () => {
    const pages: Record<string, CatalogPage> = {
      inicio: page({ catalog_version: 100, products: [product(1)], next_cursor: "c1" }),
      c1: page({ catalog_version: 100, products: [product(2)], next_cursor: "c2" }),
      c2: page({ catalog_version: 100, products: [product(3)], next_cursor: null }),
    };
    const fetchPage = vi.fn(async (_since: number, cursor: string | null) => pages[cursor ?? "inicio"]!);
    const applyPage = vi.fn(async () => {});
    const saveVersion = vi.fn(async () => {});

    const result = await pullCatalog(0, { fetchPage, applyPage, saveVersion });

    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 0, "c1");
    expect(applyPage).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ version: 100, rows: 3 });
  });

  it("guarda catalog_version SOLO al cerrar el lote completo", async () => {
    const order: string[] = [];
    await pullCatalog(0, {
      fetchPage: async (_s, cursor) =>
        cursor === null
          ? page({ catalog_version: 50, next_cursor: "c1" })
          : page({ catalog_version: 50 }),
      applyPage: async () => {
        order.push("apply");
      },
      saveVersion: async () => {
        order.push("save");
      },
    });
    expect(order).toEqual(["apply", "apply", "save"]);
  });

  it("un pull interrumpido NO guarda versión (se repite entero sin corromper)", async () => {
    const saveVersion = vi.fn(async () => {});
    await expect(
      pullCatalog(0, {
        fetchPage: async (_s, cursor) =>
          cursor === null ? page({ catalog_version: 50, next_cursor: "c1" }) : Promise.reject(new Error("sin red")),
        applyPage: async () => {},
        saveVersion,
      }),
    ).rejects.toThrow("sin red");
    expect(saveVersion).not.toHaveBeenCalled();
  });

  it("guarda la versión de la PRIMERA página (lo que cambie a mitad de pull se re-trae)", async () => {
    const saveVersion = vi.fn(async () => {});
    await pullCatalog(0, {
      fetchPage: async (_s, cursor) =>
        cursor === null
          ? page({ catalog_version: 100, next_cursor: "c1" })
          : page({ catalog_version: 107 }), // el servidor avanzó durante el pull
      applyPage: async () => {},
      saveVersion,
    });
    expect(saveVersion).toHaveBeenCalledWith(100);
  });

  it("reporta progreso acumulado por página", async () => {
    const progreso: number[] = [];
    await pullCatalog(0, {
      fetchPage: async (_s, cursor) =>
        cursor === null
          ? page({ products: [product(1), product(2)], next_cursor: "c1" })
          : page({ users: [{ id: 7, name: "María", role: "cashier", pin_hash: null, is_active: true, row_version: 1 }] }),
      applyPage: async () => {},
      saveVersion: async () => {},
      onProgress: (rows) => progreso.push(rows),
    });
    expect(progreso).toEqual([2, 3]);
  });
});

describe("countRows", () => {
  it("suma todas las tablas de la página", () => {
    expect(
      countRows(
        page({
          products: [product(1)],
          departments: [{ id: 1, name: "Abarrotes", tax_category: "ITBIS18", is_active: true, row_version: 1 }],
          users: [{ id: 7, name: "María", role: "cashier", pin_hash: null, is_active: true, row_version: 1 }],
        }),
      ),
    ).toBe(3);
  });
});
