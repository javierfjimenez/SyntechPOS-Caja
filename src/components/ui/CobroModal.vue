<script setup lang="ts">
import { computed, nextTick, ref } from "vue";

import ModalBase from "@/components/ui/ModalBase.vue";
import PinAutorizacion from "@/components/ui/PinAutorizacion.vue";
import { getMeta } from "@/db";
import { enqueue, nextTicketNumber } from "@/db/outbox";
import { toIsoWithOffset } from "@/lib/datetime";
import { fromCents, toCents } from "@/lib/decimal";
import { formatMoney } from "@/lib/format";
import { soundSuccess } from "@/lib/sounds";
import { ulid } from "@/lib/ulid";
import { buildEnvelope } from "@/services/event-signing";
import {
  availableCredit,
  canConfirm,
  changeDue,
  exceedsCredit,
  isCreditSale,
  recomputePayment,
  remaining,
  type MethodCode,
  type PaymentDraft,
} from "@/services/payment";
import { getCustomerById } from "@/services/product-lookup";
import { printSaleTicket, reprintLastTicket, ticketBusinessData } from "@/services/printer";
import { buildSaleCompletedPayload } from "@/services/sale-event";
import type { TicketData } from "@/services/ticket";
import type { UserRow } from "@/services/auth";
import { useCashierStore } from "@/stores/cashier";
import { useOutboxStore } from "@/stores/outbox";
import { useSaleStore } from "@/stores/sale";
import { useSessionStore } from "@/stores/session";
import { useTerminalStore } from "@/stores/terminal";
import { useUiStore } from "@/stores/ui";

/**
 * Cobro como modal (diseño Caja PRO): pago dividido (efectivo/tarjeta/
 * transferencia/crédito), restante/cambio/exacto, confirmar → pantalla de
 * éxito. Porta la lógica real (evento firmado al outbox + impresión).
 */
const emit = defineEmits<{ cerrar: []; completada: [] }>();

const sale = useSaleStore();
const cashier = useCashierStore();
const session = useSessionStore();
const terminal = useTerminalStore();
const outbox = useOutboxStore();
const ui = useUiStore();

/** Línea de efectivo vacía: el input arranca en blanco (placeholder 0.00). */
function efectivoVacio(): PaymentDraft {
  return { method_code: "cash", amount: "0.00", amount_tendered: null, reference: null };
}

// Arranca con una línea de efectivo (el método del 90%): ModalBase enfoca su
// input al abrir, así la cajera teclea el recibido sin borrar nada.
const payments = ref<PaymentDraft[]>([efectivoVacio()]);
const pagoInputs = ref<HTMLInputElement[]>([]);
const confirming = ref(false);

/** Monto a mostrar en el input: vacío si es 0 → aparece el placeholder 0.00. */
function montoInput(p: PaymentDraft): string {
  const v = p.amount_tendered ?? p.amount;
  return toCents(v) === 0n ? "" : Number(v).toFixed(2);
}

async function enfocarPago(i: number) {
  await nextTick();
  const el = pagoInputs.value[i];
  el?.focus();
  el?.select();
}
const pinCredito = ref<{ amount: string; available: string } | null>(null);

// pantalla de éxito
const exito = ref<{ ticket: number; total: string; pagado: string; cambio: string } | null>(null);

const total = computed(() => sale.totals.total);
const falta = computed(() => remaining(total.value, payments.value));
const cambio = computed(() => changeDue(payments.value));
const confirmable = computed(() => canConfirm(total.value, payments.value));

function sumPagos(): string {
  let c = 0n;
  for (const p of payments.value) c += toCents(p.amount);
  return `${c / 100n}.${(c % 100n).toString().padStart(2, "0")}`;
}

const METHODS: { code: MethodCode; label: string }[] = [
  { code: "cash", label: "Efectivo" },
  { code: "card", label: "Tarjeta" },
  { code: "transfer", label: "Transfer." },
  { code: "credit", label: "Crédito" },
];

async function agregarMetodo(code: MethodCode) {
  const restante = falta.value;
  if (toCents(restante) === 0n) return;
  if (code === "credit") {
    await agregarCredito(restante);
    return;
  }
  if (code === "cash") {
    // efectivo: vacío + foco para teclear el recibido directo
    payments.value.push(efectivoVacio());
    await enfocarPago(payments.value.length - 1);
    return;
  }
  // tarjeta/transferencia: pre-rellena el restante (se cobra el monto exacto)
  payments.value.push({ method_code: code, amount: restante, amount_tendered: null, reference: null });
}

async function agregarCredito(monto: string) {
  const customerId = sale.sale.customer?.id;
  if (customerId == null) {
    ui.toast("error", "El crédito requiere un cliente registrado. Selecciónalo con F2.");
    return;
  }
  const customer = await getCustomerById(customerId);
  const available =
    customer?.credit_limit != null ? availableCredit(customer.credit_limit, customer.credit_balance ?? "0.00") : "0.00";
  if (exceedsCredit(monto, available)) {
    pinCredito.value = { amount: monto, available };
    return;
  }
  payments.value.push({ method_code: "credit", amount: monto, amount_tendered: null, reference: null });
}

function pushCreditoAutorizado(supervisor: UserRow) {
  void sale.setSupervisor(supervisor.id);
  payments.value.push({ method_code: "credit", amount: pinCredito.value!.amount, amount_tendered: null, reference: null });
  pinCredito.value = null;
}

function editarPago(i: number, e: Event) {
  const raw = (e.target as HTMLInputElement).value.replace(/[^0-9.]/g, "");
  const p = payments.value[i];
  if (p === undefined) return;
  const typed = raw === "" || Number.isNaN(Number(raw)) ? "0.00" : Number(raw).toFixed(2);
  // lo que falta cubrir SIN esta línea: el aplicado se topa ahí; el efectivo
  // recibido por encima se convierte en vuelta (no infla el monto del evento).
  let otros = 0n;
  payments.value.forEach((q, j) => {
    if (j !== i) otros += toCents(q.amount);
  });
  const needBefore = fromCents(toCents(total.value) - otros);
  payments.value[i] = recomputePayment(p.method_code, typed, needBefore);
}
function quitarPago(i: number) {
  payments.value.splice(i, 1);
}

// ── CONFIRMAR ─────────────────────────────────────────────────────────────────
async function confirmar() {
  if (!confirmable.value || confirming.value || cashier.current === null || session.ulid === null) return;
  confirming.value = true;
  try {
    const secret = await getMeta("hmac_secret");
    if (secret === null) throw new Error("Terminal sin hmac_secret.");

    // descarta líneas intactas en cero (p. ej. el efectivo por defecto si
    // al final se pagó todo con tarjeta)
    const finalPayments = payments.value.filter(
      (p) => toCents(p.amount) > 0n || toCents(p.amount_tendered ?? "0.00") > 0n,
    );

    const ticketNumber = await nextTicketNumber();
    const occurredAt = new Date();
    const payload = buildSaleCompletedPayload({
      sale: sale.sale,
      payments: finalPayments,
      saleUlid: ulid(),
      ticketNumber,
      cashSessionUlid: session.ulid,
      cashierUserId: cashier.current.id,
    });
    await enqueue(
      await buildEnvelope(secret, {
        ulid: ulid(),
        type: "sale.completed",
        occurred_at: toIsoWithOffset(occurredAt),
        payload,
      }),
    );
    void outbox.drainNow();

    const business = await ticketBusinessData();
    const ticket: TicketData = {
      business,
      branch_name: business.branch_name,
      terminal_name: business.terminal_name,
      ticket_number: ticketNumber,
      occurred_at: occurredAt,
      cashier_name: cashier.current.name,
      customer_name: sale.sale.customer?.name ?? null,
      customer_document: sale.sale.customer?.document_number ?? null,
      lines: [...sale.sale.lines],
      totals: sale.totals,
      payments: finalPayments,
      change: cambio.value,
      ecf_enabled: terminal.ecfEnabled,
      ecf: null,
    };
    const hayEfectivo = finalPayments.some((p) => p.method_code === "cash");
    const resumen = { ticket: ticketNumber, total: total.value, pagado: sumPagos(), cambio: cambio.value };

    await sale.clear();
    void printSaleTicket(ticket, hayEfectivo).catch((e: unknown) =>
      ui.toast("error", `Ticket pendiente de imprimir: ${e instanceof Error ? e.message : e}`),
    );
    soundSuccess();
    exito.value = resumen; // pasa a la pantalla de éxito
    emit("completada");
  } catch (e) {
    ui.toast("error", e instanceof Error ? e.message : "No se pudo completar la venta.");
  } finally {
    confirming.value = false;
  }
}

async function reimprimir() {
  try {
    await reprintLastTicket();
    ui.toast("exito", "Ticket reimpreso.");
  } catch (e) {
    ui.toast("error", e instanceof Error ? e.message : String(e));
  }
}

function balCls(): string {
  if (toCents(falta.value) > 0n) return "remaining";
  if (toCents(cambio.value) > 0n) return "change";
  return "exact";
}

void isCreditSale; // disponible para reglas futuras
</script>

<template>
  <ModalBase @cerrar="exito ? emit('cerrar') : emit('cerrar')">
    <div class="-m-6 flex w-[440px] max-w-full flex-col overflow-hidden rounded-xl">
      <!-- Encabezado -->
      <div class="flex flex-none items-center gap-2.5 border-b border-border px-5 py-4">
        <h3 class="flex-1 text-base font-extrabold">{{ exito ? "Venta cobrada" : "Cobrar" }}</h3>
        <button type="button" tabindex="-1" aria-label="Cerrar" class="grid h-[30px] w-[30px] place-items-center rounded-lg text-text-dim hover:bg-zinc-100" @mousedown.prevent @click="emit('cerrar')">
          <svg viewBox="0 0 24 24" fill="currentColor" class="h-[18px] w-[18px]"><path d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z" /></svg>
        </button>
      </div>

      <!-- Cobro -->
      <template v-if="!exito">
        <div class="overflow-y-auto px-5 py-[18px]">
          <div class="mb-3.5 text-center">
            <div class="text-[12.5px] text-text-dim">Total a cobrar</div>
            <div class="monto text-3xl font-bold text-success">{{ formatMoney(total) }}</div>
          </div>

          <div class="mb-3 flex gap-2">
            <button
              v-for="m in METHODS"
              :key="m.code"
              type="button"
              tabindex="-1"
              class="flex flex-1 flex-col items-center gap-1.5 rounded-lg border border-border bg-surface px-1 py-2.5 text-[11px] font-semibold text-text-dim hover:border-primary hover:text-primary"
              @mousedown.prevent
              @click="agregarMetodo(m.code)"
            >
              {{ m.label }}
            </button>
          </div>

          <div
            v-for="(p, i) in payments"
            :key="i"
            class="mb-1.5 flex items-center gap-2.5 rounded-lg border border-border px-3 py-2.5"
          >
            <span class="flex-1 text-[13px] font-semibold">
              {{ { cash: "Efectivo", card: "Tarjeta", transfer: "Transferencia", credit: "Crédito" }[p.method_code] }}
            </span>
            <input
              ref="pagoInputs"
              inputmode="decimal"
              placeholder="0.00"
              class="monto h-[34px] w-[110px] rounded-md border border-border px-2.5 text-right text-[13.5px] font-semibold placeholder:text-faint focus:border-primary focus:outline-none"
              :value="montoInput(p)"
              @change="editarPago(i, $event)"
            />
            <button type="button" tabindex="-1" aria-label="Quitar" class="grid h-[26px] w-[26px] place-items-center rounded-md text-faint hover:bg-danger/10 hover:text-danger" @mousedown.prevent @click="quitarPago(i)">
              <svg viewBox="0 0 24 24" fill="currentColor" class="h-[15px] w-[15px]"><path d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z" /></svg>
            </button>
          </div>

          <div class="mt-2.5 flex items-center justify-between rounded-lg px-3 py-3 font-bold balrow" :class="balCls()">
            <span>{{ toCents(falta) > 0n ? "Restante" : toCents(cambio) > 0n ? "Cambio" : "Pago exacto" }}</span>
            <span class="monto text-lg">{{ toCents(falta) > 0n ? formatMoney(falta) : toCents(cambio) > 0n ? formatMoney(cambio) : "✓" }}</span>
          </div>
        </div>

        <div class="flex flex-none gap-2.5 px-5 pb-[18px]">
          <button type="button" tabindex="-1" class="h-[46px] flex-1 rounded-lg border border-border font-bold text-text-dim" @mousedown.prevent @click="emit('cerrar')">Cancelar</button>
          <button
            type="button"
            tabindex="-1"
            class="flex h-[46px] flex-1 items-center justify-center gap-2 rounded-lg bg-success font-bold text-white disabled:opacity-50"
            :disabled="!confirmable || confirming"
            @mousedown.prevent
            @click="confirmar"
          >
            <svg viewBox="0 0 24 24" fill="#fff" class="h-[18px] w-[18px]"><path fill-rule="evenodd" d="M19.916 4.626a.75.75 0 0 1 .208 1.04l-9 13.5a.75.75 0 0 1-1.154.114l-6-6a.75.75 0 0 1 1.06-1.06l5.353 5.353 8.493-12.74a.75.75 0 0 1 1.04-.207Z" clip-rule="evenodd" /></svg>
            Confirmar cobro
          </button>
        </div>
      </template>

      <!-- Éxito -->
      <template v-else>
        <div class="overflow-y-auto px-5 py-[18px]">
          <div class="px-1.5 pt-2.5 pb-0.5 text-center">
            <div class="mx-auto mb-3.5 grid h-[66px] w-[66px] place-items-center rounded-full bg-success/10 text-success">
              <svg viewBox="0 0 24 24" fill="currentColor" class="h-[38px] w-[38px]"><path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clip-rule="evenodd" /></svg>
            </div>
            <h3 class="text-[19px] font-extrabold">Venta cobrada</h3>
            <div class="mt-0.5 text-[13px] text-text-dim">
              {{ terminal.ecfEnabled ? "El comprobante e-CF se emitirá y enviará a DGII" : "Venta registrada" }}
            </div>
          </div>
          <div class="mt-4 overflow-hidden rounded-lg border border-border">
            <div class="flex justify-between border-b border-border px-3.5 py-2.5 text-[13px]"><span class="text-text-dim">Ticket</span><span class="monto font-semibold">#{{ exito.ticket }}</span></div>
            <div class="flex justify-between border-b border-border px-3.5 py-2.5 text-[13px]"><span class="text-text-dim">Total</span><span class="monto font-semibold">{{ formatMoney(exito.total) }}</span></div>
            <div class="flex justify-between border-b border-border px-3.5 py-2.5 text-[13px]"><span class="text-text-dim">Pagado</span><span class="monto font-semibold">{{ formatMoney(exito.pagado) }}</span></div>
            <div class="flex justify-between px-3.5 py-2.5 text-[13px]"><span class="text-text-dim">Cambio</span><span class="monto font-semibold text-primary">{{ formatMoney(exito.cambio) }}</span></div>
          </div>
        </div>
        <div class="flex flex-none gap-2.5 px-5 pb-[18px]">
          <button type="button" tabindex="-1" class="h-[46px] flex-1 rounded-lg border border-border font-bold text-text-dim" @mousedown.prevent @click="reimprimir">Imprimir</button>
          <button type="button" tabindex="-1" class="h-[46px] flex-1 rounded-lg bg-primary font-bold text-white" @mousedown.prevent @click="emit('cerrar')">Nueva venta</button>
        </div>
      </template>
    </div>
  </ModalBase>

  <PinAutorizacion
    v-if="pinCredito"
    accion="Crédito sobre el límite"
    :detalle="`Disponible: ${formatMoney(pinCredito.available)} · Esta venta: ${formatMoney(pinCredito.amount)}`"
    @autorizado="pushCreditoAutorizado"
    @cancelar="pinCredito = null"
  />
</template>

<style scoped>
.balrow.remaining {
  background: color-mix(in srgb, var(--color-warning) 10%, transparent);
  color: var(--color-warning);
}
.balrow.change {
  background: color-mix(in srgb, var(--color-primary) 6%, transparent);
  color: var(--color-primary);
}
.balrow.exact {
  background: color-mix(in srgb, var(--color-success) 10%, transparent);
  color: var(--color-success);
}
</style>
