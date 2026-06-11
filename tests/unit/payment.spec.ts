import { describe, expect, it } from "vitest";

import {
  availableCredit,
  canConfirm,
  cashPayment,
  changeDue,
  exceedsCredit,
  isCreditSale,
  recomputePayment,
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

/**
 * recomputePayment replica lo que hace el modal de cobro al EDITAR el monto de
 * una línea. Reproduce el bug que tenía: teclear "recibido" no debe inflar el
 * monto aplicado ni anular la vuelta.
 */
describe("recomputePayment (editar monto en el modal)", () => {
  it("EFECTIVO recibido sobre el total → aplica el total, el resto es vuelta", () => {
    // venta 1500, sin otros pagos → needBefore = 1500. La cajera teclea 2000.
    const p = recomputePayment("cash", "2000.00", "1500.00");
    expect(p.amount).toBe("1500.00"); // aplicado se topa en lo que falta
    expect(p.amount_tendered).toBe("2000.00"); // recibido se conserva
    expect(changeDue([p])).toBe("500.00"); // vuelta correcta
    expect(remaining("1500.00", [p])).toBe("0.00"); // y queda saldado
    expect(canConfirm("1500.00", [p])).toBe(true);
  });

  it("EFECTIVO justo → sin vuelta, exacto", () => {
    const p = recomputePayment("cash", "1500.00", "1500.00");
    expect(p.amount).toBe("1500.00");
    expect(changeDue([p])).toBe("0.00");
  });

  it("EFECTIVO parcial (menor a lo que falta) → aplica lo recibido, sin vuelta", () => {
    const p = recomputePayment("cash", "1000.00", "1500.00");
    expect(p.amount).toBe("1000.00");
    expect(p.amount_tendered).toBe("1000.00");
    expect(changeDue([p])).toBe("0.00");
    expect(remaining("1500.00", [p])).toBe("500.00");
  });

  it("TARJETA/transfer no genera vuelta y se topa en lo que falta", () => {
    const card = recomputePayment("card", "2000.00", "1500.00");
    expect(card.amount).toBe("1500.00"); // no se cobra de más a la tarjeta
    expect(card.amount_tendered).toBeNull();
    expect(changeDue([card])).toBe("0.00");
  });

  it("MIXTO: tarjeta 1000 + efectivo recibido 1000 sobre 1500 → vuelta 500", () => {
    // tarjeta aplica 1000; al editar el efectivo, needBefore = 1500 − 1000 = 500
    const card: PaymentDraft = { method_code: "card", amount: "1000.00", amount_tendered: null, reference: null };
    const cash = recomputePayment("cash", "1000.00", "500.00");
    expect(cash.amount).toBe("500.00"); // solo aplica lo que faltaba
    expect(cash.amount_tendered).toBe("1000.00");
    const p = [card, cash];
    expect(remaining("1500.00", p)).toBe("0.00");
    expect(changeDue(p)).toBe("500.00");
    expect(canConfirm("1500.00", p)).toBe(true);
  });

  it("needBefore 0 (venta ya saldada) → aplica 0, recibido es todo vuelta", () => {
    const p = recomputePayment("cash", "500.00", "0.00");
    expect(p.amount).toBe("0.00");
    expect(changeDue([p])).toBe("500.00");
  });
});
