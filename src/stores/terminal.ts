import { getVersion } from "@tauri-apps/api/app";
import { defineStore } from "pinia";

import { DEFAULT_API_URL } from "@/api/client";
import { linkTerminal, ping } from "@/api/terminals";
import { getMetaMany, setMeta } from "@/db";

/**
 * Estado del terminal: vinculación (token + hmac_secret en catalog_meta) y
 * conexión (heartbeat /ping). La caja FUNCIONA igual sin internet — `online`
 * solo alimenta el ● de la barra de estado.
 */

interface TerminalState {
  loaded: boolean;
  linked: boolean;
  token: string | null;
  terminalName: string | null;
  branchName: string | null;
  businessName: string | null;
  online: boolean;
  appVersion: string;
  apiUrl: string;
}

const META_KEYS = ["api_token", "hmac_secret", "terminal_id", "terminal_name", "branch_name", "business_name"];

export const useTerminalStore = defineStore("terminal", {
  state: (): TerminalState => ({
    loaded: false,
    linked: false,
    token: null,
    terminalName: null,
    branchName: null,
    businessName: null,
    online: false,
    appVersion: "0.0.0",
    apiUrl: DEFAULT_API_URL,
  }),

  actions: {
    /** Carga credenciales desde catalog_meta al arrancar (guard del router) */
    async load() {
      if (this.loaded) return;
      this.appVersion = await getVersion();
      const meta = await getMetaMany(META_KEYS);
      this.token = meta.api_token ?? null;
      this.terminalName = meta.terminal_name ?? null;
      this.branchName = meta.branch_name ?? null;
      this.businessName = meta.business_name ?? null;
      this.linked = this.token !== null;
      this.loaded = true;
    },

    /** Pantalla 1: valida el código y persiste credenciales + datos del ticket */
    async link(code: string) {
      const result = await linkTerminal(code, {
        baseUrl: this.apiUrl,
        appVersion: this.appVersion,
      });
      await setMeta("api_token", result.token);
      await setMeta("hmac_secret", result.hmac_secret);
      await setMeta("terminal_id", String(result.terminal.id));
      await setMeta("terminal_name", result.terminal.name);
      await setMeta("branch_name", result.terminal.branch ?? "");
      await setMeta("business_name", result.terminal.business ?? "");
      this.token = result.token;
      this.terminalName = result.terminal.name;
      this.branchName = result.terminal.branch;
      this.businessName = result.terminal.business;
      this.linked = true;
    },

    /** Heartbeat: marca online/offline sin bloquear jamás la operación */
    async heartbeat() {
      if (!this.token) return;
      try {
        await ping({
          baseUrl: this.apiUrl,
          appVersion: this.appVersion,
          token: this.token,
        });
        this.online = true;
      } catch {
        this.online = false;
      }
    },
  },
});
