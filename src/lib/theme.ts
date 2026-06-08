/**
 * Tema white-label por negocio (D26). El bootstrap trae `settings.theme` con
 * hex listos; la caja re-tematiza SOLO los tokens de marca (`--color-primary`,
 * `--color-primary-hi`) en runtime — los semánticos (verde/rojo/ámbar/azul)
 * NUNCA cambian. Los tokens ya son variables CSS (DISENO §3), así que sobre-
 * escribirlas en :root re-tematiza al instante y offline.
 */

export interface Theme {
  primary: string;
  primaryHi: string;
}

/** Tema por defecto = teal (idéntico a los tokens de main.css) */
export const DEFAULT_THEME: Theme = { primary: "#0F766E", primaryHi: "#14B8A6" };

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Sobre el theme del bootstrap (puede faltar/ser inválido) → un Theme válido */
export function resolveTheme(raw?: { primary?: string | null; primary_hi?: string | null } | null): Theme {
  const primary = raw?.primary && HEX.test(raw.primary) ? raw.primary : DEFAULT_THEME.primary;
  const primaryHi = raw?.primary_hi && HEX.test(raw.primary_hi) ? raw.primary_hi : DEFAULT_THEME.primaryHi;
  return { primary, primaryHi };
}

/** Aplica el tema a los tokens CSS (no-op fuera del navegador, p. ej. tests) */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--color-primary", theme.primary);
  root.style.setProperty("--color-primary-hi", theme.primaryHi);
}
