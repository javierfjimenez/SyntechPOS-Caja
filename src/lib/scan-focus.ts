/**
 * Coordinación del foco del input de escaneo (política §1). El InputEscaneo es
 * el dueño del foco, pero otros campos de texto (la búsqueda del grid) pueden
 * tomarlo temporalmente. Este singleton deja que cualquier componente DEVUELVA
 * el foco al escáner sin acoplarse a su ref.
 */

let focusFn: (() => void) | null = null;

export function registerScanFocus(fn: (() => void) | null): void {
  focusFn = fn;
}

/** Devuelve el foco al input de escaneo (tras un tick, para ganarle a ModalBase) */
export function focusScan(): void {
  focusFn?.();
}

/** ¿El foco está en OTRO campo editable (no el escáner)? → no robárselo */
export function editableFocused(scanInput: HTMLElement | null): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (active === null || active === scanInput) return false;
  return active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable;
}
