/**
 * Formato de montos y horas (DISENO.md §4 y §7).
 * Los montos llegan como string decimal ("1234.56") — JAMÁS floats en lo fiscal;
 * aquí solo se les da forma visual, sin pasar por Number.
 */

/** "1234.56" → "RD$ 1,234.56" (miles con coma, dos decimales, para mono tabular) */
export function formatMoney(amount: string): string {
  const negative = amount.startsWith("-");
  const [intPart, decPart = ""] = (negative ? amount.slice(1) : amount).split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const decimals = decPart.padEnd(2, "0").slice(0, 2);
  return `${negative ? "-" : ""}RD$ ${grouped}.${decimals}`;
}

/** Hora 12h con a.m./p.m. (costumbre RD): 15:42 → "3:42 p.m." */
export function formatTime(date: Date): string {
  const hours = date.getHours();
  const suffix = hours < 12 ? "a.m." : "p.m.";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(date.getMinutes()).padStart(2, "0")} ${suffix}`;
}
