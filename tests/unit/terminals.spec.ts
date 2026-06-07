import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/api/client";
import { linkTerminal } from "@/api/terminals";

/** Respuesta exacta del POST /terminals/link del servidor (commit d555795) */
const LINK_RESPONSE = {
  token: "1|abcdef",
  hmac_secret: "s".repeat(64),
  terminal: { id: 1, name: "Caja 1", branch: "Sucursal Centro", business: "Súper Demo" },
};

function fetchStub(status: number, body: unknown): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

const OPTS = { baseUrl: "http://localhost:8000/api/v1", appVersion: "0.1.0" };

describe("linkTerminal (pantalla 1 contra POST /terminals/link)", () => {
  it("envía code + app_version y el header X-Client-Version (D14)", async () => {
    const fetchFn = fetchStub(201, LINK_RESPONSE);
    await linkTerminal("123456", { ...OPTS, fetchFn });

    const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:8000/api/v1/terminals/link");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ code: "123456", app_version: "0.1.0" });
    expect((init.headers as Record<string, string>)["X-Client-Version"]).toBe("0.1.0");
  });

  it("201 → devuelve token, hmac_secret y datos del terminal", async () => {
    const result = await linkTerminal("123456", { ...OPTS, fetchFn: fetchStub(201, LINK_RESPONSE) });
    expect(result).toEqual(LINK_RESPONSE);
  });

  it("422 → ApiError con el mensaje del servidor (código inválido o vencido)", async () => {
    const fetchFn = fetchStub(422, {
      message: "Código de vinculación inválido o vencido. Genera uno nuevo en el panel.",
    });
    await expect(linkTerminal("000000", { ...OPTS, fetchFn })).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
      message: "Código de vinculación inválido o vencido. Genera uno nuevo en el panel.",
    });
  });

  it("sin red → ApiError con status null (mensaje 'solo necesitas internet para este paso')", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(linkTerminal("123456", { ...OPTS, fetchFn })).rejects.toMatchObject({
      status: null,
    });
    await expect(linkTerminal("123456", { ...OPTS, fetchFn })).rejects.toBeInstanceOf(ApiError);
  });
});
