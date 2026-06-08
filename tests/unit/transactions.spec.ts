import { describe, expect, it } from "vitest";

import type { Envelope } from "@/services/event-signing";
import { recentTransactions } from "@/services/transactions";

const SESSION = "01JXSESIONAAAAAAAAAAAAAAAA";

function env(ulid: string, ticket: number, total: string, type: "sale" | "credit_note", session = SESSION): Envelope {
  return {
    ulid,
    type: "sale.completed",
    schema_version: 1,
    occurred_at: `2026-06-08T${String(ticket).padStart(2, "0")}:00:00-04:00`,
    payload: {
      sale_ulid: `01JXSALE${String(ticket).padStart(18, "0")}`,
      ticket_number: ticket,
      cash_session_ulid: session,
      type,
      totals: { total },
    },
    signature: "f".repeat(64),
  };
}

describe("recentTransactions (las ventas/NC del turno actual)", () => {
  it("reciente primero (invierte el orden ULID del outbox)", () => {
    const list = recentTransactions(
      [env("01A", 1, "150.00", "sale"), env("01B", 2, "385.00", "sale"), env("01C", 3, "75.00", "credit_note")],
      SESSION,
    );
    expect(list.map((t) => t.ticket_number)).toEqual([3, 2, 1]);
  });

  it("etiqueta venta vs nota de crédito", () => {
    const list = recentTransactions([env("01A", 1, "150.00", "sale"), env("01B", 2, "75.00", "credit_note")], SESSION);
    expect(list.find((t) => t.ticket_number === 1)!.kind).toBe("sale");
    expect(list.find((t) => t.ticket_number === 2)!.kind).toBe("credit_note");
  });

  it("ignora transacciones de OTRA sesión (no mezcla turnos)", () => {
    const list = recentTransactions(
      [env("01A", 1, "150.00", "sale"), env("01B", 9, "999.00", "sale", "01JXOTRASESIONBBBBBBBBBBBB")],
      SESSION,
    );
    expect(list).toHaveLength(1);
    expect(list[0]!.ticket_number).toBe(1);
  });

  it("trae el total y el sale_ulid para reimprimir", () => {
    const list = recentTransactions([env("01A", 42, "1200.00", "sale")], SESSION);
    expect(list[0]!.total).toBe("1200.00");
    expect(list[0]!.sale_ulid).toBe("01JXSALE000000000000000042");
  });

  it("sin transacciones del turno: lista vacía", () => {
    expect(recentTransactions([], SESSION)).toEqual([]);
  });
});
