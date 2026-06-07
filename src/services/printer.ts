import { invoke } from "@tauri-apps/api/core";

import { getMetaMany, setMeta } from "@/db";
import { EscPosBuilder } from "@/services/escpos";
import { renderTestPage, renderTicket, type TicketData } from "@/services/ticket";

/**
 * Servicio de impresión: los bytes (testeados) viajan por el comando Rust
 * print_raw. REGLA DE ORO: si la impresora falla, la venta NO se pierde —
 * el ticket queda disponible para reimprimir (ui-caja §6).
 */

export interface PrinterConfig {
  transport: "usb" | "network";
  host: string | null;
}

export async function getPrinterConfig(): Promise<PrinterConfig> {
  const meta = await getMetaMany(["printer_transport", "printer_host"]);
  return {
    transport: meta.printer_transport === "network" ? "network" : "usb",
    host: meta.printer_host ?? null,
  };
}

export async function savePrinterConfig(config: PrinterConfig): Promise<void> {
  await setMeta("printer_transport", config.transport);
  await setMeta("printer_host", config.host ?? "");
}

async function printBytes(bytes: Uint8Array): Promise<void> {
  const config = await getPrinterConfig();
  await invoke("print_raw", {
    bytes: Array.from(bytes),
    transport: config.transport,
    host: config.host || null,
  });
}

/** El último ticket renderizado: para "Reimprimir" tras un fallo o a demanda */
let lastTicket: TicketData | null = null;

export function getLastTicket(): TicketData | null {
  return lastTicket;
}

/** Imprime el ticket; abre la gaveta ANTES si hubo efectivo (un solo viaje) */
export async function printSaleTicket(data: TicketData, openDrawer: boolean): Promise<void> {
  lastTicket = data;
  const drawer = openDrawer ? new EscPosBuilder().drawerPulse().build() : new Uint8Array(0);
  const ticket = renderTicket(data);
  const combined = new Uint8Array(drawer.length + ticket.length);
  combined.set(drawer, 0);
  combined.set(ticket, drawer.length);
  await printBytes(combined);
}

export async function reprintLastTicket(): Promise<void> {
  if (lastTicket === null) throw new Error("No hay ticket para reimprimir.");
  await printBytes(renderTicket(lastTicket));
}

export async function printTest(): Promise<void> {
  const meta = await getMetaMany(["business_trade_name", "terminal_name"]);
  await printBytes(renderTestPage(meta.business_trade_name ?? "—", meta.terminal_name ?? "—"));
}

/** Datos del negocio para el encabezado del ticket (bootstrap en catalog_meta) */
export async function ticketBusinessData(): Promise<TicketData["business"] & { branch_name: string; terminal_name: string }> {
  const meta = await getMetaMany([
    "business_trade_name",
    "business_legal_name",
    "business_rnc",
    "business_address",
    "business_phone",
    "receipt_footer",
    "branch_name",
    "terminal_name",
  ]);
  return {
    trade_name: meta.business_trade_name ?? "",
    legal_name: meta.business_legal_name ?? "",
    rnc: meta.business_rnc ?? "",
    address: meta.business_address ?? "",
    phone: meta.business_phone ?? "",
    receipt_footer: meta.receipt_footer ?? "",
    branch_name: meta.branch_name ?? "",
    terminal_name: meta.terminal_name ?? "",
  };
}

/** ¿Esta venta ya tiene e-CF resuelto? (reimpresión timbrada, D9) */
export async function ecfForSale(saleUlid: string): Promise<TicketData["ecf"]> {
  const { getDb } = await import("@/db");
  const db = await getDb();
  const rows = await db.select<{ encf: string; security_code: string; dgii_url: string }[]>(
    "SELECT encf, security_code, dgii_url FROM ecf_results WHERE sale_ulid = $1",
    [saleUlid],
  );
  return rows[0] ?? null;
}
