<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";

import BarraEstado from "@/components/ui/BarraEstado.vue";
import BotonAccion from "@/components/ui/BotonAccion.vue";
import BuscadorCliente from "@/components/ui/BuscadorCliente.vue";
import PieAtajos from "@/components/ui/PieAtajos.vue";
import PinAutorizacion from "@/components/ui/PinAutorizacion.vue";
import ToastCaja from "@/components/ui/ToastCaja.vue";
import { getMeta } from "@/db";
import { enqueue, nextTicketNumber } from "@/db/outbox";
import { toIsoWithOffset } from "@/lib/datetime";
import { fromCents, toCents } from "@/lib/decimal";
import { formatMoney } from "@/lib/format";
import { ulid } from "@/lib/ulid";
import { buildEnvelope } from "@/services/event-signing";
import {
  availableCredit,
  canConfirm,
  cashPayment,
  changeDue,
  exceedsCredit,
  METHOD_LABELS,
  remaining,
  type MethodCode,
  type PaymentDraft,
} from "@/services/payment";
import { getCustomerById } from "@/services/product-lookup";
import { buildSaleCompletedPayload } from "@/services/sale-event";
import type { SaleCustomer } from "@/services/sale";
import type { UserRow } from "@/services/auth";
import { useCashierStore } from "@/stores/cashier";
import { useOutboxStore } from "@/stores/outbox";
import { useSaleStore } from "@/stores/sale";
import { useSessionStore } from "@/stores/session";
import { useUiStore } from "@/stores/ui";

/**
 * Pantalla 5 — COBRO (ui-caja §6). Al entrar: EXACTO preseleccionado → la
 * venta con pago justo se confirma con F12, Enter = 2 pulsaciones.
 * CONFIRMAR = evento sale.completed FIRMADO al outbox + venta limpia.
 * (Impresión y gaveta llegan en 4.5.)
 */
const router = useRouter();
const sale = useSaleStore();
const cashier = useCashierStore();
const session = useSessionStore();
const outbox = useOutboxStore();
const ui = useUiStore();

const payments = ref<PaymentDraft[]>([]);
const confirming = ref(false);

// Monto en edición (modelo "dígitos = centavos"); null = EXACTO preseleccionado
const typed = ref<string | null>(null);
const method = ref<MethodCode>("cash");
const reference = ref("");
const refInput = ref<HTMLInputElement | null>(null);

const modal = ref<null | "cliente" | "pinCredito">(null);
const creditOverdraft = ref<{ amount: string; available: string } | null>(null);

const total = computed(() => sale.totals.total);
const falta = computed(() => remaining(total.value, payments.value));
const cambio = computed(() => changeDue(payments.value));
const confirmable = computed(() => canConfirm(total.value, payments.value));

/** El monto activo: lo tecleado, o EXACTO (lo que falta) si no se ha tocado */
const amount = computed(() => {
  if (typed.value === null) return falta.value;
  const padded = typed.value.padStart(3, "0");
  return `${BigInt(padded.slice(0, -2))}.${padded.slice(-2)}`;
});

onMounted(() => {
  if (sale.isEmpty) {
    void router.replace({ name: "venta" });
    return;
  }
  window.addEventListener("keydown", onKeydown);
});
onUnmounted(() => window.removeEventListener("keydown", onKeydown));

// ── Edición del monto ─────────────────────────────────────────────────────────

function digito(d: string) {
  typed.value = (typed.value ?? "") + d;
  if (typed.value.length > 10) typed.value = typed.value.slice(0, 10);
}

function sumar(billete: string) {
  typed.value = (toCents(amount.value) + toCents(billete)).toString();
}

function exacto() {
  typed.value = null;
}

function setMethod(m: MethodCode) {
  if (m === "credit") {
    void prepararCredito();
    return;
  }
  method.value = m;
  typed.value = null;
  reference.value = "";
}

// ── Agregar pagos ─────────────────────────────────────────────────────────────

async function agregarPago() {
  if (confirming.value || toCents(amount.value) === 0n) return;

  if (method.value === "cash") {
    payments.value.push(cashPayment(falta.value, amount.value));
  } else if (method.value === "credit") {
    await agregarCredito(amount.value);
    return;
  } else {
    const applied = toCents(amount.value) > toCents(falta.value) ? falta.value : amount.value;
    payments.value.push({
      method_code: method.value,
      amount: applied,
      amount_tendered: null,
      reference: reference.value.trim() || null,
    });
  }

  typed.value = null;
  method.value = "cash";
  reference.value = "";
  if (confirmable.value) await confirmar();
}

function quitarPago(index: number) {
  payments.value.splice(index, 1);
  typed.value = null;
}

// ── Crédito (F7, M9b) ─────────────────────────────────────────────────────────

async function prepararCredito() {
  if (sale.sale.customer === null || sale.sale.customer.id === null) {
    // crédito exige cliente REGISTRADO (no inline): primero F4
    modal.value = "cliente";
    return;
  }
  method.value = "credit";
  typed.value = null;
  reference.value = "";
}

async function agregarCredito(monto: string) {
  const customerId = sale.sale.customer?.id;
  if (customerId == null) return;

  const customer = await getCustomerById(customerId);
  const available =
    customer?.credit_limit != null
      ? availableCredit(customer.credit_limit, customer.credit_balance ?? "0.00")
      : "0.00";

  const applied = toCents(monto) > toCents(falta.value) ? falta.value : monto;

  if (exceedsCredit(applied, available)) {
    creditOverdraft.value = { amount: applied, available };
    modal.value = "pinCredito";
    return;
  }
  pushCredit(applied);
}

function pushCredit(monto: string) {
  payments.value.push({ method_code: "credit", amount: monto, amount_tendered: null, reference: null });
  typed.value = null;
  method.value = "cash";
  if (confirmable.value) void confirmar();
}

async function creditoAutorizado(supervisor: UserRow) {
  modal.value = null;
  await sale.setSupervisor(supervisor.id);
  pushCredit(creditOverdraft.value!.amount);
  creditOverdraft.value = null;
}

async function clienteSeleccionado(customer: SaleCustomer | null) {
  modal.value = null;
  await sale.setCustomer(customer);
  if (customer !== null && customer.id !== null) {
    await prepararCredito();
  } else if (customer !== null) {
    ui.toast("error", "El crédito requiere un cliente registrado con límite aprobado.");
  }
}

// ── CONFIRMAR: el evento firmado al outbox ────────────────────────────────────

async function confirmar() {
  if (!confirmable.value || confirming.value) return;
  if (cashier.current === null || session.ulid === null) return;
  confirming.value = true;

  try {
    const secret = await getMeta("hmac_secret");
    if (secret === null) throw new Error("Terminal sin hmac_secret.");

    const ticketNumber = await nextTicketNumber();
    const payload = buildSaleCompletedPayload({
      sale: sale.sale,
      payments: payments.value,
      saleUlid: ulid(),
      ticketNumber,
      cashSessionUlid: session.ulid,
      cashierUserId: cashier.current.id,
    });

    const envelope = await buildEnvelope(secret, {
      ulid: ulid(),
      type: "sale.completed",
      occurred_at: toIsoWithOffset(new Date()),
      payload,
    });
    await enqueue(envelope);
    await outbox.refresh();

    const vuelto = cambio.value;
    await sale.clear();
    // Impresión del ticket + gaveta: tarea 4.5
    ui.toast(
      "exito",
      vuelto !== "0.00"
        ? `Venta #${ticketNumber} completada — cambio ${formatMoney(vuelto)}`
        : `Venta #${ticketNumber} completada`,
    );
    await router.replace({ name: "venta" });
  } catch (e) {
    ui.toast("error", e instanceof Error ? e.message : "No se pudo completar la venta.");
  } finally {
    confirming.value = false;
  }
}

// ── Teclado ───────────────────────────────────────────────────────────────────

function onKeydown(e: KeyboardEvent) {
  if (ui.modalOpen) return;
  // la referencia de tarjeta/transferencia escribe normal
  if (document.activeElement === refInput.value && e.key.length === 1) return;

  if (/^[0-9]$/.test(e.key)) {
    digito(e.key);
  } else if (e.key === "Backspace") {
    typed.value = (typed.value ?? "").slice(0, -1) || null;
  } else if (e.key === "Enter") {
    if (confirmable.value) {
      void confirmar();
    } else {
      void agregarPago();
    }
  } else if (e.key === "Escape") {
    void router.replace({ name: "venta" });
  } else if (e.key === "F1") {
    setMethod("cash");
  } else if (e.key === "F3") {
    setMethod("card");
  } else if (e.key === "F5") {
    setMethod("transfer");
  } else if (e.key === "F7") {
    setMethod("credit");
  } else {
    return;
  }
  e.preventDefault();
}

const faltaCents = computed(() => toCents(falta.value));
const cambioEnVivo = computed(() => {
  // cambio proyectado mientras teclea (efectivo): entregado − falta
  if (method.value !== "cash") return "0.00";
  const diff = toCents(amount.value) - faltaCents.value;
  return diff > 0n ? fromCents(diff) : "0.00";
});
</script>

<template>
  <div class="flex h-screen flex-col bg-bg">
    <BarraEstado />

    <main class="grid min-h-0 flex-1 grid-cols-2">
      <!-- Izquierda: total + resumen + pagos agregados -->
      <section class="flex flex-col gap-4 border-r border-border p-6">
        <div>
          <p class="text-sm font-semibold text-text-dim">TOTAL A COBRAR</p>
          <p class="monto text-5xl font-bold text-text">{{ formatMoney(total) }}</p>
        </div>

        <div class="text-[15px] text-text-dim">
          <p>{{ sale.sale.lines.length }} líneas · {{ sale.itemCount }} items</p>
          <p>Cliente: {{ sale.sale.customer?.name ?? "Consumidor final" }}</p>
        </div>

        <div v-if="payments.length > 0" class="flex flex-col gap-1.5">
          <p class="text-sm font-semibold text-text-dim">Pagos agregados</p>
          <div
            v-for="(p, i) in payments"
            :key="i"
            class="flex items-center justify-between rounded-lg border border-border bg-surface px-3 py-2"
          >
            <span>
              {{ METHOD_LABELS[p.method_code] }}
              <span v-if="p.reference" class="text-sm text-text-dim">ref. {{ p.reference }}</span>
            </span>
            <span class="flex items-center gap-3">
              <span class="monto font-semibold">{{ formatMoney(p.amount) }}</span>
              <button
                type="button"
                tabindex="-1"
                aria-label="Quitar pago"
                class="text-lg text-text-dim hover:text-danger"
                @click="quitarPago(i)"
              >
                ✕
              </button>
            </span>
          </div>
        </div>

        <p class="mt-auto text-lg">
          Falta:
          <span class="monto font-bold" :class="falta === '0.00' ? 'text-success' : 'text-text'">
            {{ formatMoney(falta) }}
          </span>
        </p>
      </section>

      <!-- Derecha: método activo + cambio + confirmar -->
      <section class="flex flex-col gap-4 p-6">
        <div>
          <p class="text-sm font-semibold text-text-dim">
            {{ METHOD_LABELS[method] }} {{ method === "cash" ? "recibido" : "" }}
          </p>
          <div
            class="monto flex h-16 items-center rounded-lg border-2 px-4 text-3xl font-bold"
            :class="typed === null ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-surface text-text'"
            :title="typed === null ? 'EXACTO preseleccionado: teclear reemplaza' : ''"
          >
            {{ formatMoney(amount) }}
            <span v-if="typed === null" class="ml-auto text-sm font-semibold">EXACTO</span>
          </div>
        </div>

        <div v-if="method === 'cash'" class="flex flex-wrap gap-2">
          <BotonAccion variante="secundario" @click="exacto">EXACTO</BotonAccion>
          <BotonAccion v-for="b in ['100', '200', '500', '1000']" :key="b" variante="secundario" @click="sumar(b)">
            +{{ b }}
          </BotonAccion>
        </div>

        <label v-else class="flex flex-col gap-1 text-sm font-medium text-text-dim">
          Referencia (opcional)
          <input
            ref="refInput"
            v-model="reference"
            type="text"
            class="monto h-12 rounded-lg border border-border bg-surface px-3 text-base text-text outline-none focus:border-primary"
          />
        </label>

        <div>
          <p class="text-sm font-semibold text-text-dim">CAMBIO</p>
          <p class="monto text-4xl font-bold text-success">{{ formatMoney(cambioEnVivo) }}</p>
        </div>

        <div class="flex flex-wrap gap-2">
          <BotonAccion variante="secundario" @click="setMethod('cash')">F1 Efectivo</BotonAccion>
          <BotonAccion variante="secundario" @click="setMethod('card')">F3 Tarjeta</BotonAccion>
          <BotonAccion variante="secundario" @click="setMethod('transfer')">F5 Transf.</BotonAccion>
          <BotonAccion variante="secundario" @click="setMethod('credit')">F7 Crédito</BotonAccion>
        </div>

        <div class="mt-auto flex flex-col gap-2">
          <BotonAccion v-if="!confirmable" grande :disabled="confirming" @click="agregarPago">
            Agregar pago
          </BotonAccion>
          <BotonAccion grande :disabled="!confirmable || confirming" @click="confirmar">
            CONFIRMAR — imprime y abre gaveta (Enter)
          </BotonAccion>
        </div>
      </section>
    </main>

    <PieAtajos
      :atajos="[
        { tecla: 'Enter', label: 'Confirmar' },
        { tecla: 'ESC', label: 'Volver a la venta' },
        { tecla: 'F1/F3/F5/F7', label: 'Método de pago' },
      ]"
    />

    <ToastCaja />

    <BuscadorCliente v-if="modal === 'cliente'" @seleccionar="clienteSeleccionado" @cerrar="modal = null" />

    <PinAutorizacion
      v-if="modal === 'pinCredito' && creditOverdraft"
      accion="Crédito sobre el límite"
      :detalle="`Límite disponible: ${formatMoney(creditOverdraft.available)} · Esta venta: ${formatMoney(creditOverdraft.amount)}`"
      @autorizado="creditoAutorizado"
      @cancelar="modal = null; creditOverdraft = null"
    />
  </div>
</template>
