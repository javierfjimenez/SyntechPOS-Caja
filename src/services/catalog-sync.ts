import type { CatalogPage } from "@/api/sync";

/**
 * Orquestación del pull de catálogo (eventos-sync §7.1): pagina con cursor
 * hasta agotar y guarda catalog_version SOLO al cerrar el lote completo — un
 * pull interrumpido se repite entero sin corromper (delta basado en estado).
 *
 * Se guarda la versión de la PRIMERA página (foto al arrancar el pull): si
 * algo cambia en el servidor a mitad de descarga, el próximo delta lo re-trae
 * en vez de perderlo.
 */

export interface CatalogSyncDeps {
  fetchPage: (since: number, cursor: string | null) => Promise<CatalogPage>;
  applyPage: (page: CatalogPage) => Promise<void>;
  saveVersion: (version: number) => Promise<void>;
  onProgress?: (rowsPulled: number) => void;
}

export function countRows(page: CatalogPage): number {
  return (
    page.products.length +
    page.departments.length +
    page.customers.length +
    page.payment_methods.length +
    page.users.length
  );
}

export async function pullCatalog(
  since: number,
  deps: CatalogSyncDeps,
): Promise<{ version: number; rows: number }> {
  let cursor: string | null = null;
  let version: number | null = null;
  let rows = 0;

  do {
    const page = await deps.fetchPage(since, cursor);
    version ??= page.catalog_version; // la foto inicial
    await deps.applyPage(page);
    rows += countRows(page);
    deps.onProgress?.(rows);
    cursor = page.next_cursor;
  } while (cursor !== null);

  await deps.saveVersion(version ?? since);

  return { version: version ?? since, rows };
}
