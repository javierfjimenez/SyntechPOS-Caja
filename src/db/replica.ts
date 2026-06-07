import type {
  CatalogPage,
  CustomerDelta,
  DepartmentDelta,
  PaymentMethodDelta,
  ProductDelta,
  UserDelta,
} from "@/api/sync";

/**
 * Escritura de las réplicas de solo-lectura desde el delta (eventos-sync §7.1).
 * Las BAJAS llegan como filas con is_active=false: se upsertea, nunca se borra.
 * Inserciones multi-fila en chunks bajo el límite de parámetros de SQLite (999)
 * — el CA de 4.2 (10k SKUs < 30 s) no sobrevive a un INSERT por fila.
 */

/** Lo mínimo que necesitamos de tauri-plugin-sql (inyectable en tests) */
export interface DbExecutor {
  execute(sql: string, params?: unknown[]): Promise<unknown>;
}

const bit = (b: boolean): number => (b ? 1 : 0);

async function upsertChunked(
  db: DbExecutor,
  table: string,
  columns: string[],
  rows: unknown[][],
): Promise<void> {
  if (rows.length === 0) return;
  const chunkSize = Math.floor(900 / columns.length);
  const updates = columns
    .filter((c) => c !== "id")
    .map((c) => `${c} = excluded.${c}`)
    .join(", ");

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    let p = 0;
    const values = chunk
      .map(() => `(${columns.map(() => `$${++p}`).join(", ")})`)
      .join(", ");
    await db.execute(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${values} ON CONFLICT (id) DO UPDATE SET ${updates}`,
      chunk.flat(),
    );
  }
}

// ── Mapeos fila-del-delta → fila-SQLite (puros, testeados en Vitest) ──────────

export function mapProduct(p: ProductDelta): unknown[] {
  return [p.id, p.name, p.sku, p.price, p.cost, p.tax_category, bit(p.is_weighable), p.department_id, bit(p.is_active), p.row_version];
}

export function mapDepartment(d: DepartmentDelta): unknown[] {
  return [d.id, d.name, bit(d.is_active), d.row_version];
}

export function mapCustomer(c: CustomerDelta): unknown[] {
  return [c.id, c.name, c.document_type, c.document_number, c.phone, c.credit_limit, c.credit_balance, bit(c.is_active), c.row_version];
}

export function mapPaymentMethod(m: PaymentMethodDelta): unknown[] {
  return [m.id, m.code, m.name, bit(m.is_active), m.row_version];
}

export function mapUser(u: UserDelta): unknown[] {
  return [u.id, u.name, u.role, u.pin_hash, bit(u.is_active), u.row_version];
}

export const PRODUCT_COLUMNS = ["id", "name", "sku", "price", "cost", "tax_category", "is_weighable", "department_id", "is_active", "row_version"];
export const DEPARTMENT_COLUMNS = ["id", "name", "is_active", "row_version"];
export const CUSTOMER_COLUMNS = ["id", "name", "document_type", "document_number", "phone", "credit_limit", "credit_balance", "is_active", "row_version"];
export const PAYMENT_METHOD_COLUMNS = ["id", "code", "name", "is_active", "row_version"];
export const USER_COLUMNS = ["id", "name", "role", "pin_hash", "is_active", "row_version"];

/** Los códigos de barras se REEMPLAZAN por producto (el delta trae el set completo) */
async function replaceBarcodes(db: DbExecutor, products: ProductDelta[]): Promise<void> {
  if (products.length === 0) return;

  const ids = products.map((p) => p.id);
  for (let i = 0; i < ids.length; i += 900) {
    const chunk = ids.slice(i, i + 900);
    await db.execute(
      `DELETE FROM barcodes WHERE product_id IN (${chunk.map((_, j) => `$${j + 1}`).join(", ")})`,
      chunk,
    );
  }

  const rows = products.flatMap((p) => p.barcodes.map((b) => [b.barcode, p.id]));
  for (let i = 0; i < rows.length; i += 450) {
    const chunk = rows.slice(i, i + 450);
    let p = 0;
    const values = chunk.map(() => `($${++p}, $${++p})`).join(", ");
    await db.execute(
      `INSERT INTO barcodes (code, product_id) VALUES ${values} ON CONFLICT (code) DO UPDATE SET product_id = excluded.product_id`,
      chunk.flat(),
    );
  }
}

/** Aplica UNA página del delta a las réplicas */
export async function applyCatalogPage(db: DbExecutor, page: CatalogPage): Promise<void> {
  await upsertChunked(db, "products", PRODUCT_COLUMNS, page.products.map(mapProduct));
  await replaceBarcodes(db, page.products);
  await upsertChunked(db, "departments", DEPARTMENT_COLUMNS, page.departments.map(mapDepartment));
  await upsertChunked(db, "customers", CUSTOMER_COLUMNS, page.customers.map(mapCustomer));
  await upsertChunked(db, "payment_methods", PAYMENT_METHOD_COLUMNS, page.payment_methods.map(mapPaymentMethod));
  await upsertChunked(db, "users", USER_COLUMNS, page.users.map(mapUser));
}
