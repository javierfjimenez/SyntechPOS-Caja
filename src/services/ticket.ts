import { formatMoney, formatTime } from "@/lib/format";
import { COLS, EscPosBuilder } from "@/services/escpos";
import { METHOD_LABELS, type PaymentDraft } from "@/services/payment";
import { lineTotal, subtotal, type SaleLine, type SaleTotals } from "@/services/sale";

/**
 * El ticket 80mm (tarea 4.5): desglose ITBIS por tasa, datos del negocio,
 * QR del e-CF — o la LEYENDA DE CONTINGENCIA si aún no hay comprobante
 * (D9: la reimpresión timbrada llega por /sync/ecf-results).
 */

export interface TicketData {
  business: {
    trade_name: string;
    legal_name: string;
    rnc: string;
    address: string;
    phone: string;
    receipt_footer: string;
  };
  branch_name: string;
  terminal_name: string;
  ticket_number: number;
  occurred_at: Date;
  cashier_name: string;
  customer_name: string | null;
  customer_document: string | null;
  lines: SaleLine[];
  totals: SaleTotals;
  payments: PaymentDraft[];
  change: string;
  /** null = contingencia (sin comprobante aún) */
  ecf: { encf: string; security_code: string; dgii_url: string } | null;
}

const money = (s: string) => formatMoney(s);

function fecha(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${formatTime(d)}`;
}

export function renderTicket(data: TicketData): Uint8Array {
  const t = new EscPosBuilder().init();

  // ── Encabezado: datos del negocio ───────────────────────────────────────────
  t.align(1).bold(true).size(2, 2).line(data.business.trade_name).size(1, 1).bold(false);
  t.line(data.business.legal_name);
  t.line(`RNC: ${data.business.rnc}`);
  if (data.business.address) t.line(data.business.address);
  if (data.business.phone) t.line(`Tel: ${data.business.phone}`);
  t.line(`${data.branch_name} · ${data.terminal_name}`);
  t.feed(1);

  // ── Identidad del ticket ────────────────────────────────────────────────────
  t.align(0);
  t.row(`Ticket #${data.ticket_number}`, fecha(data.occurred_at));
  t.row(`Cajero: ${data.cashier_name}`, "");
  if (data.customer_name !== null) {
    t.line(`Cliente: ${data.customer_name}`);
    if (data.customer_document !== null) t.line(`Doc: ${data.customer_document}`);
  }
  t.separator();

  // ── Líneas ──────────────────────────────────────────────────────────────────
  for (const line of data.lines) {
    const qty = line.quantity.endsWith(".000") ? line.quantity.slice(0, -4) : line.quantity;
    t.line(line.description.slice(0, COLS));
    t.row(`  ${qty} x ${money(line.unit_price)}`, money(lineTotal(line)));
    if (line.discount_amount !== "0.00") {
      t.row("  Descuento", `-${money(line.discount_amount)}`);
    }
  }
  t.separator();

  // ── Totales: desglose fiscal por tasa (607/ITBIS) ───────────────────────────
  t.row("Subtotal", money(subtotal(data.totals)));
  if (data.totals.taxed18_itbis !== "0.00") t.row("ITBIS 18%", money(data.totals.taxed18_itbis));
  if (data.totals.taxed16_itbis !== "0.00") t.row("ITBIS 16%", money(data.totals.taxed16_itbis));
  if (data.totals.taxed0_base !== "0.00") t.row("Gravado 0%", money(data.totals.taxed0_base));
  if (data.totals.exempt_base !== "0.00") t.row("Exento", money(data.totals.exempt_base));
  if (data.totals.discount_total !== "0.00") t.row("Descuento", `-${money(data.totals.discount_total)}`);
  t.bold(true).size(1, 2).row("TOTAL", money(data.totals.total), COLS).size(1, 1).bold(false);

  // ── Pagos y cambio ──────────────────────────────────────────────────────────
  for (const p of data.payments) {
    t.row(
      METHOD_LABELS[p.method_code] + (p.reference ? ` ref.${p.reference}` : ""),
      money(p.amount_tendered ?? p.amount),
    );
  }
  if (data.change !== "0.00") {
    t.bold(true).row("CAMBIO", money(data.change)).bold(false);
  }
  t.separator();

  // ── e-CF: QR timbrado o leyenda de contingencia ─────────────────────────────
  t.align(1);
  if (data.ecf !== null) {
    t.line(`e-NCF: ${data.ecf.encf}`);
    t.line(`Código de seguridad: ${data.ecf.security_code}`);
    t.qr(data.ecf.dgii_url);
    t.line("Comprobante Fiscal Electrónico");
  } else {
    t.bold(true).line("COMPROBANTE EN CONTINGENCIA").bold(false);
    t.line("El e-CF se emitirá al restablecerse");
    t.line("la conexión. Conserve este ticket;");
    t.line("puede reimprimirlo timbrado en caja.");
  }

  if (data.business.receipt_footer) {
    t.feed(1).line(data.business.receipt_footer);
  }
  t.line("¡Gracias por su compra!");

  t.feed(3).cut();
  return t.build();
}

/** Página de prueba (vinculación §2 y configuración de impresora) */
export function renderTestPage(businessName: string, terminalName: string): Uint8Array {
  return new EscPosBuilder()
    .init()
    .align(1)
    .bold(true)
    .size(2, 2)
    .line("SyntechPOS")
    .size(1, 1)
    .bold(false)
    .line("Página de prueba")
    .feed(1)
    .align(0)
    .line(`Negocio: ${businessName}`)
    .line(`Caja: ${terminalName}`)
    .line("Caracteres: áéíóú ñÑ üÜ RD$ 1,234.56")
    .separator()
    .align(1)
    .qr("https://syntechpos.test/prueba")
    .line("Si ve el QR y los acentos, todo OK")
    .feed(3)
    .cut()
    .build();
}
