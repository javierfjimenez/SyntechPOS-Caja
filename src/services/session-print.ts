import { getMetaMany } from "@/db";
import { renderSessionReport, type SessionReportData } from "@/services/ticket";
import type { CountMethod, SessionActivity } from "@/services/session-report";

/**
 * Armado e impresión de los reportes de sesión (Z al cerrar, X parcial).
 * Los datos se capturan ANTES de cerrar — el store se limpia al cierre.
 */

export interface ReportInput {
  kind: "Z" | "X";
  zNumber: number | null;
  cashierName: string;
  openedAt: Date;
  openingAmount: string;
  activity: SessionActivity;
  expected: Record<CountMethod, string>;
  counted: Record<CountMethod, string> | null;
  note: string | null;
}

export async function buildSessionReportData(input: ReportInput): Promise<SessionReportData> {
  const meta = await getMetaMany(["business_trade_name", "terminal_name"]);
  return {
    kind: input.kind,
    z_number: input.zNumber,
    business_name: meta.business_trade_name ?? "",
    terminal_name: meta.terminal_name ?? "",
    cashier_name: input.cashierName,
    opened_at: input.openedAt,
    printed_at: new Date(),
    opening_amount: input.openingAmount,
    activity: input.activity,
    expected: input.expected,
    counted: input.counted,
    note: input.note,
  };
}

export async function printSessionReport(input: ReportInput): Promise<void> {
  const { printBytes } = await import("@/services/printer");
  await printBytes(renderSessionReport(await buildSessionReportData(input)));
}
