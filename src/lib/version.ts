/**
 * Versionado del cliente (4.12, D14): comparar contra min_client_version.
 * Formato x.y.z numérico; lo desconocido compara como 0.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

/** true si la app está POR DEBAJO del mínimo exigido por el servidor */
export function updateRequired(appVersion: string, minClientVersion: string): boolean {
  return compareVersions(appVersion, minClientVersion) < 0;
}
