import { defineStore } from "pinia";

import { getCatalogPage } from "@/api/sync";
import { getDb, getMeta, setMeta } from "@/db";
import { applyCatalogPage } from "@/db/replica";
import { pullCatalog } from "@/services/catalog-sync";
import { useTerminalStore } from "@/stores/terminal";

/**
 * Estado del delta-sync de catálogo. Disparadores (eventos-sync §7.1):
 * al abrir la app + cada 5 min + manual (pantalla de Estado, 4.x).
 * Si no hay internet, el pull falla EN SILENCIO: la caja nunca se bloquea.
 */

const VERSION_KEY = "catalog_version";
const SYNCED_AT_KEY = "catalog_synced_at";
const PULL_INTERVAL_MS = 5 * 60_000;

interface SyncState {
  syncing: boolean;
  catalogVersion: number;
  /** true si ALGÚN lote completo cerró alguna vez — un negocio recién creado
   * puede tener catálogo vacío con versión 0 y aún así estar sincronizado */
  hasSynced: boolean;
  lastSyncAt: number | null;
  rowsPulled: number;
  started: boolean;
}

export const useSyncStore = defineStore("sync", {
  state: (): SyncState => ({
    syncing: false,
    catalogVersion: 0,
    hasSynced: false,
    lastSyncAt: null,
    rowsPulled: 0,
    started: false,
  }),

  actions: {
    async load() {
      const stored = await getMeta(VERSION_KEY);
      this.catalogVersion = stored === null ? 0 : Number(stored);
      this.hasSynced = (await getMeta(SYNCED_AT_KEY)) !== null;
    },

    /**
     * Un pull completo (full=true fuerza since=0: vinculación / re-sync).
     * @returns true si el lote cerró completo; false si falló (sin red, etc.)
     */
    async syncNow(full = false, onProgress?: (rows: number) => void): Promise<boolean> {
      if (this.syncing) return false;
      const terminal = useTerminalStore();
      if (!terminal.token) return false;

      this.syncing = true;
      try {
        const db = await getDb();
        const result = await pullCatalog(full ? 0 : this.catalogVersion, {
          fetchPage: (since, cursor) =>
            getCatalogPage(since, cursor, {
              baseUrl: terminal.apiUrl,
              appVersion: terminal.appVersion,
              token: terminal.token ?? undefined,
            }),
          applyPage: (page) => applyCatalogPage(db, page),
          saveVersion: async (version) => {
            await setMeta(VERSION_KEY, String(version));
            await setMeta(SYNCED_AT_KEY, new Date().toISOString());
            this.catalogVersion = version;
            this.hasSynced = true;
          },
          onProgress: (rows) => {
            this.rowsPulled = rows;
            onProgress?.(rows);
          },
        });
        this.lastSyncAt = Date.now();
        this.rowsPulled = result.rows;
        return true;
      } catch {
        return false; // sin red o error del servidor: se reintenta en el próximo tick
      } finally {
        this.syncing = false;
      }
    },

    /** Arranca el ciclo: pull inmediato + cada 5 min. Idempotente. */
    start() {
      if (this.started) return;
      this.started = true;
      void this.syncNow();
      setInterval(() => void this.syncNow(), PULL_INTERVAL_MS);
    },
  },
});
