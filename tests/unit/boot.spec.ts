import { describe, expect, it, vi } from "vitest";

import { bootError, bootWithRetry } from "@/lib/boot";

/**
 * Arranque de la caja: un fallo transitorio del IPC/SQLite no puede dejar la
 * ventana en blanco. O reintenta hasta levantar, o deja el error VISIBLE.
 */
describe("bootWithRetry", () => {
  it("arranca a la primera cuando el entorno ya está listo", async () => {
    const load = vi.fn().mockResolvedValue(undefined);

    await expect(bootWithRetry(load)).resolves.toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    expect(bootError.value).toBeNull();
  });

  it("reintenta y levanta cuando el primer intento falla (la carrera real del arranque)", async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("window.__TAURI_INTERNALS__ is undefined"))
      .mockRejectedValueOnce(new Error("database is locked"))
      .mockResolvedValue(undefined);

    await expect(bootWithRetry(load)).resolves.toBe(true);
    expect(load).toHaveBeenCalledTimes(3);
    // Arrancó: no queda error colgado que tape la pantalla
    expect(bootError.value).toBeNull();
  });

  it("agotados los intentos deja el error a la vista, nunca pantalla en blanco", async () => {
    const load = vi.fn().mockRejectedValue(new Error("no such table: catalog_meta"));

    await expect(bootWithRetry(load)).resolves.toBe(false);
    expect(bootError.value).toBe("no such table: catalog_meta");
  });

  it("un rechazo que no es Error también se muestra legible", async () => {
    const load = vi.fn().mockRejectedValue("fallo raro del plugin");

    await expect(bootWithRetry(load)).resolves.toBe(false);
    expect(bootError.value).toBe("fallo raro del plugin");
  });
});
