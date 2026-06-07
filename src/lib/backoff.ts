/**
 * Backoff exponencial con jitter (eventos-sync §2 / M6):
 * 1s → 2s → 4s → … máx 5 min. El jitter (±20%) evita que N cajas
 * reconectando a la vez martillen el servidor al mismo ritmo.
 */

export const BASE_DELAY_MS = 1_000;
export const MAX_DELAY_MS = 5 * 60_000;

/** @param random inyectable para tests (0..1) */
export function backoffDelayMs(attempts: number, random: () => number = Math.random): number {
  const exponential = BASE_DELAY_MS * 2 ** Math.max(0, attempts);
  const capped = Math.min(exponential, MAX_DELAY_MS);
  const jitter = capped * 0.2 * (random() * 2 - 1); // ±20%
  return Math.round(capped + jitter);
}
