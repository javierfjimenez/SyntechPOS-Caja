/**
 * occurred_at del contrato (eventos-sync §3): ISO-8601 CON offset local
 * (RD = -04:00, sin DST), segundos sin fracción.
 * Patrón exacto: ^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$
 */
export function toIsoWithOffset(date: Date): string {
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");

  const offsetMinutes = -date.getTimezoneOffset(); // JS lo da invertido
  const sign = offsetMinutes < 0 ? "-" : "+";
  const offset = `${sign}${pad(Math.trunc(offsetMinutes / 60))}:${pad(offsetMinutes % 60)}`;

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${offset}`
  );
}
