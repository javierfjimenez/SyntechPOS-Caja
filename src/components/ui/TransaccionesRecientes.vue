<script setup lang="ts">
import { onMounted, ref } from "vue";

import ModalPro from "@/components/ui/ModalPro.vue";
import { transactionEnvelopes } from "@/db/outbox";
import { formatMoney, formatTime } from "@/lib/format";
import { reprintStamped } from "@/services/reprint";
import { recentTransactions, type TransactionSummary } from "@/services/transactions";
import { canVoidSale } from "@/services/void-sale";
import { useSessionStore } from "@/stores/session";
import { useUiStore } from "@/stores/ui";

/**
 * Transacciones recientes del turno: ver, reimprimir y anular. Reimprimir
 * JAMÁS abre la gaveta. Anular emite arriba (a VentaView) para no anidar
 * modales. ModalBase devuelve el foco al input de escaneo al cerrar.
 */
const emit = defineEmits<{
  cerrar: [];
  anular: [sale: TransactionSummary];
}>();

const session = useSessionStore();
const ui = useUiStore();

const list = ref<TransactionSummary[]>([]);
const highlighted = ref(0);
const reimprimiendo = ref<string | null>(null);

onMounted(async () => {
  if (session.ulid === null) return;
  list.value = recentTransactions(await transactionEnvelopes(), session.ulid);
});

async function pedirAnular(t: TransactionSummary) {
  if (t.kind === "credit_note" || t.voided) return;
  const elegible = await canVoidSale(t.sale_ulid);
  if (!elegible.ok) {
    ui.toast("error", elegible.message ?? "No se puede anular esta venta.");
    return;
  }
  emit("anular", t); // VentaView cierra este modal y abre AnularVenta
}

async function reimprimir(t: TransactionSummary) {
  if (reimprimiendo.value !== null) return;
  reimprimiendo.value = t.sale_ulid;
  try {
    await reprintStamped(t.sale_ulid);
    ui.toast("exito", `Ticket #${t.ticket_number} reimpreso.`);
  } catch (e) {
    ui.toast("error", e instanceof Error ? e.message : String(e));
  } finally {
    reimprimiendo.value = null;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    highlighted.value = Math.min(list.value.length - 1, highlighted.value + 1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    highlighted.value = Math.max(0, highlighted.value - 1);
  } else if (e.key === "Enter" && list.value.length > 0) {
    e.preventDefault();
    void reimprimir(list.value[highlighted.value]!);
  }
}
</script>

<template>
  <ModalPro title="Transacciones del turno" size="lg" @cerrar="emit('cerrar')">
    <div @keydown="onKeydown">
      <ul v-if="list.length > 0" class="max-h-96 divide-y divide-border overflow-y-auto rounded-lg border border-border">
        <li
          v-for="(t, i) in list"
          :key="t.sale_ulid"
          class="flex items-center justify-between px-3 py-2.5"
          :class="[i === highlighted ? 'bg-primary text-white' : 'text-text', t.voided ? 'opacity-60' : '']"
        >
          <span class="flex items-center gap-3">
            <span
              v-if="t.voided"
              class="rounded px-2 py-0.5 text-xs font-semibold bg-danger/20 text-danger"
            >
              ANULADA
            </span>
            <span
              v-else
              class="rounded px-2 py-0.5 text-xs font-semibold"
              :class="t.kind === 'credit_note' ? 'bg-warning/20 text-warning' : 'bg-success/15 text-success'"
            >
              {{ t.kind === "credit_note" ? "Devolución" : "Venta" }}
            </span>
            <span>#{{ t.ticket_number }}</span>
            <span :class="i === highlighted ? 'text-white/80' : 'text-text-dim'">
              {{ formatTime(new Date(t.occurred_at)) }}
            </span>
          </span>
          <span class="flex items-center gap-3">
            <span class="monto font-semibold" :class="t.voided ? 'line-through' : ''">{{ formatMoney(t.total) }}</span>
            <button
              type="button"
              tabindex="-1"
              class="text-sm"
              :class="i === highlighted ? 'text-white/90 hover:text-white' : 'text-primary hover:underline'"
              @click="reimprimir(t)"
            >
              {{ reimprimiendo === t.sale_ulid ? "Imprimiendo…" : "Reimprimir" }}
            </button>
            <button
              v-if="t.kind === 'sale' && !t.voided"
              type="button"
              tabindex="-1"
              class="text-sm"
              :class="i === highlighted ? 'text-white/90 hover:text-white' : 'text-danger hover:underline'"
              @click="pedirAnular(t)"
            >
              Anular
            </button>
          </span>
        </li>
      </ul>
      <p v-else class="py-6 text-center text-[13.5px] text-text-dim">Aún no hay ventas en este turno.</p>
    </div>

    <template #footer>
      <button type="button" tabindex="-1" class="h-[46px] flex-1 rounded-lg border border-border font-bold text-text-dim" @mousedown.prevent @click="emit('cerrar')">Volver (ESC)</button>
    </template>
  </ModalPro>
</template>
