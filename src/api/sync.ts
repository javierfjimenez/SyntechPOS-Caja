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
  brand_id: number | null; // D23: atributo, no afecta precio ni fiscalidad
  image_url: string | null; // D24: hoy siempre null → la caja usa avatar
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

export interface BrandDelta {
  id: number;
  name: string;
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
  brands?: BrandDelta[]; // opcional: tolerar servidor viejo sin marcas
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
    /** D21: sin e-CF el ticket va sin QR ni leyenda de contingencia */
    ecf_enabled: boolean;
    /** Arqueo CIEGO (no muestra el esperado antes de contar). Default true. Opcional */
    blind_count?: boolean;
    /** D26: tema white-label por negocio (hex listos). Opcional: servidor viejo */
    theme?: { key: string; primary: string; primary_hi: string } | null;
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

export interface EcfResultRow {
  sale_ulid: string;
  encf: string;
  security_code: string;
  dgii_url: string;
  qr_image: string;
  status: "sent" | "accepted" | "conditional";
  cursor: number;
}

/** e-CF resueltos de ESTE terminal → reimpresión timbrada (§7.2, D9) */
export async function getEcfResults(
  since: number,
  opts: ApiOptions,
): Promise<{ results: EcfResultRow[]; next_cursor: number | null }> {
  return apiRequest("GET", `/sync/ecf-results?since=${since}`, undefined, opts);
}
