import { describe, expect, it } from "vitest";

import type { Envelope } from "@/services/event-signing";
import {
  buildCashMovementPayload,
  buildSessionClosedPayload,
  differences,
  expectedAmounts,
  sessionActivity,
} from "@/services/session-report";

const SESSION = "01JX5HQ70BBBBBBBBBBBBBBBBB";

function saleEnvelope(payments: { method_code: string; amount: string }[], total: string, session = SESSION): Envelope {
  return {
    ulid: "01JXEVENTAAAAAAAAAAAAAAAAA",
    type: "sale.completed",
    schema_version: 1,
    occurred_at: "2026-06-07T10:00:00-04:00",
    payload: { cash_session_ulid: session, payments, totals: { total } },
    signature: "f".repeat(64),
  };
}

function movementEnvelope(type: string, amount: string, session = SESSION): Envelope {
  return {
    ulid: "01JXMOVAAAAAAAAAAAAAAAAAAA",
    type: "cash_movement.created",
    schema_version: 1,
    occurred_at: "2026-06-07T11:00:00-04:00",
    payload: { session_ulid: session, type, amount },
    signature: "f".repeat(64),
  };
}

describe("sessionActivity (la verdad local sale del outbox)", () => {
  it("suma ventas por método; el pago mixto reparte; crédito aparte", () => {
    const activity = sessionActivity(
      [
        saleEnvelope([{ method_code: "cash", amount: "150.00" }], "150.00"),
        saleEnvelope(
          [
            { method_code: "cash", amount: "1000.00" },
            { method_code: "card", amount: "200.00" },
          ],
          "1200.00",
        ),
        saleEnvelope([{ method_code: "credit", amount: "500.00" }], "500.00"),
        saleEnvelope([{ method_code: "transfer", amount: "590.00" }], "590.00"),
      ],
      SESSION,
    );

    expect(activity.sales).toEqual({ cash: "1150.00", card: "200.00", transfer: "590.00" });
    expect(activity.creditSales).toBe("500.00");
    expect(activity.salesCount).toBe(4);
    expect(activity.salesTotal).toBe("2440.00");
  });

  it("ignora eventos de OTRAS sesiones (la 2da jornada no contamina la 1ra)", () => {
    const activity = sessionActivity(
      [saleEnvelope([{ method_code: "cash", amount: "999.00" }], "999.00", "01JXOTRASESIONAAAAAAAAAAAA")],
      SESSION,
    );
    expect(activity.salesCount).toBe(0);
    expect(activity.sales.cash).toBe("0.00");
  });

  it("acumula retiros, gastos y depósitos", () => {
    const activity = sessionActivity(
      [movementEnvelope("withdrawal", "3000.00"), movementEnvelope("expense", "250.00"), movementEnvelope("deposit", "500.00")],
      SESSION,
    );
    expect(activity.withdrawals).toBe("3000.00");
    expect(activity.expenses).toBe("250.00");
    expect(activity.deposits).toBe("500.00");
  });
});

describe("expectedAmounts (la gaveta que DEBERÍA haber)", () => {
  it("efectivo = fondo + ventas − retiros − gastos + depósitos", () => {
    const expected = expectedAmounts("2000.00", {
      sales: { cash: "9800.00", card: "1236.00", transfer: "590.00" },
      creditSales: "0.00",
      withdrawals: "3000.00",
      deposits: "0.00",
      expenses: "1000.00",
      salesCount: 50,
      salesTotal: "11626.00",
    });
    expect(expected).toEqual({ cash: "7800.00", card: "1236.00", transfer: "590.00" });
  });
});

describe("differences (arqueo: declarado − esperado)", () => {
  it("sobrante positivo, faltante negativo, total agregado", () => {
    const diff = differences(
      { cash: "9850.00", card: "1236.00", transfer: "500.00" },
      { cash: "9800.00", card: "1236.00", transfer: "590.00" },
    );
    expect(diff.cash).toBe("50.00");
    expect(diff.card).toBe("0.00");
    expect(diff.transfer).toBe("-90.00");
    expect(diff.total).toBe("-40.00");
  });
});

describe("payloads del contrato", () => {
  it("cash_session.closed con la forma exacta de §4.4", () => {
    expect(
      buildSessionClosedPayload({
        sessionUlid: SESSION,
        closedBy: 7,
        zNumber: 12,
        counted: { cash: "9850.00", card: "1236.00", transfer: "590.00" },
        expectedLocal: { cash: "9800.00", card: "1236.00", transfer: "590.00" },
        note: "Sobran 50 — propina sin registrar",
      }),
    ).toEqual({
      session_ulid: SESSION,
      closed_by: 7,
      z_number: 12,
      counted_amounts: { cash: "9850.00", card: "1236.00", transfer: "590.00" },
      expected_local: { cash: "9800.00", card: "1236.00", transfer: "590.00" },
      note: "Sobran 50 — propina sin registrar",
    });
  });

  it("cash_movement.created con la forma exacta de §4.5", () => {
    expect(
      buildCashMovementPayload({
        movementUlid: "01JXMOVAAAAAAAAAAAAAAAAAAA",
        sessionUlid: SESSION,
        type: "withdrawal",
        amount: "3000.00",
        reason: "Depósito al banco",
        userId: 7,
      }),
    ).toEqual({
      movement_ulid: "01JXMOVAAAAAAAAAAAAAAAAAAA",
      session_ulid: SESSION,
      type: "withdrawal",
      amount: "3000.00",
      reason: "Depósito al banco",
      user_id: 7,
    });
  });
});
