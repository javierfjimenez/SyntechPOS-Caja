<script setup lang="ts">
import { onMounted, ref } from "vue";

import BotonAccion from "@/components/ui/BotonAccion.vue";
import ModalBase from "@/components/ui/ModalBase.vue";
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
  <ModalBase @cerrar="emit('cerrar')">
    <div class="flex w-[26rem] flex-col gap-4" @keydown="onKeydown">
      <h2 class="text-xl font-bold text-text">Ventas suspendidas</h2>

      <ul v-if="list.length > 0" class="divide-y divide-border overflow-hidden rounded-lg border border-border">
        <li
          v-for="(s, i) in list"
          :key="s.id"
          class="flex cursor-pointer items-center justify-between px-3 py-2.5"
          :class="i === highlighted ? 'bg-primary text-white' : 'hover:bg-bg text-text'"
          @click="emit('recuperar', s.id)"
        >
          <span>
            {{ formatTime(new Date(s.suspended_at)) }} ·
            {{ s.lines }} {{ s.lines === 1 ? "línea" : "líneas" }}
          </span>
          <span class="monto font-semibold">{{ formatMoney(s.total) }}</span>
        </li>
      </ul>
      <p v-else class="py-6 text-center text-text-dim">
        No hay ventas suspendidas. Suspende la actual con F8.
      </p>

      <div class="flex justify-end">
        <BotonAccion variante="secundario" @click="emit('cerrar')">Volver (ESC)</BotonAccion>
      </div>
    </div>
  </ModalBase>
</template>
