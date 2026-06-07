import { isScaleCode } from "@/services/scale-barcode";

/**
 * Clasifica lo que la cajera tecleó/escaneó en el input único (ui-caja §5):
 * un solo lugar donde caen todos los dígitos — cero cambio de contexto.
 */

export type ScanAction =
  | { kind: "empty" } // Enter con input vacío → COBRAR
  | { kind: "multiplier"; times: string } // "3*" → las próximas unidades = 3
  | { kind: "scale"; code: string } // EAN-13 de balanza (prefijo 2X)
  | { kind: "code"; code: string } // código de barras normal
  | { kind: "search"; term: string }; // 2+ letras → búsqueda local

export function classifyScanInput(raw: string): ScanAction {
  const text = raw.trim();
  if (text === "") return { kind: "empty" };

  const mult = /^([1-9]\d{0,2})\*$/.exec(text);
  if (mult !== null) return { kind: "multiplier", times: mult[1]! };

  if (isScaleCode(text)) return { kind: "scale", code: text };

  if (/^\d+$/.test(text)) return { kind: "code", code: text };

  return { kind: "search", term: text };
}

/** ¿El texto amerita búsqueda instantánea mientras teclea? (2+ con letras) */
export function isSearchable(raw: string): boolean {
  const text = raw.trim();
  return text.length >= 2 && /[a-záéíóúñü]/i.test(text);
}
