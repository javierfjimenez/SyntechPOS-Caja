import { describe, expect, it } from "vitest";

import {
  availableCredit,
  canConfirm,
  cashPayment,
  changeDue,
  exceedsCredit,
  isCreditSale,
  remaining,
  type PaymentDraft,
} from "@/services/payment";

describe("cobro en efectivo (el caso del 90%)", () => {
  it("pago justo: EXACTO → cambio 0.00, confirmable", () => {
    const p = [cashPayment("1200.00", "1200.00")];
    expect(remaining("1200.00", p)).toBe("0.00");
    expect(changeDue(p)).toBe("0.00");
    expect(canConfirm("1200.00", p)).toBe(true);
  });

  it("pagan con 1,500 sobre 1,200 → CAMBIO 300.00 (wireframe §6)", () => {
    const p = [cashPayment("1200.00", "1500.00")];
    expect(changeDue(p)).toBe("300.00");
    expect(canConfirm("1200.00", p)).toBe(true);
  });

  it("entregado menor al total = pago parcial → falta el resto", () => {
    const p = [cashPayment("1200.00", "1000.00")];
    expect(p[0]!.amount).toBe("1000.00");
    expect(remaining("1200.00", p)).toBe("200.00");
    expect(canConfirm("1200.00", p)).toBe(false);
  });
});

describe("pago mixto (efectivo + tarjeta)", () => {
  it("falta llega a 0 y habilita confirmar; el cambio solo sale del efectivo", () => {
    const p: PaymentDraft[] = [
      cashPayment("1200.00", "1000.00"),
      { method_code: "card", amount: "200.00", amount_tendered: null, reference: "1234" },
    ];
    expect(remaining("1200.00", p)).toBe("0.00");
    expect(changeDue(p)).toBe("0.00");
    expect(canConfirm("1200.00", p)).toBe(true);
    expect(isCreditSale(p)).toBe(false);
  });

  it("sin pagos no se confirma", () => {
    expect(canConfirm("100.00", [])).toBe(false);
  });
});

describe("crédito (M9b)", () => {
  it("disponible = límite − balance", () => {
    expect(availableCredit("5000.00", "1200.00")).toBe("3800.00");
    expect(availableCredit("5000.00", "5500.00")).toBe("-500.00");
  });

  it("excede cuando el monto supera el disponible (negativo = todo excede)", () => {
    expect(exceedsCredit("800.00", "3800.00")).toBe(false);
    expect(exceedsCredit("4000.00", "3800.00")).toBe(true);
    expect(exceedsCredit("0.01", "-500.00")).toBe(true);
  });

  it("una venta con crédito se marca is_credit", () => {
    expect(isCreditSale([{ method_code: "credit", amount: "100.00", amount_tendered: null, reference: null }])).toBe(true);
  });
});
