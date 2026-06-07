/**
 * Anti fuerza bruta compartido (ui-caja.md §2 y §3): tras N intentos fallidos
 * seguidos, espera de 1 minuto. Lógica pura para testearla sin reloj real.
 *
 * Nota de contrato: ui-caja.md §3 habla de bloquear AL USUARIO tras 5 fallos,
 * pero el login por PIN no identifica usuario hasta acertar — el bloqueo
 * atribuible solo puede hacerlo el servidor. Localmente aplicamos espera por
 * terminal (pregunta abierta registrada en ESTADO.md).
 */

export const MAX_FAILURES = 5;
export const COOLDOWN_MS = 60_000;

export interface LockoutState {
  failures: number;
  lockedUntil: number | null; // epoch ms
}

export const initialLockout: LockoutState = { failures: 0, lockedUntil: null };

export function registerFailure(state: LockoutState, now: number): LockoutState {
  const failures = state.failures + 1;
  if (failures >= MAX_FAILURES) {
    return { failures: 0, lockedUntil: now + COOLDOWN_MS };
  }
  return { failures, lockedUntil: null };
}

export function registerSuccess(): LockoutState {
  return initialLockout;
}

export function isLocked(state: LockoutState, now: number): boolean {
  return state.lockedUntil !== null && now < state.lockedUntil;
}

/** Segundos restantes de espera (0 si no hay bloqueo) — para el mensaje en pantalla */
export function remainingSeconds(state: LockoutState, now: number): number {
  if (!isLocked(state, now)) return 0;
  return Math.ceil(((state.lockedUntil as number) - now) / 1000);
}
