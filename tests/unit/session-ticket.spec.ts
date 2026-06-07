import { describe, expect, it } from "vitest";

import { renderSessionReport, type SessionReportData } from "@/services/ticket";

const BASE: SessionReportData = {
  kind: "Z",
  z_number: 12,
  business_name: "Súper Demo",
  terminal_name: "Caja 1",
  cashier_name: "María P.",
  opened_at: new Date(2026, 5, 7, 8, 1, 0),
  printed_at: new Date(2026, 5, 7, 21, 2, 0),
  opening_amount: "2000.00",
  activity: {
    sales: { cash: "9800.00", card: "1236.00", transfer: "590.00" },
    creditSales: "500.00",
    withdrawals: "3000.00",
    deposits: "0.00",
    expenses: "1000.00",
    salesCount: 134,
    salesTotal: "12126.00",
  },
  expected: { cash: "7800.00", card: "1236.00", transfer: "590.00" },
  counted: { cash: "7850.00", card: "1236.00", transfer: "590.00" },
  note: "Sobran 50",
};

const texto = (b: Uint8Array) => String.fromCharCode(...b);

describe("renderSessionReport", () => {
  it("el Z trae número, ventas por método, retiros, esperado vs declarado y DIFERENCIA", () => {
    const out = texto(renderSessionReport(BASE));
    expect(out).toContain("REPORTE Z #12");
    expect(out).toContain("134 ventas");
    expect(out).toContain("RD$ 12,126.00");
    expect(out).toContain("Retiros");
    expect(out).toContain("Efectivo esperado");
    expect(out).toContain("Efectivo declarado");
    expect(out).toContain("DIFERENCIA");
    expect(out).toContain("RD$ 50.00"); // 7850 − 7800
    expect(out).toContain("Nota: Sobran 50");
    expect(out).toContain("Cr"); // crédito informativo (no gaveta)
  });

  it("el X es parcial: sin número Z, sin declarado, solo esperado", () => {
    const out = texto(renderSessionReport({ ...BASE, kind: "X", z_number: null, counted: null, note: null }));
    expect(out).toContain("REPORTE X (parcial)");
    expect(out).not.toContain("declarado");
    expect(out).not.toContain("DIFERENCIA");
    expect(out).toContain("Efectivo");
  });
});
