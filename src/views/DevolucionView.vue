<script setup lang="ts">
import { computed, ref } from "vue";
import { useRouter } from "vue-router";

import BarraEstado from "@/components/ui/BarraEstado.vue";
import BotonAccion from "@/components/ui/BotonAccion.vue";
import PieAtajos from "@/components/ui/PieAtajos.vue";
import PinAutorizacion from "@/components/ui/PinAutorizacion.vue";
import ToastCaja from "@/components/ui/ToastCaja.vue";
import { getMeta } from "@/db";
import { enqueue, nextTicketNumber, saleEnvelopes } from "@/db/outbox";
import { toIsoWithOffset } from "@/lib/datetime";
import { fromMilli, toMilli } from "@/lib/decimal";
import { formatMoney, formatTime } from "@/lib/format";
import { ulid } from "@/lib/ulid";
import { buildEnvelope } from "@/services/event-signing";
import { ecfForSale, printSaleTicket, ticketBusinessData } from "@/services/printer";
import {
  buildCreditNotePayload,
  findSaleByTicket,
  returnableQuantities,
  type OriginalSale,
} from "@/services/refund";
import { computeTotals, lineTotal, type SaleLine } from "@/services/sale";
import type { UserRow } from "@/services/auth";
import { useCashierStore } from "@/stores/cashier";
import { useOutboxStore } from "@/stores/outbox";
import { useSessionStore } from "@/stores/session";
import { useTerminalStore } from "@/stores/terminal";
import { useUiStore } from "@/stores/ui";

/**
 * Pantalla 6 — Devolución (ui-caja §7): busca el ticket PROPIO, selección
 * parcial por línea, PIN supervisor SIEMPRE → NC tipo 34 + reembolso en
 * efectivo. Con e-CF activo, solo contra ventas con comprobante resuelto.
 * Devolución de tickets de OTRA caja: requiere internet (v2).
 */
const router = useRouter();
const cashier = useCashierStore();
const session = useSessionStore();
const outbox = useOutboxStore();
const terminal = useTerminalStore();
const ui = useUiStore();

const MOTIVOS = ["Producto dañado", "Producto equivocado", "Cliente desistió", "Otro"];

const ticketInput = ref("");
const original = ref<OriginalSale | null>(null);
const returnable = ref<string[]>([]);
const selected = ref<boolean[]>([]);
const qty = ref<string[]>([]); // cantidad a devolver por línea (texto)
const motivo = ref(MOTIVOS[0]!);
const error = ref<string | null>(null);
const askingPin = ref(false);
const processing = ref(false);

async function buscar() {
  error.value = null;
  original.value = null;
  const ticket = Number(ticketInput.value.trim());
  if (!Number.isInteger(ticket) || ticket < 1) {
    error.value = "Escribe el número de ticket (ej. 1042).";
    return;
  }
  const envelopes = await saleEnvelopes();
  const sale = findSaleByTicket(envelopes, ticket);
  if (sale === null) {
    error.value = `No se encontró el ticket #${ticket} en esta caja. Los tickets de otras cajas se devuelven con conexión (próximamente).`;
    return;
  }
  // Con facturación electrónica: la NC exige el e-CF original resuelto
  if (terminal.ecfEnabled && (await ecfForSale(sale.sale_ulid)) === null) {
    error.value = "Esta venta aún está procesando su comprobante. Intenta en unos minutos.";
    return;
  }
  original.value = sale;
  returnable.value = returnableQuantities(envelopes, sale);
  selected.value = sale.lines.map(() => false);
  qty.value = returnable.value.map((r) => (r.endsWith(".000") ? r.slice(0, -4) : r));
}

const totalADevolver = computed(() => {
  if (original.value === null) return "0.00";
  const lines: SaleLine[] = [];
  original.value.lines.forEach((line, i) => {
    if (!selected.value[i]) return;
    const q = normalizeQty(qty.value[i] ?? "");
    if (q === null) return;
    lines.push({ ...line, quantity: q, discount_amount: "0.00", is_weighable: false });
  });
  return computeTotals(lines).total;
});

function normalizeQty(text: string): string | null {
  const t = text.trim();
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(t)) return null;
  const [i, d = ""] = t.split(".");
  return `${i}.${d.padEnd(3, "0")}`;
}

function continuar() {
  error.value = null;
  if (!selected.value.some(Boolean)) {
    error.value = "Selecciona al menos una línea a devolver.";
    return;
  }
  for (let i = 0; i < selected.value.length; i++) {
    if (!selected.value[i]) continue;
    const q = normalizeQty(qty.value[i] ?? "");
    if (q === null || toMilli(q) <= 0n) {
      error.value = `Cantidad inválida en ${original.value!.lines[i]!.description}.`;
      return;
    }
    if (toMilli(q) > toMilli(returnable.value[i]!)) {
      error.value = `Máximo devolvible de ${original.value!.lines[i]!.description}: ${fromMilli(toMilli(returnable.value[i]!))}.`;
      return;
    }
  }
  askingPin.value = true;
}

async function autorizada(supervisor: UserRow) {
  askingPin.value = false;
  if (processing.value || original.value === null || cashier.current === null || session.ulid === null) return;
  processing.value = true;
  try {
    const selections = selected.value
      .map((on, lineIndex) => ({ on, lineIndex, quantity: normalizeQty(qty.value[lineIndex] ?? "")! }))
      .filter((s) => s.on)
      .map(({ lineIndex, quantity }) => ({ lineIndex, quantity }));

    const ticketNumber = await nextTicketNumber();
    const payload = buildCreditNotePayload({
      original: original.value,
      selections,
      returnable: returnable.value,
      saleUlid: ulid(),
      ticketNumber,
      cashSessionUlid: session.ulid,
      cashierUserId: cashier.current.id,
      supervisorUserId: supervisor.id,
    });

    const secret = await getMeta("hmac_secret");
    if (secret === null) throw new Error("Terminal sin hmac_secret.");
    const occurredAt = new Date();
    await enqueue(
      await buildEnvelope(secret, {
        ulid: ulid(),
        type: "sale.completed",
        occurred_at: toIsoWithOffset(occurredAt),
        payload,
      }),
    );
    void outbox.drainNow();

    // Ticket de la NC (reembolso en efectivo → abre gaveta)
    const business = await ticketBusinessData();
    const lines = (payload.lines as (SaleLine & { total: string })[]).map((l) => ({ ...l, is_weighable: false }));
    void printSaleTicket(
      {
        business,
        branch_name: business.branch_name,
        terminal_name: business.terminal_name,
        ticket_number: ticketNumber,
        occurred_at: occurredAt,
        cashier_name: cashier.current.name,
        customer_name: null,
        customer_document: null,
        lines,
        totals: payload.totals as never,
        payments: payload.payments as never,
        change: "0.00",
        ecf_enabled: terminal.ecfEnabled,
        ecf: null,
        credit_note: { ref_ticket_number: original.value.ticket_number },
      },
      true,
    ).catch((e: unknown) =>
      ui.toast("error", `Ticket de NC pendiente de imprimir: ${e instanceof Error ? e.message : e}`),
    );

    ui.toast("exito", `Devolución #${ticketNumber} — reembolsa ${formatMoney(totalADevolver.value)} en efectivo.`);
    await router.replace({ name: "venta" });
  } catch (e) {
    error.value = e instanceof Error ? e.message : "No se pudo registrar la devolución.";
    processing.value = false;
  }
}
</script>

<template>
  <div class="flex h-screen flex-col bg-bg">
    <BarraEstado />

    <main class="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-text">Devolución</h1>
        <button type="button" class="text-sm text-text-dim hover:underline" @click="router.replace({ name: 'venta' })">
          ESC volver
        </button>
      </div>

      <div class="flex gap-2">
        <input
          v-model="ticketInput"
          type="text"
          inputmode="numeric"
          placeholder="# de ticket…"
          class="monto h-12 w-64 rounded-lg border border-border bg-surface px-3 text-lg text-text outline-none focus:border-primary"
          @keydown.enter.prevent="buscar"
          @keydown.esc.prevent="router.replace({ name: 'venta' })"
        />
        <BotonAccion variante="secundario" @click="buscar">Buscar</BotonAccion>
      </div>

      <p v-if="error" class="font-medium text-danger">{{ error }}</p>

      <template v-if="original">
        <p class="text-text-dim">
          Venta <span class="font-semibold text-text">#{{ original.ticket_number }}</span> ·
          {{ formatTime(new Date(original.occurred_at)) }} ·
          <span class="monto font-semibold text-text">{{ formatMoney(original.total) }}</span>
        </p>

        <div class="overflow-hidden rounded-lg border border-border">
          <div class="grid grid-cols-[3rem_5rem_1fr_8rem_7rem] gap-2 border-b border-border bg-surface px-3 py-2 text-sm font-semibold text-text-dim">
            <span>SEL</span><span>VENDIDA</span><span>PRODUCTO</span><span>DEVOLVER</span><span class="text-right">MONTO</span>
          </div>
          <div
            v-for="(line, i) in original.lines"
            :key="i"
            class="grid grid-cols-[3rem_5rem_1fr_8rem_7rem] items-center gap-2 px-3 py-2"
            :class="returnable[i] === '0.000' ? 'opacity-40' : ''"
          >
            <input v-model="selected[i]" type="checkbox" :disabled="returnable[i] === '0.000'" class="h-5 w-5 accent-primary" />
            <span class="monto">{{ line.quantity.endsWith(".000") ? line.quantity.slice(0, -4) : line.quantity }}</span>
            <span class="truncate">
              {{ line.description }}
              <span v-if="returnable[i] !== line.quantity" class="text-sm text-warning">(devolvible: {{ returnable[i] }})</span>
            </span>
            <input
              v-model="qty[i]"
              type="text"
              inputmode="decimal"
              :disabled="!selected[i]"
              class="monto h-10 rounded-lg border border-border bg-surface px-2 text-center text-text outline-none focus:border-primary disabled:opacity-40"
            />
            <span class="monto text-right">
              {{ selected[i] && normalizeQty(qty[i] ?? "") ? formatMoney(lineTotal({ ...line, quantity: normalizeQty(qty[i] ?? "")!, is_weighable: false })) : "—" }}
            </span>
          </div>
        </div>

        <div class="flex items-center justify-between">
          <label class="flex items-center gap-2 text-text">
            Motivo:
            <select v-model="motivo" class="h-11 rounded-lg border border-border bg-surface px-3 outline-none focus:border-primary">
              <option v-for="m in MOTIVOS" :key="m">{{ m }}</option>
            </select>
          </label>
          <p class="text-lg">
            Total a devolver: <span class="monto text-2xl font-bold text-text">{{ formatMoney(totalADevolver) }}</span>
          </p>
        </div>

        <BotonAccion grande :disabled="processing" class="self-end" @click="continuar">
          Continuar → PIN de supervisor
        </BotonAccion>
        <p class="self-end text-sm text-text-dim">Genera Nota de crédito tipo 34 + reembolso en efectivo</p>
      </template>
    </main>

    <PieAtajos :atajos="[{ tecla: 'ESC', label: 'Volver' }, { tecla: 'Enter', label: 'Buscar' }]" />
    <ToastCaja />

    <PinAutorizacion
      v-if="askingPin"
      accion="Autorizar devolución"
      :detalle="`Ticket #${original?.ticket_number} — ${formatMoney(totalADevolver)} (${motivo})`"
      @autorizado="autorizada"
      @cancelar="askingPin = false"
    />
  </div>
</template>
