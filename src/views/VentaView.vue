<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";

import BarraEstado from "@/components/ui/BarraEstado.vue";
import BotonAccion from "@/components/ui/BotonAccion.vue";
import BuscadorCliente from "@/components/ui/BuscadorCliente.vue";
import ConfiguracionImpresora from "@/components/ui/ConfiguracionImpresora.vue";
import EditarLinea from "@/components/ui/EditarLinea.vue";
import InputEscaneo from "@/components/ui/InputEscaneo.vue";
import ModalBase from "@/components/ui/ModalBase.vue";
import MovimientoEfectivo from "@/components/ui/MovimientoEfectivo.vue";
import PanelTotal from "@/components/ui/PanelTotal.vue";
import PieAtajos from "@/components/ui/PieAtajos.vue";
import ProductoDesconocido from "@/components/ui/ProductoDesconocido.vue";
import TablaLineasVenta from "@/components/ui/TablaLineasVenta.vue";
import ToastCaja from "@/components/ui/ToastCaja.vue";
import VentasSuspendidas from "@/components/ui/VentasSuspendidas.vue";
import { beep } from "@/lib/beep";
import { formatMoney } from "@/lib/format";
import { findByCode, scaleToLine, productToLine, type ProductRow } from "@/services/product-lookup";
import { parseScaleBarcode } from "@/services/scale-barcode";
import type { SaleCustomer, SaleLine } from "@/services/sale";
import type { UserRow } from "@/services/auth";
import { useCashierStore } from "@/stores/cashier";
import { useOutboxStore } from "@/stores/outbox";
import { useSaleStore } from "@/stores/sale";
import { useSessionStore } from "@/stores/session";
import { useTerminalStore } from "@/stores/terminal";
import { useUiStore } from "@/stores/ui";

/**
 * Pantalla 4 — VENTA (ui-caja §5): la cajera vive aquí. Layout 60/40,
 * el InputEscaneo es el dueño del foco, todo se opera sin mouse.
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
  | "desconocido"
  | "cliente"
  | "suspendidas"
  | "editar"
  | "menu"
  | "confirmarCancelar"
  | "impresora"
  | "movimiento";
const modal = ref<Modal>(null);
const unknownCode = ref("");

onMounted(() => {
  void sale.restore(); // crash/apagón: la venta vuelve intacta
  window.addEventListener("keydown", onFnKeys);
});
onUnmounted(() => window.removeEventListener("keydown", onFnKeys));

// ── Agregar líneas ────────────────────────────────────────────────────────────

async function addProduct(product: ProductRow) {
  await sale.addLine(productToLine(product));
}

async function onCode(code: string) {
  const product = await findByCode(code);
  if (product !== null) {
    await sale.addLine(productToLine(product));
    return;
  }
  beep();
  unknownCode.value = code;
  modal.value = "desconocido";
}

async function onScale(code: string) {
  const parsed = parseScaleBarcode(code, terminal.scaleFormat);
  if (parsed === null) {
    beep();
    unknownCode.value = code;
    modal.value = "desconocido";
    return;
  }
  const product = await findByCode(parsed.productCode);
  if (product === null) {
    beep();
    unknownCode.value = code;
    modal.value = "desconocido";
    return;
  }
  await sale.addLine(scaleToLine(product, parsed));
}

async function addDepartmentLine(line: SaleLine) {
  modal.value = null;
  await sale.addLine(line);
}

// ── Acciones de línea ─────────────────────────────────────────────────────────

async function removeLine() {
  const removed = await sale.removeSelected();
  if (removed === null) return;
  ui.toast("exito", `Se quitó ${removed.description}`, {
    timeoutMs: 5000,
    action: { label: "Deshacer", run: () => void sale.undoRemove() },
  });
}

async function saveLineEdit(
  changes: { quantity: string; discount_amount: string },
  supervisor: UserRow | null,
) {
  modal.value = null;
  await sale.updateLine(sale.selectedIndex, changes);
  if (supervisor !== null) {
    await sale.setSupervisor(supervisor.id);
  }
}

// ── Cliente / suspendidas / cobro ─────────────────────────────────────────────

async function setCustomer(customer: SaleCustomer | null) {
  modal.value = null;
  await sale.setCustomer(customer);
}

async function suspend() {
  if (cashier.current === null) return;
  if (await sale.suspend(cashier.current.id)) {
    ui.toast("exito", "Venta suspendida. Recupérala con F9.");
  } else if (!sale.isEmpty) {
    ui.toast("error", "Máximo 5 ventas suspendidas. Recupera una con F9.");
  }
}

async function recover(id: number) {
  modal.value = null;
  if (!(await sale.recover(id))) {
    ui.toast("error", "Termina o suspende la venta actual antes de recuperar otra.");
  }
}

async function cobrar() {
  if (sale.isEmpty) return;
  await router.push({ name: "cobro" });
}

// ── Menú (F10) ────────────────────────────────────────────────────────────────

async function registrarMovimiento(
  tipo: "withdrawal" | "deposit" | "expense",
  amount: string,
  reason: string,
) {
  if (cashier.current === null) return;
  modal.value = null;
  try {
    await session.addMovement(tipo, amount, reason, cashier.current.id);
    void outbox.drainNow();
    ui.toast("exito", `Movimiento registrado: ${formatMoney(amount)}.`);
  } catch (e) {
    ui.toast("error", e instanceof Error ? e.message : "No se pudo registrar el movimiento.");
  }
}

async function imprimirReporteX() {
  if (cashier.current === null || session.openedAt === null) return;
  modal.value = null;
  try {
    const activity = await session.activity();
    const { expectedAmounts } = await import("@/services/session-report");
    const { printSessionReport } = await import("@/services/session-print");
    await printSessionReport({
      kind: "X",
      zNumber: null,
      cashierName: cashier.current.name,
      openedAt: new Date(session.openedAt),
      openingAmount: session.openingAmount ?? "0.00",
      activity,
      expected: expectedAmounts(session.openingAmount ?? "0.00", activity),
      counted: null,
      note: null,
    });
    ui.toast("exito", "Reporte X enviado a la impresora.");
  } catch (e) {
    ui.toast("error", `Reporte X pendiente de imprimir: ${e instanceof Error ? e.message : e}`);
  }
}

async function irACierre() {
  if (!sale.isEmpty) {
    modal.value = null;
    ui.toast("error", "Termina o suspende la venta en curso antes de cerrar la sesión.");
    return;
  }
  modal.value = null;
  await router.push({ name: "cierre" });
}

async function cancelSale() {
  modal.value = null;
  await sale.clear();
  ui.toast("exito", "Venta cancelada.");
}

async function changeCashier() {
  modal.value = null;
  cashier.logout();
  await router.replace({ name: "login" });
}

// ── Atajos F (funcionan con cualquier foco, sin modal abierto) ────────────────

function onFnKeys(e: KeyboardEvent) {
  if (ui.modalOpen) return;
  switch (e.key) {
    case "F4":
      modal.value = "cliente";
      break;
    case "F6":
      if (sale.selectedIndex >= 0) modal.value = "editar";
      break;
    case "F8":
      void suspend();
      break;
    case "F9":
      modal.value = "suspendidas";
      break;
    case "F10":
      modal.value = "menu";
      break;
    case "F12":
      cobrar();
      break;
    default:
      return;
  }
  e.preventDefault();
}
</script>

<template>
  <div class="flex h-screen flex-col bg-bg">
    <BarraEstado />

    <main class="grid min-h-0 flex-1 grid-cols-[3fr_2fr]">
      <section class="flex min-h-0 flex-col gap-2 p-3">
        <InputEscaneo
          @agregar="addProduct"
          @codigo="onCode"
          @escaneo-balanza="onScale"
          @cobrar="cobrar"
          @quitar-linea="removeLine"
        />
        <TablaLineasVenta
          class="min-h-0 flex-1"
          :lines="sale.sale.lines"
          :selected-index="sale.selectedIndex"
          @seleccionar="sale.selectedIndex = $event"
        />
      </section>

      <PanelTotal
        :totals="sale.totals"
        :customer-name="sale.sale.customer?.name ?? null"
        :suspended-count="sale.suspendedCount"
        :disabled="sale.isEmpty"
        @cobrar="cobrar"
        @cambiar-cliente="modal = 'cliente'"
      />
    </main>

    <PieAtajos
      :atajos="[
        { tecla: 'F2', label: 'Buscar' },
        { tecla: 'F4', label: 'Cliente' },
        { tecla: 'F6', label: 'Cant/Desc línea' },
        { tecla: 'F8', label: 'Suspender' },
        { tecla: 'F12', label: 'COBRAR' },
        { tecla: 'F10', label: 'Menú' },
      ]"
    />

    <ToastCaja />

    <!-- Modales (uno a la vez; ModalBase devuelve el foco al cerrar) -->
    <ProductoDesconocido
      v-if="modal === 'desconocido'"
      :code="unknownCode"
      @agregar="addDepartmentLine"
      @cerrar="modal = null"
    />

    <BuscadorCliente
      v-if="modal === 'cliente'"
      @seleccionar="setCustomer"
      @cerrar="modal = null"
    />

    <VentasSuspendidas
      v-if="modal === 'suspendidas'"
      @recuperar="recover"
      @cerrar="modal = null"
    />

    <EditarLinea
      v-if="modal === 'editar' && sale.sale.lines[sale.selectedIndex]"
      :line="sale.sale.lines[sale.selectedIndex]!"
      @guardar="saveLineEdit"
      @cerrar="modal = null"
    />

    <ModalBase v-if="modal === 'menu'" @cerrar="modal = null">
      <div class="flex w-80 flex-col gap-2">
        <h2 class="mb-2 text-lg font-bold text-text">Menú</h2>
        <BotonAccion variante="secundario" @click="modal = 'movimiento'">
          Retiro / gasto de efectivo
        </BotonAccion>
        <BotonAccion variante="secundario" @click="imprimirReporteX">
          Imprimir reporte X (parcial)
        </BotonAccion>
        <BotonAccion variante="secundario" @click="irACierre">
          Cierre de sesión (arqueo)
        </BotonAccion>
        <BotonAccion variante="secundario" @click="modal = 'impresora'">Impresora</BotonAccion>
        <BotonAccion variante="secundario" @click="changeCashier">
          Bloquear / cambiar cajero
        </BotonAccion>
        <BotonAccion variante="peligro" :disabled="sale.isEmpty" @click="modal = 'confirmarCancelar'">
          Cancelar venta
        </BotonAccion>
        <BotonAccion variante="secundario" @click="modal = null">Seguir vendiendo (ESC)</BotonAccion>
      </div>
    </ModalBase>

    <MovimientoEfectivo
      v-if="modal === 'movimiento'"
      @registrar="registrarMovimiento"
      @cerrar="modal = null"
    />

    <ConfiguracionImpresora v-if="modal === 'impresora'" @cerrar="modal = null" />

    <ModalBase v-if="modal === 'confirmarCancelar'" @cerrar="modal = null">
      <div class="flex w-80 flex-col gap-4">
        <h2 class="text-lg font-bold text-text">¿Cancelar la venta completa?</h2>
        <p class="text-text-dim">
          Se quitarán {{ sale.sale.lines.length }} líneas por
          <span class="monto font-semibold text-text">{{ formatMoney(sale.totals.total) }}</span>.
        </p>
        <div class="flex justify-end gap-2">
          <BotonAccion variante="secundario" @click="modal = null">Seguir vendiendo</BotonAccion>
          <BotonAccion variante="peligro" @click="cancelSale">Cancelar venta</BotonAccion>
        </div>
      </div>
    </ModalBase>
  </div>
</template>
