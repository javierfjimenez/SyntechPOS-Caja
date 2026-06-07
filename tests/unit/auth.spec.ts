import bcrypt from "bcryptjs";
import { beforeAll, describe, expect, it } from "vitest";

import { findSupervisorByPin, findUserByPin, type UserRow } from "@/services/auth";

/**
 * Hash REAL generado por PHP (password_hash('1234', PASSWORD_BCRYPT)) tal como
 * lo produce el servidor Laravel: el prefijo $2y$ DEBE verificar en bcryptjs.
 * Si este test rompe, el login offline rompe con datos reales del bootstrap.
 */
const PHP_HASH_1234 = "$2y$12$tSUQr/VMH3toahQ35vSXLeCVjV3sx7GB4c.79lcg.ytQVScITby8u";

let users: UserRow[];

beforeAll(async () => {
  users = [
    { id: 1, name: "María Demo", role: "cashier", pin_hash: PHP_HASH_1234, is_active: 1 },
    { id: 2, name: "Ana Supervisora", role: "supervisor", pin_hash: await bcrypt.hash("9999", 10), is_active: 1 },
    { id: 3, name: "Inactivo", role: "cashier", pin_hash: await bcrypt.hash("5555", 10), is_active: 0 },
    { id: 4, name: "Sin PIN", role: "owner", pin_hash: null, is_active: 1 },
  ];
});

describe("findUserByPin (login offline contra la réplica local)", () => {
  it("verifica hashes $2y$ de PHP/Laravel (compatibilidad servidor↔caja)", async () => {
    const user = await findUserByPin("1234", users);
    expect(user?.id).toBe(1);
  });

  it("identifica al usuario correcto entre varios", async () => {
    const user = await findUserByPin("9999", users);
    expect(user?.id).toBe(2);
  });

  it("PIN errado → null", async () => {
    expect(await findUserByPin("0000", users)).toBeNull();
  });

  it("ignora usuarios inactivos aunque el PIN coincida", async () => {
    expect(await findUserByPin("5555", users)).toBeNull();
  });

  it("ignora usuarios sin PIN asignado", async () => {
    expect(await findUserByPin("", users)).toBeNull();
  });
});

describe("findSupervisorByPin (PinAutorizacion: solo supervisor/owner)", () => {
  it("acepta el PIN de un supervisor", async () => {
    const sup = await findSupervisorByPin("9999", users);
    expect(sup?.id).toBe(2);
  });

  it("rechaza el PIN de una cajera (sin permiso de autorizar)", async () => {
    expect(await findSupervisorByPin("1234", users)).toBeNull();
  });
});
