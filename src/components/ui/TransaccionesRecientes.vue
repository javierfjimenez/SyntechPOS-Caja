<script setup lang="ts">
import { onMounted, ref } from "vue";

import BotonAccion from "@/components/ui/BotonAccion.vue";
import ModalBase from "@/components/ui/ModalBase.vue";
import { saleEnvelopes } from "@/db/outbox";
import { formatMoney, formatTime } from "@/lib/format";
import { reprintStamped } from "@/services/reprint";
import { recentTransactions, type TransactionSummary } from "@/services/transactions";
import { useSessionStore } from "@/stores/session";
import { useUiStore } from "@/stores/ui";

/**
 * Transacciones recientes del turno: ver y reimprimir (timbrado si ya tiene
 * e-CF). Reimprimir JAMÁS abre la gaveta (reprintStamped). ModalBase devuelve
 * el foco al input de escaneo al cerrar.
 */
const emit = defineEmits<{ cerrar: [] }>();

const session = useSessionStore();
const ui = useUiStore();

const list = ref<TransactionSummary[]>([]);
const highlighted = ref(0);
const reimprimiendo = ref<string | null>(null);

onMounted(async () => {
  if (session.ulid === null) return;
  list.value = recentTransactions(await saleEnvelopes(), session.ulid);
});

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
  <ModalBase @cerrar="emit('cerrar')">
    <div class="flex w-[30rem] flex-col gap-4" @keydown="onKeydown">
      <h2 class="text-xl font-bold text-text">Transacciones del turno</h2>

      <ul v-if="list.length > 0" class="max-h-96 divide-y divide-border overflow-y-auto rounded-lg border border-border">
        <li
          v-for="(t, i) in list"
          :key="t.sale_ulid"
          class="flex cursor-pointer items-center justify-between px-3 py-2.5"
          :class="i === highlighted ? 'bg-primary text-white' : 'hover:bg-bg text-text'"
          @click="reimprimir(t)"
        >
          <span class="flex items-center gap-3">
            <span
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
            <span class="monto font-semibold">{{ formatMoney(t.total) }}</span>
            <span class="text-sm" :class="i === highlighted ? 'text-white/80' : 'text-primary'">
              {{ reimprimiendo === t.sale_ulid ? "Imprimiendo…" : "Reimprimir" }}
            </span>
          </span>
        </li>
      </ul>
      <p v-else class="py-6 text-center text-text-dim">Aún no hay ventas en este turno.</p>

      <div class="flex justify-end">
        <BotonAccion variante="secundario" @click="emit('cerrar')">Volver (ESC)</BotonAccion>
      </div>
    </div>
  </ModalBase>
</template>
