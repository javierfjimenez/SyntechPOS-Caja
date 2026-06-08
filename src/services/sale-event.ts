import { buildEnvelope, type Envelope } from "@/services/event-signing";
import type { PaymentDraft } from "@/services/payment";
import {
  computeTotals,
  lineBreakdown,
  lineTotal,
  TAX_RATES,
  type CurrentSale,
} from "@/services/sale";
import { isCreditSale } from "@/services/payment";

/**
 * Construcción de payloads EXACTOS al contrato (eventos-sync §4). Los tests
 * los validan contra docs/fixtures/evento-sale-completed.json.
 */

export interface SaleEventInput {
  sale: CurrentSale;
  payments: PaymentDraft[];
  saleUlid: string;
  ticketNumber: number;
  cashSessionUlid: string;
  cashierUserId: number;
}

export function buildSaleCompletedPayload(input: SaleEventInput): Record<string, unknown> {
  const { sale, payments } = input;

  return {
    sale_ulid: input.saleUlid,
    ticket_number: input.ticketNumber,
    cash_session_ulid: input.cashSessionUlid,
    cashier_user_id: input.cashierUserId,
    type: "sale",
    ref_sale_ulid: null,
    is_credit: isCreditSale(payments),
    customer_id: sale.customer?.id ?? null,
    customer:
      sale.customer !== null && sale.customer.id === null
        ? {
            name: sale.customer.name,
            document_type: sale.customer.document_type,
            document_number: sale.customer.document_number,
            phone: sale.customer.phone,
          }
        : null,
    lines: sale.lines.map((line) => {
      const breakdown = lineBreakdown(line);
      return {
        product_id: line.product_id,
        department_id: line.department_id,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        discount_amount: line.discount_amount,
        tax_category: line.tax_category,
        tax_rate: TAX_RATES[line.tax_category],
        taxable_base: breakdown.taxable_base,
        tax_amount: breakdown.tax_amount,
        total: lineTotal(line),
        unit_cost: line.unit_cost,
      };
    }),
    payments: payments.map((p) => ({
      method_code: p.method_code,
      amount: p.amount,
      amount_tendered: p.amount_tendered,
      reference: p.reference,
    })),
    totals: { ...computeTotals(sale.lines) },
    supervisor_user_id: sale.supervisor_user_id,
  };
}

export function buildSessionOpenedPayload(input: {
  sessionUlid: string;
  openedBy: number;
  openingAmount: string;
}): Record<string, unknown> {
  return {
    session_ulid: input.sessionUlid,
    opened_by: input.openedBy,
    opening_amount: input.openingAmount,
  };
}

/** sale.voided (eventos-sync §4.2): anulación dentro de la sesión abierta */
export function buildSaleVoidedPayload(input: {
  saleUlid: string;
  reason: string;
  supervisorUserId: number;
}): Record<string, unknown> {
  return {
    sale_ulid: input.saleUlid,
    reason: input.reason,
    supervisor_user_id: input.supervisorUserId,
  };
}

export async function signSaleEvent(
  secret: string,
  eventUlid: string,
  type: "sale.completed" | "cash_session.opened",
  occurredAt: string,
  payload: Record<string, unknown>,
): Promise<Envelope> {
  return buildEnvelope(secret, { ulid: eventUlid, type, occurred_at: occurredAt, payload });
}
