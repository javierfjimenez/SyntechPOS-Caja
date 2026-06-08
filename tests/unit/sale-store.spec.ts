import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SaleLine } from "@/services/sale";

/**
 * Crash-recovery de la venta en curso (cobertura INNEGOCIABLE, CLAUDE.md):
 * cada mutación persiste a current_sale; "reabrir la app" (otro store sobre
 * la misma base fake) recupera la venta intacta.
 */

// ── Fake de la base: implementa los pocos SQL que usa el store ────────────────
const fakeDb = {
  currentSale: null as string | null,
  suspended: [] as { id: number; data: string; cashier_user_id: number; suspended_at: string }[],
  nextId: 1,

  async select(sql: string, params: unknown[] = []): Promise<unknown[]> {
    if (sql.includes("FROM current_sale")) {
      return this.currentSale === null ? [] : [{ data: this.currentSale }];
    }
    if (sql.includes("COUNT(*) AS n FROM suspended_sales")) {
      return [{ n: this.suspended.length }];
    }
    if (sql.includes("FROM suspended_sales WHERE id")) {
      return this.suspended.filter((s) => s.id === params[0]);
    }
    if (sql.includes("FROM suspended_sales")) {
      return this.suspended;
    }
    throw new Error(`select no soportado: ${sql}`);
  },

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    if (sql.startsWith("DELETE FROM current_sale")) {
      this.currentSale = null;
    } else if (sql.startsWith("INSERT INTO current_sale")) {
      this.currentSale = params[0] as string;
    } else if (sql.startsWith("INSERT INTO suspended_sales")) {
      this.suspended.push({
        id: this.nextId++,
        data: params[0] as string,
        cashier_user_id: params[1] as number,
        suspended_at: params[2] as string,
      });
    } else if (sql.startsWith("DELETE FROM suspended_sales")) {
      this.suspended = this.suspended.filter((s) => s.id !== params[0]);
    } else {
      throw new Error(`execute no soportado: ${sql}`);
    }
  },

  reset() {
    this.currentSale = null;
    this.suspended = [];
    this.nextId = 1;
  },
};

vi.mock("@/db", () => ({ getDb: async () => fakeDb }));

const { useSaleStore, MAX_SUSPENDED } = await import("@/stores/sale");

const linea = (partial: Partial<SaleLine> = {}): SaleLine => ({
  product_id: 88,
  department_id: 3,
  description: "Arroz Selecto 5lb",
  quantity: "1.000",
  unit_price: "75.00",
  discount_amount: "0.00",
  tax_category: "ITBIS18",
  unit_cost: "61.5000",
  is_weighable: false,
  ...partial,
});

beforeEach(() => {
  setActivePinia(createPinia());
  fakeDb.reset();
});

describe("crash-recovery (CA 4.10): la venta sobrevive el apagón", () => {
  it("cada línea persiste al instante y se recupera intacta", async () => {
    const store = useSaleStore();
    await store.addLine(linea());
    await store.addLine(linea({ product_id: 2, description: "Aceite", unit_price: "385.00" }));

    // "Apagón": un store NUEVO sobre la misma base
    setActivePinia(createPinia());
    const reopened = useSaleStore();
    await reopened.restore();

    expect(reopened.sale.lines).toHaveLength(2);
    expect(reopened.totals.total).toBe("460.00");
    expect(reopened.selectedIndex).toBe(1);
  });

  it("venta vacía no deja rastro en current_sale", async () => {
    const store = useSaleStore();
    await store.addLine(linea());
    await store.removeSelected();
    expect(fakeDb.currentSale).toBeNull();
  });
});

describe("líneas (wireframe §5)", () => {
  it("mismo producto NO pesable suma cantidad en la misma línea", async () => {
    const store = useSaleStore();
    await store.addLine(linea());
    await store.addLine(linea());
    expect(store.sale.lines).toHaveLength(1);
    expect(store.sale.lines[0]!.quantity).toBe("2.000");
  });

  it("pesables SIEMPRE crean línea nueva (pesadas distintas)", async () => {
    const store = useSaleStore();
    await store.addLine(linea({ product_id: 9, quantity: "0.345", is_weighable: true }));
    await store.addLine(linea({ product_id: 9, quantity: "0.500", is_weighable: true }));
    expect(store.sale.lines).toHaveLength(2);
  });

  it("incrementLine/decrementLine ajustan la cantidad; − en 1 quita la línea", async () => {
    const store = useSaleStore();
    await store.addLine(linea()); // 1.000
    await store.incrementLine(0);
    expect(store.sale.lines[0]!.quantity).toBe("2.000");
    await store.decrementLine(0);
    expect(store.sale.lines[0]!.quantity).toBe("1.000");
    await store.decrementLine(0); // 1 → 0 → quita
    expect(store.sale.lines).toHaveLength(0);
  });

  it("+/- no aplican a pesables (su cantidad es el peso)", async () => {
    const store = useSaleStore();
    await store.addLine(linea({ product_id: 9, quantity: "0.345", is_weighable: true }));
    await store.incrementLine(0);
    expect(store.sale.lines[0]!.quantity).toBe("0.345");
  });

  it("quantityForProduct refleja el carrito; decrementByProduct baja por product_id", async () => {
    const store = useSaleStore();
    await store.addLine(linea()); // product_id 88
    await store.addLine(linea());
    expect(store.quantityForProduct(88)).toBe("2.000");
    expect(store.quantityForProduct(99)).toBe("0.000");
    await store.decrementByProduct(88);
    expect(store.quantityForProduct(88)).toBe("1.000");
  });

  it("multiplicador 3*: la próxima línea entra con cantidad 3 y se consume", async () => {
    const store = useSaleStore();
    store.setMultiplier("3");
    await store.addLine(linea());
    expect(store.sale.lines[0]!.quantity).toBe("3.000");
    expect(store.multiplier).toBeNull();
    await store.addLine(linea({ product_id: 2 }));
    expect(store.sale.lines[1]!.quantity).toBe("1.000");
  });

  it("ESC quita la seleccionada y Deshacer la devuelve EN SU LUGAR", async () => {
    const store = useSaleStore();
    await store.addLine(linea());
    await store.addLine(linea({ product_id: 2, description: "Aceite" }));
    store.selectedIndex = 0;

    const removed = await store.removeSelected();
    expect(removed?.description).toBe("Arroz Selecto 5lb");
    expect(store.sale.lines).toHaveLength(1);

    await store.undoRemove();
    expect(store.sale.lines[0]!.description).toBe("Arroz Selecto 5lb");
  });
});

describe("suspender/recuperar (máx. 5, sobreviven reinicio — ui-caja §9.4)", () => {
  it("suspende, limpia y recupera con el total correcto", async () => {
    const store = useSaleStore();
    await store.addLine(linea({ quantity: "2.000" }));
    expect(await store.suspend(7)).toBe(true);
    expect(store.isEmpty).toBe(true);

    const list = await store.listSuspended();
    expect(list).toHaveLength(1);
    expect(list[0]!.total).toBe("150.00");

    expect(await store.recover(list[0]!.id)).toBe(true);
    expect(store.totals.total).toBe("150.00");
    expect(store.suspendedCount).toBe(0);
  });

  it("la sexta suspendida se rechaza", async () => {
    const store = useSaleStore();
    for (let i = 0; i < MAX_SUSPENDED; i++) {
      await store.addLine(linea({ product_id: i + 1 }));
      expect(await store.suspend(7)).toBe(true);
    }
    await store.addLine(linea({ product_id: 99 }));
    expect(await store.suspend(7)).toBe(false);
  });

  it("no se recupera encima de una venta con líneas", async () => {
    const store = useSaleStore();
    await store.addLine(linea());
    await store.suspend(7);
    await store.addLine(linea({ product_id: 2 }));
    expect(await store.recover(1)).toBe(false);
  });
});
