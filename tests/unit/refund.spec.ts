import { describe, expect, it } from "vitest";

import type { Envelope } from "@/services/event-signing";
import { buildCreditNotePayload, findSaleByTicket, returnableQuantities } from "@/services/refund";

const SALE_ULID = "01JXVENTAORIGINALAAAAAAAAA";

function saleEnvelope(ticket: number, saleUlid = SALE_ULID): Envelope {
  return {
    ulid: `01JXEV${String(ticket).padStart(20, "0")}`,
    type: "sale.completed",
    schema_version: 1,
    occurred_at: "2026-06-07T10:00:00-04:00",
    payload: {
      sale_ulid: saleUlid,
      ticket_number: ticket,
      cash_session_ulid: "01JXSESIONAAAAAAAAAAAAAAAA",
      cashier_user_id: 7,
      type: "sale",
      customer_id: null,
      lines: [
        { product_id: 88, department_id: 3, description: "Arroz Selecto 5lb", quantity: "2.000", unit_price: "75.00", discount_amount: "0.00", tax_category: "ITBIS18", tax_rate: "18.00", taxable_base: "127.12", tax_amount: "22.88", total: "150.00", unit_cost: "61.5000" },
        { product_id: 2, department_id: 3, description: "Aceite Crisol 64oz", quantity: "1.000", unit_price: "385.00", discount_amount: "0.00", tax_category: "ITBIS18", tax_rate: "18.00", taxable_base: "326.27", tax_amount: "58.73", total: "385.00", unit_cost: "300.0000" },
      ],
      payments: [{ method_code: "cash", amount: "535.00", amount_tendered: "600.00", reference: null }],
      totals: { total: "535.00" },
    },
    signature: "f".repeat(64),
  };
}

function creditNoteEnvelope(refUlid: string, quantity: string): Envelope {
  return {
    ulid: "01JXNCAAAAAAAAAAAAAAAAAAAA",
    type: "sale.completed",
    schema_version: 1,
    occurred_at: "2026-06-07T12:00:00-04:00",
    payload: {
      type: "credit_note",
      ref_sale_ulid: refUlid,
      lines: [
        { product_id: 88, department_id: 3, description: "Arroz Selecto 5lb", quantity, unit_price: "75.00", discount_amount: "0.00", tax_category: "ITBIS18", unit_cost: "61.5000" },
      ],
    },
    signature: "f".repeat(64),
  };
}

describe("findSaleByTicket (búsqueda local en el outbox)", () => {
  it("encuentra la venta por número de ticket (la más reciente)", () => {
    const sale = findSaleByTicket([saleEnvelope(1042)], 1042);
    expect(sale?.sale_ulid).toBe(SALE_ULID);
    expect(sale?.lines).toHaveLength(2);
    expect(sale?.total).toBe("535.00");
  });

  it("las NC no aparecen como ventas devolvibles", () => {
    expect(findSaleByTicket([creditNoteEnvelope(SALE_ULID, "1.000")], 1042)).toBeNull();
  });
});

describe("returnableQuantities (lo vendido menos lo ya devuelto)", () => {
  const original = findSaleByTicket([saleEnvelope(1042)], 1042)!;

  it("sin NCs previas: todo es devolvible", () => {
    expect(returnableQuantities([saleEnvelope(1042)], original)).toEqual(["2.000", "1.000"]);
  });

  it("una NC previa descuenta lo devuelto (no se devuelve dos veces)", () => {
    const envelopes = [saleEnvelope(1042), creditNoteEnvelope(SALE_ULID, "1.000")];
    expect(returnableQuantities(envelopes, original)).toEqual(["1.000", "1.000"]);
  });

  it("todo devuelto: queda en cero", () => {
    const envelopes = [saleEnvelope(1042), creditNoteEnvelope(SALE_ULID, "2.000")];
    expect(returnableQuantities(envelopes, original)).toEqual(["0.000", "1.000"]);
  });
});

describe("buildCreditNotePayload (NC tipo 34, §4.1 reglas semánticas)", () => {
  const original = findSaleByTicket([saleEnvelope(1042)], 1042)!;

  it("type credit_note + ref + supervisor + cantidades POSITIVAS + reembolso efectivo", () => {
    const payload = buildCreditNotePayload({
      original,
      selections: [{ lineIndex: 0, quantity: "1.000" }],
      returnable: ["2.000", "1.000"],
      saleUlid: "01JXNCNUEVAAAAAAAAAAAAAAAB",
      ticketNumber: 1043,
      cashSessionUlid: "01JXSESIONAAAAAAAAAAAAAAAA",
      cashierUserId: 7,
      supervisorUserId: 2,
    });

    expect(payload.type).toBe("credit_note");
    expect(payload.ref_sale_ulid).toBe(SALE_ULID);
    expect(payload.supervisor_user_id).toBe(2);
    const lines = payload.lines as { quantity: string; total: string }[];
    expect(lines).toHaveLength(1);
    expect(lines[0]!.quantity).toBe("1.000"); // positiva
    expect(lines[0]!.total).toBe("75.00");
    expect((payload.totals as { total: string }).total).toBe("75.00");
    expect((payload.payments as { method_code: string; amount: string }[])[0]).toEqual({
      method_code: "cash",
      amount: "75.00",
      amount_tendered: null,
      reference: null,
    });
  });

  it("rechaza devolver más de lo devolvible", () => {
    expect(() =>
      buildCreditNotePayload({
        original,
        selections: [{ lineIndex: 0, quantity: "3.000" }],
        returnable: ["2.000", "1.000"],
        saleUlid: "01JXNCNUEVAAAAAAAAAAAAAAAB",
        ticketNumber: 1043,
        cashSessionUlid: "01JXSESIONAAAAAAAAAAAAAAAA",
        cashierUserId: 7,
        supervisorUserId: 2,
      }),
    ).toThrow(/No puedes devolver más/);
  });

  it("rechaza selección vacía y cantidad cero", () => {
    const base = {
      original,
      returnable: ["2.000", "1.000"],
      saleUlid: "01JXNCNUEVAAAAAAAAAAAAAAAB",
      ticketNumber: 1043,
      cashSessionUlid: "01JXSESIONAAAAAAAAAAAAAAAA",
      cashierUserId: 7,
      supervisorUserId: 2,
    };
    expect(() => buildCreditNotePayload({ ...base, selections: [] })).toThrow(/al menos una línea/);
    expect(() => buildCreditNotePayload({ ...base, selections: [{ lineIndex: 0, quantity: "0.000" }] })).toThrow(/mayor que cero/);
  });
});
