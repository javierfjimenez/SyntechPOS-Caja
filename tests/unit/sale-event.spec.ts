import { describe, expect, it } from "vitest";

import evento from "../../docs/fixtures/evento-sale-completed.json";
import { cashPayment } from "@/services/payment";
import {
  buildSaleCompletedPayload,
  buildSaleVoidedPayload,
  buildSessionOpenedPayload,
} from "@/services/sale-event";
import type { CurrentSale } from "@/services/sale";

/**
 * El payload construido debe ser EXACTO al fixture del contrato: misma venta
 * (Arroz 2.000 × 75.00, efectivo 200 sobre 150) → mismo JSON, campo a campo.
 */

const saleDelFixture: CurrentSale = {
  lines: [
    {
      product_id: 88,
      department_id: 3,
      description: "Arroz Selecto 5lb",
      quantity: "2.000",
      unit_price: "75.00",
      discount_amount: "0.00",
      tax_category: "ITBIS18",
      unit_cost: "61.5000",
      is_weighable: false,
    },
  ],
  customer: null,
  supervisor_user_id: null,
};

describe("buildSaleCompletedPayload contra el fixture del contrato", () => {
  it("reproduce el payload completo del evento canónico", () => {
    const payload = buildSaleCompletedPayload({
      sale: saleDelFixture,
      payments: [cashPayment("150.00", "200.00")],
      saleUlid: evento.payload.sale_ulid,
      ticketNumber: evento.payload.ticket_number,
      cashSessionUlid: evento.payload.cash_session_ulid,
      cashierUserId: evento.payload.cashier_user_id,
    });

    expect(payload).toEqual(evento.payload);
  });

  it("cliente inline viaja solo cuando NO tiene id (creado al vuelo)", () => {
    const conInline = buildSaleCompletedPayload({
      sale: {
        ...saleDelFixture,
        customer: { id: null, name: "Juan Pérez", document_type: "cedula", document_number: "00112345678", phone: null },
      },
      payments: [cashPayment("150.00", "150.00")],
      saleUlid: "01JX5K3KZ0AAAAAAAAAAAAAAAA",
      ticketNumber: 1,
      cashSessionUlid: "01JX5HQ70BBBBBBBBBBBBBBBBB",
      cashierUserId: 7,
    });
    expect(conInline.customer).toEqual({
      name: "Juan Pérez",
      document_type: "cedula",
      document_number: "00112345678",
      phone: null,
    });
    expect(conInline.customer_id).toBeNull();

    const conRegistrado = buildSaleCompletedPayload({
      sale: {
        ...saleDelFixture,
        customer: { id: 12, name: "Colmado", document_type: "rnc", document_number: "131888777", phone: null },
      },
      payments: [cashPayment("150.00", "150.00")],
      saleUlid: "01JX5K3KZ0AAAAAAAAAAAAAAAA",
      ticketNumber: 1,
      cashSessionUlid: "01JX5HQ70BBBBBBBBBBBBBBBBB",
      cashierUserId: 7,
    });
    expect(conRegistrado.customer_id).toBe(12);
    expect(conRegistrado.customer).toBeNull(); // ya sincronizado: no viaja inline
  });

  it("pago a crédito marca is_credit", () => {
    const payload = buildSaleCompletedPayload({
      sale: saleDelFixture,
      payments: [{ method_code: "credit", amount: "150.00", amount_tendered: null, reference: null }],
      saleUlid: "01JX5K3KZ0AAAAAAAAAAAAAAAA",
      ticketNumber: 1,
      cashSessionUlid: "01JX5HQ70BBBBBBBBBBBBBBBBB",
      cashierUserId: 7,
    });
    expect(payload.is_credit).toBe(true);
  });
});

describe("buildSaleVoidedPayload (anulación §4.2)", () => {
  it("forma exacta del contrato: sale_ulid + reason + supervisor_user_id", () => {
    expect(
      buildSaleVoidedPayload({
        saleUlid: "01JX5K3KZ0AAAAAAAAAAAAAAAA",
        reason: "Cobro equivocado",
        supervisorUserId: 2,
      }),
    ).toEqual({
      sale_ulid: "01JX5K3KZ0AAAAAAAAAAAAAAAA",
      reason: "Cobro equivocado",
      supervisor_user_id: 2,
    });
  });
});

describe("buildSessionOpenedPayload", () => {
  it("forma exacta del contrato §4.3", () => {
    expect(
      buildSessionOpenedPayload({ sessionUlid: "01JX5HQ70BBBBBBBBBBBBBBBBB", openedBy: 7, openingAmount: "2000.00" }),
    ).toEqual({
      session_ulid: "01JX5HQ70BBBBBBBBBBBBBBBBB",
      opened_by: 7,
      opening_amount: "2000.00",
    });
  });
});
