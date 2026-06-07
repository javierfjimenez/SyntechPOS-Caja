import { describe, expect, it } from "vitest";

import {
  COOLDOWN_MS,
  MAX_FAILURES,
  initialLockout,
  isLocked,
  registerFailure,
  registerSuccess,
  remainingSeconds,
} from "@/lib/lockout";

const T0 = 1_750_000_000_000; // reloj inyectado: los tests no dependen de Date.now

describe("lockout (5 intentos → espera 1 min — ui-caja.md §2/§3)", () => {
  it("acumula fallos sin bloquear antes del límite", () => {
    let state = initialLockout;
    for (let i = 0; i < MAX_FAILURES - 1; i++) {
      state = registerFailure(state, T0);
      expect(isLocked(state, T0)).toBe(false);
    }
    expect(state.failures).toBe(MAX_FAILURES - 1);
  });

  it("al quinto fallo bloquea exactamente 60 segundos", () => {
    let state = initialLockout;
    for (let i = 0; i < MAX_FAILURES; i++) {
      state = registerFailure(state, T0);
    }
    expect(isLocked(state, T0)).toBe(true);
    expect(remainingSeconds(state, T0)).toBe(60);
    expect(isLocked(state, T0 + COOLDOWN_MS - 1)).toBe(true);
    expect(isLocked(state, T0 + COOLDOWN_MS)).toBe(false);
  });

  it("el contador de fallos se reinicia tras el bloqueo (no re-bloquea al primer fallo siguiente)", () => {
    let state = initialLockout;
    for (let i = 0; i < MAX_FAILURES; i++) {
      state = registerFailure(state, T0);
    }
    const after = registerFailure(state, T0 + COOLDOWN_MS + 1);
    expect(isLocked(after, T0 + COOLDOWN_MS + 1)).toBe(false);
    expect(after.failures).toBe(1);
  });

  it("el éxito limpia todo", () => {
    let state = registerFailure(initialLockout, T0);
    state = registerSuccess();
    expect(state).toEqual(initialLockout);
  });

  it("sin bloqueo, remainingSeconds es 0", () => {
    expect(remainingSeconds(initialLockout, T0)).toBe(0);
  });
});
