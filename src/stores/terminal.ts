import { getVersion } from "@tauri-apps/api/app";
import { defineStore } from "pinia";

import { DEFAULT_API_URL } from "@/api/client";
import { getBootstrap } from "@/api/sync";
import { linkTerminal, ping } from "@/api/terminals";
import { getMetaMany, setMeta } from "@/db";
import { applyTheme, resolveTheme } from "@/lib/theme";
import { updateRequired } from "@/lib/version";

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
  scaleFormat: "weight" | "price";
  /** Settings curados del negocio (bootstrap @3a8fb67) — aplican offline */
  maxDiscountPercent: number;
  allowDepartmentSale: boolean;
  ecfEnabled: boolean; // D21: facturación electrónica opcional por negocio
  blindCount: boolean; // arqueo ciego (no muestra el esperado antes de contar)
  /** 401/403 del servidor: terminal desvinculada — flujo de re-vinculación pendiente */
  revoked: boolean;
  /** 4.12/D14: la app está por debajo de min_client_version (vender SIGUE permitido) */
  updateRequired: boolean;
  lastServerContact: number | null;
  online: boolean;
  appVersion: string;
  apiUrl: string;
}

const META_KEYS = [
  "api_token",
  "hmac_secret",
  "terminal_id",
  "terminal_name",
  "branch_name",
  "business_name",
  "scale_format",
  "setting_max_discount_percent",
  "setting_allow_department_sale",
  "setting_ecf_enabled",
  "setting_blind_count",
  "theme_primary",
  "theme_primary_hi",
];

export const useTerminalStore = defineStore("terminal", {
  state: (): TerminalState => ({
    loaded: false,
    linked: false,
    token: null,
    terminalName: null,
    branchName: null,
    businessName: null,
    scaleFormat: "weight",
    maxDiscountPercent: 10,
    allowDepartmentSale: true,
    ecfEnabled: false, // conservador: sin QR hasta que el bootstrap diga lo contrario
    blindCount: true, // seguro por defecto: arqueo ciego
    revoked: false,
    updateRequired: false,
    lastServerContact: null,
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
      this.scaleFormat = meta.scale_format === "price" ? "price" : "weight";
      this.maxDiscountPercent = Number(meta.setting_max_discount_percent ?? "10");
      this.allowDepartmentSale = meta.setting_allow_department_sale !== "0";
      this.ecfEnabled = meta.setting_ecf_enabled === "1";
      this.blindCount = meta.setting_blind_count !== "0"; // ciego salvo que diga 0
      // Tema white-label (D26): aplicar el guardado al arrancar (offline)
      applyTheme(resolveTheme({ primary: meta.theme_primary, primary_hi: meta.theme_primary_hi }));
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
      this.revoked = false; // re-vinculación exitosa: la caja vuelve a operar
    },

    /**
     * GET /sync/bootstrap tras vincular: los datos del negocio/sucursal que
     * el ticket imprime (4.5) quedan en catalog_meta — disponibles offline.
     */
    async fetchBootstrap() {
      if (!this.token) return;
      const data = await getBootstrap({
        baseUrl: this.apiUrl,
        appVersion: this.appVersion,
        token: this.token,
      });
      await setMeta("business_rnc", data.business.rnc);
      await setMeta("business_legal_name", data.business.legal_name);
      await setMeta("business_trade_name", data.business.trade_name);
      await setMeta("business_address", data.business.address ?? "");
      await setMeta("business_phone", data.business.phone ?? "");
      await setMeta("receipt_footer", data.business.receipt_footer ?? "");
      await setMeta("scale_format", data.business.scale_format);
      await setMeta("branch_address", data.branch.address ?? "");
      await setMeta("setting_max_discount_percent", String(data.settings.max_discount_percent));
      await setMeta("setting_allow_department_sale", data.settings.allow_department_sale ? "1" : "0");
      await setMeta("setting_ecf_enabled", data.settings.ecf_enabled ? "1" : "0");
      await setMeta("setting_blind_count", data.settings.blind_count === false ? "0" : "1");
      this.scaleFormat = data.business.scale_format;
      this.maxDiscountPercent = data.settings.max_discount_percent;
      this.allowDepartmentSale = data.settings.allow_department_sale;
      this.ecfEnabled = data.settings.ecf_enabled;
      this.blindCount = data.settings.blind_count !== false;
      // Tema white-label (D26): guardar y re-tematizar al instante
      const theme = resolveTheme(data.settings.theme);
      await setMeta("theme_primary", theme.primary);
      await setMeta("theme_primary_hi", theme.primaryHi);
      applyTheme(theme);
    },

    /** El servidor revocó el token (terminal robada/desvinculada desde el panel) */
    markRevoked() {
      this.revoked = true;
      this.online = false;
    },

    /** El servidor informó su mínimo (ping o respuesta de eventos) */
    checkMinVersion(minClientVersion: string) {
      this.updateRequired = updateRequired(this.appVersion, minClientVersion);
    },

    /** Heartbeat: marca online/offline sin bloquear jamás la operación */
    async heartbeat() {
      if (!this.token) return;
      try {
        const pong = await ping({
          baseUrl: this.apiUrl,
          appVersion: this.appVersion,
          token: this.token,
        });
        this.online = true;
        this.lastServerContact = Date.now();
        this.checkMinVersion(pong.min_client_version);
      } catch {
        this.online = false;
      }
    },
  },
});
