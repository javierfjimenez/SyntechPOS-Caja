import Database from "@tauri-apps/plugin-sql";

/**
 * Acceso único al SQLite local. Las migraciones viven en Rust
 * (src-tauri/migrations/) y corren solas al cargar la base.
 */

const DB_URL = "sqlite:syntechpos-caja.db";

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (db === null) {
    db = await Database.load(DB_URL);
  }
  return db;
}

// ── catalog_meta: clave-valor (credenciales del terminal, catalog_version, etc.) ──

export async function getMeta(key: string): Promise<string | null> {
  const rows = await (await getDb()).select<{ value: string }[]>(
    "SELECT value FROM catalog_meta WHERE key = $1",
    [key],
  );
  return rows[0]?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await (await getDb()).execute(
    "INSERT INTO catalog_meta (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2",
    [key, value],
  );
}

export async function getMetaMany(keys: string[]): Promise<Record<string, string>> {
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(", ");
  const rows = await (await getDb()).select<{ key: string; value: string }[]>(
    `SELECT key, value FROM catalog_meta WHERE key IN (${placeholders})`,
    keys,
  );
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
