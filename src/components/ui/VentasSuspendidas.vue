<script setup lang="ts">
import { onMounted, ref } from "vue";

import ModalPro from "@/components/ui/ModalPro.vue";
import { formatMoney, formatTime } from "@/lib/format";
import { useSaleStore, type SuspendedSummary } from "@/stores/sale";

/**
 * VentasSuspendidas (F9 — ui-caja §9.4): hora, items, total → Enter/click
 * recupera. Sobreviven reinicio (SQLite). Máximo 5.
 */
const emit = defineEmits<{
  recuperar: [id: number];
  cerrar: [];
}>();

const sale = useSaleStore();
const list = ref<SuspendedSummary[]>([]);
const highlighted = ref(0);

onMounted(async () => {
  list.value = await sale.listSuspended();
});

function onKeydown(e: KeyboardEvent) {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    highlighted.value = Math.min(list.value.length - 1, highlighted.value + 1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    highlighted.value = Math.max(0, highlighted.value - 1);
  } else if (e.key === "Enter" && list.value.length > 0) {
    e.preventDefault();
    emit("recuperar", list.value[highlighted.value]!.id);
  }
}
</script>

<template>
  <ModalPro title="Ventas en espera" @cerrar="emit('cerrar')">
    <div @keydown="onKeydown">
      <ul v-if="list.length > 0" class="divide-y divide-border overflow-hidden rounded-lg border border-border">
        <li
          v-for="(s, i) in list"
          :key="s.id"
          class="flex cursor-pointer items-center justify-between px-3 py-2.5"
          :class="i === highlighted ? 'bg-primary text-white' : 'text-text hover:bg-zinc-100'"
          @click="emit('recuperar', s.id)"
        >
          <span class="text-[13px]">
            {{ formatTime(new Date(s.suspended_at)) }} ·
            {{ s.lines }} {{ s.lines === 1 ? "línea" : "líneas" }}
          </span>
          <span class="monto font-semibold">{{ formatMoney(s.total) }}</span>
        </li>
      </ul>
      <p v-else class="py-6 text-center text-[13.5px] text-text-dim">
        No hay ventas en espera. Pon la actual con F5.
      </p>
    </div>

    <template #footer>
      <button type="button" tabindex="-1" class="h-[46px] flex-1 rounded-lg border border-border font-bold text-text-dim" @mousedown.prevent @click="emit('cerrar')">Volver (ESC)</button>
    </template>
  </ModalPro>
</template>
