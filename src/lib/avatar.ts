/**
 * Avatar generado del nombre del producto (grid sin imágenes, D24 Fase 1):
 * iniciales + color de fondo DETERMINISTA. 100% local, sin assets, sin red —
 * la caja NUNCA depende de una imagen para vender. Cuando lleguen las fotos
 * reales (Fase 2) el avatar queda solo de respaldo mientras no estén cacheadas.
 */

/** Paleta derivada de los tokens semánticos/marca de DISENO.md */
const PALETTE = [
  "#0F766E", // primary teal
  "#2563EB", // info blue
  "#16A34A", // success green
  "#D97706", // warning amber
  "#7C3AED", // violeta (acento)
  "#0891B2", // cyan
  "#DC2626", // danger red
  "#4338CA", // indigo
];

/** Hash determinista del nombre → mismo color siempre para el mismo producto */
function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) >>> 0;
  }
  return h;
}

/** Iniciales: 1ª letra de las dos primeras palabras significativas, mayúsculas */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => /[a-z0-9]/i.test(w));
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

export function colorFor(name: string): string {
  return PALETTE[hash(name) % PALETTE.length]!;
}

export interface Avatar {
  initials: string;
  color: string;
}

export function avatarFor(name: string): Avatar {
  return { initials: initials(name), color: colorFor(name) };
}
