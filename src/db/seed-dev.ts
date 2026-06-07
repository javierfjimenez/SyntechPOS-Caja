import bcrypt from "bcryptjs";

import { getDb } from "@/db";

/**
 * SOLO DESARROLLO: el seeder demo del servidor aún no trae cajeros con PIN y
 * /sync/bootstrap llega en la tarea 4.2 — hasta entonces, sembramos usuarios
 * locales para poder probar el login. Se elimina al cablear el bootstrap.
 *
 * PINs demo: María (cajera) 1234 · Ana (supervisora) 9999
 */
export async function seedDevUsers(): Promise<void> {
  if (!import.meta.env.DEV) return;

  const db = await getDb();
  const rows = await db.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM users");
  if (rows[0]!.n > 0) return;

  const maria = await bcrypt.hash("1234", 10);
  const ana = await bcrypt.hash("9999", 10);
  await db.execute(
    "INSERT INTO users (id, name, role, pin_hash, is_active) VALUES (1, 'María Demo', 'cashier', $1, 1), (2, 'Ana Supervisora', 'supervisor', $2, 1)",
    [maria, ana],
  );
}
