<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";

import BuscadorCliente from "@/components/ui/BuscadorCliente.vue";
import CatalogoPos from "@/components/ui/CatalogoPos.vue";
import CobroModal from "@/components/ui/CobroModal.vue";
import DescuentoGlobal from "@/components/ui/DescuentoGlobal.vue";
import MontoLibre from "@/components/ui/MontoLibre.vue";
import MovimientoEfectivo from "@/components/ui/MovimientoEfectivo.vue";
import ProductoDesconocido from "@/components/ui/ProductoDesconocido.vue";
import RailCategorias from "@/components/ui/RailCategorias.vue";
import TicketVenta from "@/components/ui/TicketVenta.vue";
import ToastCaja from "@/components/ui/ToastCaja.vue";
import ToolbarPos from "@/components/ui/ToolbarPos.vue";
import TopbarPos from "@/components/ui/TopbarPos.vue";
import VentasSuspendidas from "@/components/ui/VentasSuspendidas.vue";
import { beep } from "@/lib/beep";
import { peekTicketNumber } from "@/db/outbox";
import { fromCents } from "@/lib/decimal";
import { listDepartmentCounts, type DepartmentCount } from "@/services/product-lookup";
import type { SaleCustomer, SaleLine } from "@/services/sale";
import { useCashierStore } from "@/stores/cashier";
import { useOutboxStore } from "@/stores/outbox";
import { useSaleStore } from "@/stores/sale";
import { useSessionStore } from "@/stores/session";
import { useTerminalStore } from "@/stores/terminal";
import { useUiStore } from "@/stores/ui";

/**
 * Pantalla de venta — diseño Caja PRO (3 columnas): rail de categorías ·
 * catálogo central · ticket. Topbar de marca + toolbar de funciones.
 */
const router = useRouter();
const sale = useSaleStore();
const cashier = useCashierStore();
const session = useSessionStore();
const outbox = useOutboxStore();
const terminal = useTerminalStore();
const ui = useUiStore();

type Modal =
  | null
  | "cliente"
  | "movimiento"
  | "suspendidas"
  | "desconocido"
  | "cobro"
  | "descuento"
  | "montoLibre";
const modal = ref<Modal>(null);
const unknownCode = ref("");

const railDept = ref<number | null>(null);
const railTotal = ref(0);
const railDepts = ref<DepartmentCount[]>([]);

const tipo = ref<"consumo" | "credito">("consumo");
const ticketNumber = ref(1);
const drawerCash = ref("0.00");

onMounted(async () => {
  await sale.restore();
  await refrescarRail();
  ticketNumber.value = await peekTicketNumber();
  await refrescarEfectivo();
  window.addEventListener("keydown", onFnKeys);
});
onUnmounted(() => window.removeEventListener("keydown", onFnKeys));

async function refrescarRail() {
  const { total, departments } = await listDepartmentCounts();
  railTotal.value = total;
  railDepts.value = departments;
}

async function refrescarEfectivo() {
  if (!session.isOpen) {
    drawerCash.value = "0.00";
    return;
  }
  try {
    drawerCash.value = (await session.expected()).cash;
  } catch {
    drawerCash.value = fromCents(0n);
  }
}

// ── Catálogo ──────────────────────────────────────────────────────────────────
function onDesconocido(code: string) {
  beep();
  unknownCode.value = code;
  modal.value = "desconocido";
}
async function addDepartmentLine(line: SaleLine) {
  modal.value = null;
  await sale.addLine(line);
}

// ── Toolbar / ticket ──────────────────────────────────────────────────────────
async function setCustomer(customer: SaleCustomer | null) {
  modal.value = null;
  await sale.setCustomer(customer);
}
function setTipo(t: "consumo" | "credito") {
  tipo.value = t;
  if (t === "credito" && (sale.sale.customer === null || sale.sale.customer.id === null)) {
    ui.toast("error", "Crédito fiscal requiere un cliente con RNC.");
    modal.value = "cliente";
  }
}
async function vaciar() {
  await sale.clear();
}

async function suspender() {
  if (cashier.current === null) return;
  if (await sale.suspend(cashier.current.id)) {
    ui.toast("exito", "Venta puesta en espera (F6 para recuperar).");
  } else if (!sale.isEmpty) {
    ui.toast("error", "Máximo 5 ventas en espera.");
  }
}
async function recover(id: number) {
  modal.value = null;
  if (!(await sale.recover(id))) {
    ui.toast("error", "Termina o suspende la venta actual antes de recuperar otra.");
  }
}

async function registrarMovimiento(t: "withdrawal" | "deposit" | "expense", amount: string, reason: string) {
  if (cashier.current === null) return;
  modal.value = null;
  try {
    await session.addMovement(t, amount, reason, cashier.current.id);
    void outbox.drainNow();
    await refrescarEfectivo();
    ui.toast("exito", "Movimiento registrado.");
  } catch (e) {
    ui.toast("error", e instanceof Error ? e.message : "No se pudo registrar el movimiento.");
  }
}

function cobrar() {
  if (sale.isEmpty) return;
  modal.value = "cobro";
}

async function cobroCerrado() {
  modal.value = null;
  ticketNumber.value = await peekTicketNumber();
  await refrescarEfectivo();
}

function onMontoLibre(line: SaleLine) {
  modal.value = null;
  void sale.addLine(line);
}
async function irACierre() {
  if (!sale.isEmpty) {
    ui.toast("error", "Termina o suspende la venta antes de cerrar la caja.");
    return;
  }
  await router.push({ name: "cierre" });
}
async function devolucion() {
  await router.push({ name: "devolucion" });
}

function descuento() {
  if (sale.isEmpty) {
    ui.toast("error", "Agrega productos antes de aplicar un descuento.");
    return;
  }
  modal.value = "descuento";
}
function montoLibre() {
  if (!terminal.allowDepartmentSale) {
    ui.toast("error", "La venta por monto libre está desactivada para este negocio.");
    return;
  }
  modal.value = "montoLibre";
}
// Propina: diferida (sale.completed no tiene el campo en el contrato)

// ── Atajos ────────────────────────────────────────────────────────────────────
function onFnKeys(e: KeyboardEvent) {
  if (ui.modalOpen) return;
  const map: Record<string, () => void> = {
    F2: () => (modal.value = "cliente"),
    F3: descuento,
    F5: () => void suspender(),
    F6: () => (modal.value = "suspendidas"),
    F7: () => (modal.value = "movimiento"),
    F8: () => void irACierre(),
    F9: montoLibre,
    F12: cobrar,
  };
  const fn = map[e.key];
  if (fn) {
    e.preventDefault();
    fn();
  }
}

const customerName = computed(() => sale.sale.customer?.name ?? null);
</script>

<template>
  <div class="flex h-screen flex-col bg-bg">
    <TopbarPos />
    <ToolbarPos
      :held-count="sale.suspendedCount"
      :drawer-cash="drawerCash"
      @cliente="modal = 'cliente'"
      @descuento="descuento"
      @suspender="suspender"
      @recuperar="modal = 'suspendidas'"
      @efectivo="modal = 'movimiento'"
      @devolucion="devolucion"
      @cerrar="irACierre"
    />

    <div class="flex min-h-0 flex-1">
      <RailCategorias
        :total="railTotal"
        :departments="railDepts"
        :active="railDept"
        @seleccionar="railDept = $event"
      />
      <CatalogoPos
        :department-id="railDept"
        @cobrar="cobrar"
        @desconocido="onDesconocido"
        @monto-libre="montoLibre"
      />
      <TicketVenta
        :ticket-number="ticketNumber"
        :tipo="tipo"
        :customer-name="customerName"
        :propina-label="null"
        propina-monto="0.00"
        :descuento-monto="sale.totals.discount_total"
        @vaciar="vaciar"
        @set-tipo="setTipo"
        @cliente="modal = 'cliente'"
        @cobrar="cobrar"
      />
    </div>

    <ToastCaja />

    <!-- Modales cobalt -->
    <CobroModal v-if="modal === 'cobro'" @completada="refrescarEfectivo" @cerrar="cobroCerrado" />
    <DescuentoGlobal v-if="modal === 'descuento'" @cerrar="modal = null" />
    <MontoLibre v-if="modal === 'montoLibre'" @agregar="onMontoLibre" @cerrar="modal = null" />

    <!-- Modales reutilizados -->
    <BuscadorCliente v-if="modal === 'cliente'" @seleccionar="setCustomer" @cerrar="modal = null" />
    <MovimientoEfectivo v-if="modal === 'movimiento'" @registrar="registrarMovimiento" @cerrar="modal = null" />
    <VentasSuspendidas v-if="modal === 'suspendidas'" @recuperar="recover" @cerrar="modal = null" />
    <ProductoDesconocido
      v-if="modal === 'desconocido'"
      :code="unknownCode"
      @agregar="addDepartmentLine"
      @cerrar="modal = null"
    />
  </div>
</template>
