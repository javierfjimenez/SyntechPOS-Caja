/**
 * Calculadora de caja: reducer puro, aritmética exacta en BigInt (escala
 * interna 6 decimales, half-up — jamás floats, igual que lib/decimal.ts).
 * Semántica de calculadora física: operando, operador, operando, =.
 */

export type Op = "+" | "-" | "*" | "/";

const SCALE = 6n;
const FACTOR = 10n ** SCALE;

export interface CalcState {
  display: string; // lo que se ve (string decimal o "Error")
  accumulator: bigint | null; // valor acumulado en escala interna
  pendingOp: Op | null;
  justEvaluated: boolean; // true tras "=" o un operador: el próximo dígito reinicia
  error: boolean;
}

export const initialCalc: CalcState = {
  display: "0",
  accumulator: null,
  pendingOp: null,
  justEvaluated: false,
  error: false,
};

// ── helpers de escala ─────────────────────────────────────────────────────────

function toScaled(value: string): bigint {
  const [intPart, decPart = ""] = value.split(".");
  const dec = (decPart + "000000").slice(0, 6);
  const sign = intPart!.startsWith("-") ? -1n : 1n;
  const intAbs = intPart!.replace("-", "") || "0";
  return sign * (BigInt(intAbs) * FACTOR + BigInt(dec || "0"));
}

/** escala interna → string sin ceros decimales de relleno */
function fromScaled(scaled: bigint): string {
  const neg = scaled < 0n;
  const abs = neg ? -scaled : scaled;
  const intPart = abs / FACTOR;
  let dec = (abs % FACTOR).toString().padStart(6, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${intPart}${dec ? "." + dec : ""}`;
}

function divHalfUp(numerator: bigint, denominator: bigint): bigint {
  const neg = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (n + d / 2n) / d;
  return neg ? -q : q;
}

function apply(op: Op, a: bigint, b: bigint): bigint | null {
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "*":
      return divHalfUp(a * b, FACTOR);
    case "/":
      return b === 0n ? null : divHalfUp(a * FACTOR, b);
  }
}

// ── reducer ───────────────────────────────────────────────────────────────────

export function pressDigit(state: CalcState, digit: string): CalcState {
  if (state.error) return state;
  if (state.justEvaluated || state.display === "0") {
    return { ...state, display: digit, justEvaluated: false };
  }
  if (state.display.replace("-", "").replace(".", "").length >= 12) return state; // tope
  return { ...state, display: state.display + digit };
}

export function pressDot(state: CalcState): CalcState {
  if (state.error) return state;
  if (state.justEvaluated) {
    return { ...state, display: "0.", justEvaluated: false };
  }
  if (state.display.includes(".")) return state;
  return { ...state, display: state.display + "." };
}

export function pressOp(state: CalcState, op: Op): CalcState {
  if (state.error) return state;
  const current = toScaled(state.display);

  // operadores encadenados sin "=": evalúa lo pendiente primero
  if (state.pendingOp !== null && state.accumulator !== null && !state.justEvaluated) {
    const result = apply(state.pendingOp, state.accumulator, current);
    if (result === null) return { ...state, display: "Error", error: true };
    return { ...state, display: fromScaled(result), accumulator: result, pendingOp: op, justEvaluated: true };
  }

  return { ...state, accumulator: current, pendingOp: op, justEvaluated: true };
}

export function pressEquals(state: CalcState): CalcState {
  if (state.error || state.pendingOp === null || state.accumulator === null) return state;
  const current = toScaled(state.display);
  const result = apply(state.pendingOp, state.accumulator, current);
  if (result === null) return { ...state, display: "Error", error: true };
  return {
    ...state,
    display: fromScaled(result),
    accumulator: null,
    pendingOp: null,
    justEvaluated: true,
  };
}

/** % sobre el operando actual: porcentaje del acumulador (5% de 200 = 10) */
export function pressPercent(state: CalcState): CalcState {
  if (state.error) return state;
  const current = toScaled(state.display);
  if (state.accumulator !== null && (state.pendingOp === "+" || state.pendingOp === "-" || state.pendingOp === "*" || state.pendingOp === "/")) {
    const pct = divHalfUp(state.accumulator * current, 100n * FACTOR);
    return { ...state, display: fromScaled(pct), justEvaluated: false };
  }
  const pct = divHalfUp(current, 100n);
  return { ...state, display: fromScaled(pct), justEvaluated: false };
}

export function pressBackspace(state: CalcState): CalcState {
  if (state.error || state.justEvaluated) return state;
  const trimmed = state.display.slice(0, -1);
  return { ...state, display: trimmed === "" || trimmed === "-" ? "0" : trimmed };
}

export function clear(): CalcState {
  return initialCalc;
}
