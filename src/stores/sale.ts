import { defineStore } from "pinia";

import { getDb } from "@/db";
import { fromMilli, toMilli } from "@/lib/decimal";
import {
  computeTotals,
  emptySale,
  subtotal,
  totalItems,
  type CurrentSale,
  type SaleCustomer,
  type SaleLine,
} from "@/services/sale";

/**
 * La venta en curso. REGLA DE ORO (CA 4.10): cada mutación se persiste a
 * current_sale AL INSTANTE — un apagón a mitad de venta no pierde ni duplica.
 * Las suspendidas (máx. 5, ui-caja §9.4) también sobreviven reinicio.
 */

export const MAX_SUSPENDED = 5;

export interface SuspendedSummary {
  id: number;
  suspended_at: string;
  cashier_user_id: number;
  lines: number;
  total: string;
}

interface SaleState {
  sale: CurrentSale;
  selectedIndex: number; // línea seleccionada (▸), -1 = ninguna
  multiplier: string | null; // "3" tras teclear 3* — aplica al PRÓXIMO escaneo
  removed: { line: SaleLine; index: number } | null; // para Deshacer (5 seg)
  restored: boolean;
  suspendedCount: number;
}

export const useSaleStore = defineStore("sale", {
  state: (): SaleState => ({
    sale: emptySale(),
    selectedIndex: -1,
    multiplier: null,
    removed: null,
    restored: false,
    suspendedCount: 0,
  }),

  getters: {
    totals: (s) => computeTotals(s.sale.lines),
    subtotalVisible(): string {
      return subtotal(this.totals);
    },
    itemCount: (s) => totalItems(s.sale.lines),
    isEmpty: (s) => s.sale.lines.length === 0,
  },

  actions: {
    /** Recupera la venta que quedó a mitad (crash/apagón) al abrir la app */
    async restore() {
      if (this.restored) return;
      this.restored = true;
      const db = await getDb();
      const rows = await db.select<{ data: string }[]>("SELECT data FROM current_sale WHERE id = 1");
      if (rows[0] !== undefined) {
        this.sale = JSON.parse(rows[0].data) as CurrentSale;
        this.selectedIndex = this.sale.lines.length - 1;
      }
      const counts = await db.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM suspended_sales");
      this.suspendedCount = counts[0]?.n ?? 0;
    },

    /** Persistencia tecla a tecla (CA 4.10) */
    async persist() {
      const db = await getDb();
      if (this.sale.lines.length === 0 && this.sale.customer === null) {
        await db.execute("DELETE FROM current_sale WHERE id = 1");
        return;
      }
      await db.execute(
        "INSERT INTO current_sale (id, data, updated_at) VALUES (1, $1, $2) ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = $2",
        [JSON.stringify(this.sale), new Date().toISOString()],
      );
    },

    /**
     * Agrega una línea. Mismo producto NO pesable → suma cantidad a la línea
     * existente (wireframe §5). El multiplicador n* se consume aquí.
     */
    async addLine(line: SaleLine) {
      let quantity = line.quantity;
      if (this.multiplier !== null && !line.is_weighable) {
        quantity = fromMilli(toMilli(line.quantity) * BigInt(this.multiplier));
        this.multiplier = null;
      }

      const existing =
        line.product_id !== null && !line.is_weighable
          ? this.sale.lines.findIndex((l) => l.product_id === line.product_id && !l.is_weighable)
          : -1;

      if (existing >= 0) {
        const current = this.sale.lines[existing]!;
        current.quantity = fromMilli(toMilli(current.quantity) + toMilli(quantity));
        this.selectedIndex = existing;
      } else {
        this.sale.lines.push({ ...line, quantity });
        this.selectedIndex = this.sale.lines.length - 1;
      }
      await this.persist();
    },

    setMultiplier(times: string) {
      this.multiplier = times;
    },

    selectPrevious() {
      if (this.sale.lines.length === 0) return;
      this.selectedIndex = Math.max(0, this.selectedIndex - 1);
    },

    selectNext() {
      if (this.sale.lines.length === 0) return;
      this.selectedIndex = Math.min(this.sale.lines.length - 1, this.selectedIndex + 1);
    },

    /** ESC: quita la línea seleccionada (con Deshacer de 5 seg — ui-caja §5) */
    async removeSelected(): Promise<SaleLine | null> {
      if (this.selectedIndex < 0 || this.selectedIndex >= this.sale.lines.length) return null;
      const [line] = this.sale.lines.splice(this.selectedIndex, 1);
      this.removed = { line: line!, index: this.selectedIndex };
      this.selectedIndex = Math.min(this.selectedIndex, this.sale.lines.length - 1);
      await this.persist();
      return line!;
    },

    async undoRemove() {
      if (this.removed === null) return;
      this.sale.lines.splice(this.removed.index, 0, this.removed.line);
      this.selectedIndex = this.removed.index;
      this.removed = null;
      await this.persist();
    },

    /** F6: editar cantidad/descuento de la línea (el PIN lo valida la pantalla) */
    async updateLine(index: number, changes: Partial<Pick<SaleLine, "quantity" | "discount_amount">>) {
      const line = this.sale.lines[index];
      if (line === undefined) return;
      Object.assign(line, changes);
      await this.persist();
    },

    /** +1 unidad a una línea (botón + del carrito). No aplica a pesables. */
    async incrementLine(index: number) {
      const line = this.sale.lines[index];
      if (line === undefined || line.is_weighable) return;
      line.quantity = fromMilli(toMilli(line.quantity) + 1000n);
      this.selectedIndex = index;
      await this.persist();
    },

    /** −1 unidad; al llegar a 0 quita la línea (botón − del carrito). */
    async decrementLine(index: number) {
      const line = this.sale.lines[index];
      if (line === undefined || line.is_weighable) return;
      const next = toMilli(line.quantity) - 1000n;
      if (next <= 0n) {
        this.sale.lines.splice(index, 1);
        this.selectedIndex = Math.min(this.selectedIndex, this.sale.lines.length - 1);
      } else {
        line.quantity = fromMilli(next);
        this.selectedIndex = index;
      }
      await this.persist();
    },

    /** −1 unidad por PRODUCTO (botón − de un tile del grid) */
    async decrementByProduct(productId: number) {
      const index = this.sale.lines.findIndex((l) => l.product_id === productId && !l.is_weighable);
      if (index >= 0) await this.decrementLine(index);
    },

    /** Cuántas unidades de ese producto hay en el carrito (badge del grid) */
    quantityForProduct(productId: number): string {
      const line = this.sale.lines.find((l) => l.product_id === productId && !l.is_weighable);
      return line?.quantity ?? "0.000";
    },

    async setCustomer(customer: SaleCustomer | null) {
      this.sale.customer = customer;
      await this.persist();
    },

    async setSupervisor(userId: number) {
      this.sale.supervisor_user_id = userId;
      await this.persist();
    },

    /** F8: suspende la venta actual (máx. 5) y limpia para la siguiente */
    async suspend(cashierUserId: number): Promise<boolean> {
      if (this.isEmpty || this.suspendedCount >= MAX_SUSPENDED) return false;
      const db = await getDb();
      await db.execute(
        "INSERT INTO suspended_sales (data, cashier_user_id, suspended_at) VALUES ($1, $2, $3)",
        [JSON.stringify(this.sale), cashierUserId, new Date().toISOString()],
      );
      this.suspendedCount += 1;
      await this.clear();
      return true;
    },

    async listSuspended(): Promise<SuspendedSummary[]> {
      const db = await getDb();
      const rows = await db.select<{ id: number; data: string; cashier_user_id: number; suspended_at: string }[]>(
        "SELECT id, data, cashier_user_id, suspended_at FROM suspended_sales ORDER BY id",
      );
      return rows.map((r) => {
        const sale = JSON.parse(r.data) as CurrentSale;
        return {
          id: r.id,
          suspended_at: r.suspended_at,
          cashier_user_id: r.cashier_user_id,
          lines: sale.lines.length,
          total: computeTotals(sale.lines).total,
        };
      });
    },

    /** F9: recupera una suspendida (la actual debe estar vacía) */
    async recover(id: number): Promise<boolean> {
      if (!this.isEmpty) return false;
      const db = await getDb();
      const rows = await db.select<{ data: string }[]>("SELECT data FROM suspended_sales WHERE id = $1", [id]);
      if (rows[0] === undefined) return false;
      await db.execute("DELETE FROM suspended_sales WHERE id = $1", [id]);
      this.suspendedCount = Math.max(0, this.suspendedCount - 1);
      this.sale = JSON.parse(rows[0].data) as CurrentSale;
      this.selectedIndex = this.sale.lines.length - 1;
      await this.persist();
      return true;
    },

    /** Cancelar venta (menú F10, confirmación explícita) o post-cobro */
    async clear() {
      this.sale = emptySale();
      this.selectedIndex = -1;
      this.multiplier = null;
      this.removed = null;
      await this.persist();
    },
  },
});
