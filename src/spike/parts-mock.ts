/**
 * SPIKE (Fase 0) — datos de ejemplo del POS de repuestos.
 *
 * ⚠️ DESECHABLE: solo para validar la UX del buscador+grid. No toca la base
 * ni el contrato. Los nombres de campo imitan la réplica real que definirá
 * docs/specs/pos-profiles.md §4-5 (reference, location, stock).
 */

export interface PartRow {
  id: number;
  /** Código interno corto (como el SOGE: 10342, 8235…) */
  code: string;
  barcode: string | null;
  /** Descripción = name del producto */
  name: string;
  /** Número de parte / referencia cruzada */
  reference: string | null;
  /** Precio de venta CON ITBIS (string decimal) */
  price: string;
  /** Existencia de la sucursal (snapshot; puede ser negativa) */
  stock: number;
  /** Ubicación física (estante/gaveta) */
  location: string | null;
  taxCategory: "ITBIS18" | "ITBIS16" | "ITBIS0" | "EXENTO";
}

export const PARTS_MOCK: PartRow[] = [
  { id: 1, code: "10342", barcode: "071924003385", name: "ACEITE 0W16 TOYOTA SINTETICO ORG", reference: "T-0W16-1L", price: "1200.00", stock: 11, location: "A-3", taxCategory: "ITBIS18" },
  { id: 2, code: "8235", barcode: "087989163", name: "ACEITE 0W20 HONDA FULL SINTETICO ORG", reference: "H-0W20-1L", price: "750.00", stock: 1, location: "A-3", taxCategory: "ITBIS18" },
  { id: 3, code: "7380", barcode: "6400622909363", name: "ACEITE 10W30 BUENO SINTETICO", reference: "B-10W30", price: "275.00", stock: -6, location: "A-4", taxCategory: "ITBIS18" },
  { id: 4, code: "8238", barcode: "087989135", name: "ACEITE 10W30 HONDA FULL SINTETICO ORG", reference: "H-10W30-1L", price: "500.00", stock: 3, location: "A-3", taxCategory: "ITBIS18" },
  { id: 5, code: "6244", barcode: "6400622901398", name: "ACEITE 20W50 BUENO SEMI SINTETIC M5", reference: "B-20W50", price: "300.00", stock: 21, location: "A-4", taxCategory: "ITBIS18" },
  { id: 6, code: "1883", barcode: "7468799280042", name: "ACEITE 2T OVEROL PEQU VERDE", reference: "OVL-2T-S", price: "60.00", stock: 70, location: "B-1", taxCategory: "ITBIS18" },
  { id: 7, code: "4358", barcode: "90793AY412", name: "ACEITE 4T STD YAMALUBE 20W50", reference: "YAM-4T", price: "490.00", stock: 5, location: "B-1", taxCategory: "ITBIS18" },
  { id: 8, code: "2201", barcode: null, name: "FILTRO ACEITE TOYOTA 90915-YZZE1", reference: "90915-YZZE1", price: "285.00", stock: 24, location: "C-2", taxCategory: "ITBIS18" },
  { id: 9, code: "2202", barcode: null, name: "FILTRO ACEITE HONDA 15400-PLM-A02", reference: "15400-PLM-A02", price: "310.00", stock: 0, location: "C-2", taxCategory: "ITBIS18" },
  { id: 10, code: "2210", barcode: "7891234000121", name: "FILTRO AIRE NISSAN SENTRA B15", reference: "16546-4M400", price: "420.00", stock: 8, location: "C-3", taxCategory: "ITBIS18" },
  { id: 11, code: "3301", barcode: null, name: "BUJIA NGK IRIDIUM IFR6T11", reference: "IFR6T11", price: "650.00", stock: 16, location: "D-1", taxCategory: "ITBIS18" },
  { id: 12, code: "3302", barcode: null, name: "BUJIA DENSO K20PR-U11", reference: "K20PR-U11", price: "180.00", stock: 2, location: "D-1", taxCategory: "ITBIS18" },
  { id: 13, code: "4410", barcode: null, name: "PASTILLA FRENO DELANTERA COROLLA 09-13", reference: "04465-02220", price: "1450.00", stock: 4, location: "E-2", taxCategory: "ITBIS18" },
  { id: 14, code: "4415", barcode: null, name: "DISCO FRENO DELANTERO CIVIC 06-11", reference: "45251-SNA-A00", price: "2200.00", stock: 1, location: "E-3", taxCategory: "ITBIS18" },
  { id: 15, code: "5501", barcode: "7702018254415", name: "CORREA TIEMPO GATES T295", reference: "T295", price: "980.00", stock: 6, location: "F-1", taxCategory: "ITBIS18" },
  { id: 16, code: "5510", barcode: null, name: "CORREA ALTERNADOR 4PK890", reference: "4PK890", price: "340.00", stock: 12, location: "F-1", taxCategory: "ITBIS18" },
  { id: 17, code: "6601", barcode: null, name: "BATERIA 12V 65AH ROCKET NX120-7", reference: "NX120-7", price: "4800.00", stock: 3, location: "G-1", taxCategory: "ITBIS18" },
  { id: 18, code: "7701", barcode: "7411231000091", name: "BOMBILLO H4 12V 60/55W PHILIPS", reference: "H4-12V", price: "220.00", stock: 40, location: "H-2", taxCategory: "ITBIS18" },
  { id: 19, code: "7702", barcode: null, name: "BOMBILLO LED T10 BLANCO (PAR)", reference: "T10-LED", price: "150.00", stock: 33, location: "H-2", taxCategory: "ITBIS18" },
  { id: 20, code: "8801", barcode: null, name: "LIQUIDO FRENO DOT-3 500ML", reference: "DOT3-500", price: "160.00", stock: 18, location: "B-2", taxCategory: "ITBIS18" },
  { id: 21, code: "8810", barcode: null, name: "REFRIGERANTE VERDE GALON PREPARADO", reference: "COOL-GL", price: "390.00", stock: 9, location: "B-3", taxCategory: "ITBIS18" },
  { id: 22, code: "9901", barcode: null, name: "GUANTE MECANICO NITRILO (PAR)", reference: "GNT-NTR", price: "45.00", stock: 120, location: "I-1", taxCategory: "ITBIS18" },
  { id: 23, code: "9910", barcode: null, name: "WAIPE / TRAPO INDUSTRIAL LIBRA", reference: "WAIPE-LB", price: "80.00", stock: -3, location: "I-1", taxCategory: "EXENTO" },
];
