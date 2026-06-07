import { apiRequest, type ApiOptions } from "@/api/client";

/**
 * Bajada del sync (eventos-sync.md §7 + docs/endpoints.md §4/§6).
 * Las filas del delta traen MÁS columnas que las tipadas aquí (cost, sku, …):
 * se tipan las que la caja consume; el resto se ignora.
 */

export interface ProductDelta {
  id: number;
  name: string;
  sku: string | null;
  price: string; // decimales SIEMPRE como string
  cost: string | null;
  tax_category: "ITBIS18" | "ITBIS16" | "ITBIS0" | "EXENTO";
  is_weighable: boolean;
  department_id: number;
  is_active: boolean;
  row_version: number;
  barcodes: { barcode: string }[];
}

export interface DepartmentDelta {
  id: number;
  name: string;
  tax_category: "ITBIS18" | "ITBIS16" | "ITBIS0" | "EXENTO";
  is_active: boolean;
  row_version: number;
}

export interface CustomerDelta {
  id: number;
  name: string;
  document_type: "rnc" | "cedula" | null;
  document_number: string | null;
  phone: string | null;
  credit_limit: string | null;
  credit_balance: string | null;
  is_active: boolean;
  row_version: number;
}

export interface PaymentMethodDelta {
  id: number;
  code: "cash" | "card" | "transfer" | "credit";
  name: string;
  is_active: boolean;
  row_version: number;
}

export interface UserDelta {
  id: number;
  name: string;
  role: string;
  pin_hash: string | null;
  is_active: boolean;
  row_version: number;
}

export interface CatalogPage {
  catalog_version: number;
  products: ProductDelta[];
  departments: DepartmentDelta[];
  customers: CustomerDelta[];
  payment_methods: PaymentMethodDelta[];
  users: UserDelta[];
  next_cursor: string | null;
}

export async function getCatalogPage(
  since: number,
  cursor: string | null,
  opts: ApiOptions,
): Promise<CatalogPage> {
  const query = new URLSearchParams({ since: String(since) });
  if (cursor !== null) query.set("cursor", cursor);
  return apiRequest<CatalogPage>("GET", `/sync/catalog?${query}`, undefined, opts);
}

export interface BootstrapResult {
  business: {
    rnc: string;
    legal_name: string;
    trade_name: string;
    address: string | null;
    phone: string | null;
    receipt_footer: string | null;
    scale_format: "weight" | "price";
  };
  settings: {
    max_discount_percent: number;
    allow_department_sale: boolean;
  };
  branch: { id: number; name: string | null; address: string | null };
  terminal: { id: number; name: string };
  catalog_version: number;
  min_client_version: string;
  server_time: string;
}

export async function getBootstrap(opts: ApiOptions): Promise<BootstrapResult> {
  return apiRequest<BootstrapResult>("GET", "/sync/bootstrap", undefined, opts);
}
