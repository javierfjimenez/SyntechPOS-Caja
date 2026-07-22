import { setActivePinia, createPinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

// El store toca la DB (catalog_meta), Tauri (versión) y efectos de UI (tema,
// sonidos). Se simulan: aquí solo importa la LÓGICA de revocación persistida.
const meta: Record<string, string> = {};

vi.mock("@/db", () => ({
  getMetaMany: vi.fn(async (keys: string[]) =>
    Object.fromEntries(keys.filter((k) => k in meta).map((k) => [k, meta[k]])),
  ),
  setMeta: vi.fn(async (key: string, value: string) => {
    meta[key] = value;
  }),
}));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn(async () => "0.1.0") }));
vi.mock("@/lib/sounds", () => ({ setSoundsEnabled: vi.fn() }));
vi.mock("@/lib/theme", () => ({ applyTheme: vi.fn(), resolveTheme: vi.fn(() => ({ primary: "#000", primaryHi: "#111" })) }));

import { useTerminalStore } from "@/stores/terminal";

describe("terminal: la revocación sobrevive al reinicio", () => {
  beforeEach(() => {
    for (const k of Object.keys(meta)) delete meta[k];
    setActivePinia(createPinia());
  });

  it("markRevoked persiste el flag en catalog_meta", async () => {
    const terminal = useTerminalStore();
    terminal.markRevoked();

    expect(terminal.revoked).toBe(true);
    expect(meta.revoked).toBe("1");
  });

  it("load() rehidrata revoked=true tras un reinicio (token vivo pero acceso muerto)", async () => {
    // Estado en disco tras revocar y reiniciar: token presente + flag puesto
    meta.api_token = "1|dead-token";
    meta.revoked = "1";

    const terminal = useTerminalStore();
    await terminal.load();

    // Antes del fix esto era `false` → la caja arrancaba "sana" y entraba al login
    // sin salida a re-vincular. Ahora el guard la manda a /vincular.
    expect(terminal.revoked).toBe(true);
    expect(terminal.linked).toBe(true);
  });

  it("una caja nunca revocada arranca sin el flag", async () => {
    meta.api_token = "1|good-token";

    const terminal = useTerminalStore();
    await terminal.load();

    expect(terminal.revoked).toBe(false);
  });
});
