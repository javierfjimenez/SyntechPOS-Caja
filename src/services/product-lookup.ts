import { getDb } from "@/db";
import { mulPriceQty, toCents, toMilli, fromCents } from "@/lib/decimal";
import type { SaleLine, TaxCategory } from "@/services/sale";
import type { ScaleBarcode } from "@/services/scale-barcode";

/**
 * Resolución de códigos y búsqueda sobre la réplica local (todo offline).
 */

export interface ProductRow {
  id: number;
  name: string;
  sku: string | null;
  price: string;
  cost: string | null;
  tax_category: TaxCategory;
  is_weighable: number;
  department_id: number;
  brand_id: number | null;
  image_url: string | null;
}

const PRODUCT_FIELDS =
  "p.id, p.name, p.sku, p.price, p.cost, p.tax_category, p.is_weighable, p.department_id, p.brand_id, p.image_url";

/** Código escaneado → producto (barcode exacto; fallback: SKU exacto) */
export async function findByCode(code: string): Promise<ProductRow | null> {
  const db = await getDb();
  const byBarcode = await db.select<ProductRow[]>(
    `SELECT ${PRODUCT_FIELDS} FROM products p JOIN barcodes b ON b.product_id = p.id
     WHERE b.code = $1 AND p.is_active = 1 LIMIT 1`,
    [code],
  );
  if (byBarcode[0] !== undefined) return byBarcode[0];

  const bySku = await db.select<ProductRow[]>(
    `SELECT ${PRODUCT_FIELDS} FROM products p WHERE p.sku = $1 AND p.is_active = 1 LIMIT 1`,
    [code],
  );
  return bySku[0] ?? null;
}

/** Búsqueda instantánea por nombre o SKU (dropdown del input, máx. 8) */
export async function searchProducts(term: string, limit = 8): Promise<ProductRow[]> {
  const db = await getDb();
  const like = `%${term.trim()}%`;
  return db.select<ProductRow[]>(
    `SELECT ${PRODUCT_FIELDS} FROM products p
     WHERE p.is_active = 1 AND (p.name LIKE $1 OR p.sku LIKE $1)
     ORDER BY p.name LIMIT $2`,
    [like, limit],
  );
}

/** Producto → línea de venta (cantidad 1 salvo multiplicador/pesaje) */
export function productToLine(product: ProductRow, quantity = "1.000", unitPrice?: string): SaleLine {
  return {
    product_id: product.id,
    department_id: product.department_id,
    description: product.name,
    quantity,
    unit_price: unitPrice ?? product.price,
    discount_amount: "0.00",
    tax_category: product.tax_category,
    unit_cost: product.cost ?? "0.0000",
    is_weighable: product.is_weighable === 1,
  };
}

/**
 * Código de balanza resuelto → línea pesable.
 * - formato weight: cantidad = peso, precio = el del catálogo
 * - formato price: el TOTAL viene impreso (es el hecho); cantidad derivada
 *   peso ≈ total/precio (3 dec) y precio unitario del catálogo se ajustan
 *   para que cantidad × precio reproduzca EXACTO el total de la etiqueta
 */
export function scaleToLine(product: ProductRow, scale: ScaleBarcode): SaleLine {
  if (scale.weight !== null) {
    return { ...productToLine(product, scale.weight), is_weighable: true };
  }

  // price embebido: la etiqueta manda. Línea de 1.000 × total — el peso no
  // viaja en el código y los montos deben cuadrar al centavo
  return {
    ...productToLine(product, "1.000", scale.price!),
    is_weighable: true,
  };
}

/** Total de etiqueta vs catálogo (para alertar divergencias futuras, 4.10) */
export function expectedScaleTotal(product: ProductRow, weight: string): string {
  return fromCents(mulPriceQty(toCents(product.price), toMilli(weight)));
}

/** Log local de códigos no reconocidos (candidatos a alta — ui-caja §9.2) */
export async function logUnknownCode(code: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO unknown_codes (code, times, last_seen_at) VALUES ($1, 1, $2)
     ON CONFLICT (code) DO UPDATE SET times = times + 1, last_seen_at = $2`,
    [code, new Date().toISOString()],
  );
}

export interface DepartmentRow {
  id: number;
  name: string;
  tax_category: TaxCategory; // el departamento define la tasa (@3a8fb67)
}

export async function listDepartments(): Promise<DepartmentRow[]> {
  const db = await getDb();
  return db.select<DepartmentRow[]>(
    "SELECT id, name, tax_category FROM departments WHERE is_active = 1 ORDER BY name",
  );
}

export interface DepartmentCount {
  id: number;
  name: string;
  count: number;
}

/** Departamentos activos con el conteo de productos activos (rail de categorías) */
export async function listDepartmentCounts(): Promise<{ total: number; departments: DepartmentCount[] }> {
  const db = await getDb();
  const departments = await db.select<DepartmentCount[]>(
    `SELECT d.id, d.name, COUNT(p.id) AS count
     FROM departments d
     LEFT JOIN products p ON p.department_id = d.id AND p.is_active = 1
     WHERE d.is_active = 1
     GROUP BY d.id, d.name ORDER BY d.name`,
  );
  const totalRows = await db.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM products WHERE is_active = 1");
  return { total: totalRows[0]?.n ?? 0, departments };
}

export interface BrandRow {
  id: number;
  name: string;
}

export async function listBrands(): Promise<BrandRow[]> {
  const db = await getDb();
  return db.select<BrandRow[]>("SELECT id, name FROM brands WHERE is_active = 1 ORDER BY name");
}

/**
 * Productos para el grid (D24): filtrables por departamento, marca o texto
 * (nombre/SKU). Sin filtro = todos los activos. Orden por nombre.
 */
export async function listProductsForGrid(
  filter: { departmentId?: number; brandId?: number; term?: string } = {},
  limit = 500,
): Promise<ProductRow[]> {
  const db = await getDb();
  const where: string[] = ["p.is_active = 1"];
  const params: unknown[] = [];
  if (filter.departmentId !== undefined) {
    params.push(filter.departmentId);
    where.push(`p.department_id = $${params.length}`);
  }
  if (filter.brandId !== undefined) {
    params.push(filter.brandId);
    where.push(`p.brand_id = $${params.length}`);
  }
  const term = filter.term?.trim();
  if (term) {
    params.push(`%${term}%`);
    const i = params.length;
    where.push(`(p.name LIKE $${i} OR p.sku LIKE $${i})`);
  }
  params.push(limit);
  return db.select<ProductRow[]>(
    `SELECT ${PRODUCT_FIELDS} FROM products p WHERE ${where.join(" AND ")} ORDER BY p.name LIMIT $${params.length}`,
    params,
  );
}

export interface CustomerRow {
  id: number;
  name: string;
  document_type: "rnc" | "cedula" | null;
  document_number: string | null;
  phone: string | null;
  credit_limit: string | null;
  credit_balance: string | null;
}

/** Cliente por id (datos de crédito frescos para F7 — pueden cambiar con el delta) */
export async function getCustomerById(id: number): Promise<CustomerRow | null> {
  const db = await getDb();
  const rows = await db.select<CustomerRow[]>(
    `SELECT id, name, document_type, document_number, phone, credit_limit, credit_balance
     FROM customers WHERE id = $1 AND is_active = 1 LIMIT 1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Búsqueda de clientes por nombre/documento (BuscadorCliente §9.3) */
export async function searchCustomers(term: string, limit = 8): Promise<CustomerRow[]> {
  const db = await getDb();
  const like = `%${term.trim()}%`;
  return db.select<CustomerRow[]>(
    `SELECT id, name, document_type, document_number, phone, credit_limit, credit_balance
     FROM customers WHERE is_active = 1 AND (name LIKE $1 OR document_number LIKE $1)
     ORDER BY name LIMIT $2`,
    [like, limit],
  );
}
