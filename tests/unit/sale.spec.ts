import { describe, expect, it } from "vitest";

import evento from "../../docs/fixtures/evento-sale-completed.json";
import { toCents } from "@/lib/decimal";
import {
  computeTotals,
  distributeDiscount,
  lineBreakdown,
  lineTotal,
  subtotal,
  totalItems,
  type SaleLine,
} from "@/services/sale";

const toCentsSum = (vals: string[]): bigint => vals.reduce((s, v) => s + toCents(v), 0n);

const linea = (partial: Partial<SaleLine>): SaleLine => ({
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

describe("totales contra el fixture del contrato (evento-sale-completed.json)", () => {
  it("reproduce EXACTO los totals del evento canónico", () => {
    // La línea del fixture: 2.000 × 75.00 ITBIS18
    const fixtureLine = evento.payload.lines[0]!;
    const lines: SaleLine[] = [
      linea({
        quantity: fixtureLine.quantity,
        unit_price: fixtureLine.unit_price,
        tax_category: fixtureLine.tax_category as SaleLine["tax_category"],
      }),
    ];

    const totals = computeTotals(lines);
    expect(totals).toEqual(evento.payload.totals);
  });

  it("el desglose por línea coincide con la línea del evento", () => {
    const fixtureLine = evento.payload.lines[0]!;
    const breakdown = lineBreakdown(linea({ quantity: "2.000" }));
    expect(breakdown.taxable_base).toBe(fixtureLine.taxable_base);
    expect(breakdown.tax_amount).toBe(fixtureLine.tax_amount);
    expect(lineTotal(linea({ quantity: "2.000" }))).toBe(fixtureLine.total);
  });
});

describe("computeTotals (mezcla de tasas, como un carrito real)", () => {
  it("separa ITBIS18/16/0/EXENTO — categorías DISTINTAS ante la DGII", () => {
    const totals = computeTotals([
      linea({}), // 75.00 ITBIS18
      linea({ tax_category: "ITBIS16", unit_price: "116.00" }),
      linea({ tax_category: "ITBIS0", unit_price: "130.00", description: "Azúcar" }),
      linea({ tax_category: "EXENTO", unit_price: "20.00", description: "Sal" }),
    ]);

    expect(totals.taxed18_base).toBe("63.56");
    expect(totals.taxed18_itbis).toBe("11.44");
    expect(totals.taxed16_base).toBe("100.00");
    expect(totals.taxed16_itbis).toBe("16.00");
    expect(totals.taxed0_base).toBe("130.00");
    expect(totals.exempt_base).toBe("20.00");
    expect(totals.total).toBe("341.00");
  });

  it("el descuento por línea baja el total y se acumula en discount_total", () => {
    const totals = computeTotals([linea({ discount_amount: "5.00" })]);
    expect(totals.total).toBe("70.00");
    expect(totals.discount_total).toBe("5.00");
  });

  it("pesable: 0.345 × 65.00 = 22.43 (línea del wireframe)", () => {
    expect(lineTotal(linea({ quantity: "0.345", unit_price: "65.00", is_weighable: true }))).toBe("22.43");
  });

  it("venta vacía: todo en cero", () => {
    expect(computeTotals([]).total).toBe("0.00");
  });
});

describe("distributeDiscount (descuento global prorrateado, suma exacta)", () => {
  it("reparte proporcional al bruto y la suma cuadra EXACTO", () => {
    const lines = [linea({ quantity: "2.000", unit_price: "75.00" }), linea({ quantity: "1.000", unit_price: "385.00" })];
    // bruto: 150 + 385 = 535; descuento 53.50 (10%)
    const d = distributeDiscount(lines, 5350n);
    expect(d).toEqual(["15.00", "38.50"]); // 150*10% y 385*10%
    expect(toCentsSum(d)).toBe(5350n);
  });

  it("el remanente de redondeo va a la última línea (suma exacta)", () => {
    const lines = [linea({ unit_price: "10.00" }), linea({ unit_price: "10.00" }), linea({ unit_price: "10.00" })];
    // bruto 30; descuento 10.00 → 3.33 + 3.33 + 3.34
    const d = distributeDiscount(lines, 1000n);
    expect(toCentsSum(d)).toBe(1000n);
    expect(d[2]).toBe("3.34");
  });

  it("descuento mayor al bruto se capa al bruto", () => {
    const lines = [linea({ unit_price: "100.00" })];
    expect(distributeDiscount(lines, 99999n)).toEqual(["100.00"]);
  });

  it("sin líneas o descuento 0 → ceros", () => {
    expect(distributeDiscount([], 100n)).toEqual([]);
    expect(distributeDiscount([linea({})], 0n)).toEqual(["0.00"]);
  });
});

describe("subtotal y contador de items (panel del wireframe)", () => {
  it("subtotal = total − ITBIS (suma de bases)", () => {
    const totals = computeTotals([linea({ quantity: "2.000" })]); // 150.00
    expect(subtotal(totals)).toBe("127.12");
  });

  it("totalItems suma cantidades: 2 + 1 + 0.345 + 3 + 1 = 7.345 (wireframe)", () => {
    const lines = [
      linea({ quantity: "2.000" }),
      linea({ quantity: "1.000" }),
      linea({ quantity: "0.345" }),
      linea({ quantity: "3.000" }),
      linea({ quantity: "1.000" }),
    ];
    expect(totalItems(lines)).toBe("7.345");
  });

  it("cantidades enteras sin decimales de ruido", () => {
    expect(totalItems([linea({ quantity: "3.000" })])).toBe("3");
  });
});
