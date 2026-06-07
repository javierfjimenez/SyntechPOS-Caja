import bcrypt from "bcryptjs";

/**
 * Login de cajero por PIN, 100% offline (ui-caja.md §3): el PIN identifica al
 * usuario (único por negocio), así que se compara contra TODOS los usuarios
 * activos de la réplica local. bcryptjs verifica los hashes $2y$ de Laravel.
 */

export interface UserRow {
  id: number;
  name: string;
  role: string; // owner | supervisor | cashier
  pin_hash: string | null;
  is_active: number;
}

export const SUPERVISOR_ROLES = ["owner", "supervisor"];

export async function findUserByPin(pin: string, users: UserRow[]): Promise<UserRow | null> {
  for (const user of users) {
    if (!user.is_active || !user.pin_hash) continue;
    if (await bcrypt.compare(pin, user.pin_hash)) return user;
  }
  return null;
}

/** Para PinAutorizacion (kiosk-exit, descuentos…): solo supervisor u owner autorizan */
export async function findSupervisorByPin(pin: string, users: UserRow[]): Promise<UserRow | null> {
  const supervisors = users.filter((u) => SUPERVISOR_ROLES.includes(u.role));
  return findUserByPin(pin, supervisors);
}
