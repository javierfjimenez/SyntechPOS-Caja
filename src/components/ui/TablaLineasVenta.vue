<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

import { formatMoney } from "@/lib/format";
import { lineTotal, totalItems, type SaleLine } from "@/services/sale";

/**
 * Las líneas de la venta (ui-caja §5/§11): la seleccionada lleva ▸ y queda
 * visible (auto-scroll). Montos en mono alineados a la derecha (DISENO §4).
 */
const props = defineProps<{
  lines: SaleLine[];
  selectedIndex: number;
}>();

const emit = defineEmits<{ seleccionar: [index: number] }>();

const body = ref<HTMLElement | null>(null);

watch(
  () => props.selectedIndex,
  async () => {
    await nextTick();
    body.value
      ?.querySelector(`[data-line="${props.selectedIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  },
);

/** "2.000" → "2" · "0.345" → "0.345" (los pesables conservan decimales) */
function qty(line: SaleLine): string {
  return line.quantity.endsWith(".000") ? line.quantity.slice(0, -4) : line.quantity;
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div
      class="grid grid-cols-[5rem_1fr_7rem_7rem] gap-2 border-b border-border px-3 py-2 text-sm font-semibold text-text-dim select-none"
    >
      <span>CANT</span>
      <span>PRODUCTO</span>
      <span class="text-right">PRECIO</span>
      <span class="text-right">TOTAL</span>
    </div>

    <div ref="body" class="flex-1 overflow-y-auto">
      <div
        v-for="(line, i) in lines"
        :key="i"
        :data-line="i"
        class="grid cursor-pointer grid-cols-[5rem_1fr_7rem_7rem] gap-2 px-3 py-2 text-[17px]"
        :class="i === selectedIndex ? 'bg-primary/10 font-medium' : 'hover:bg-bg'"
        @click="emit('seleccionar', i)"
      >
        <span class="monto">
          <span v-if="i === selectedIndex" aria-hidden="true">▸</span>{{ qty(line) }}
        </span>
        <span class="truncate">
          {{ line.description }}
          <span v-if="line.discount_amount !== '0.00'" class="text-sm text-warning">
            (desc. {{ formatMoney(line.discount_amount) }})
          </span>
        </span>
        <span class="monto text-right">{{ formatMoney(line.unit_price) }}</span>
        <span class="monto text-right">{{ formatMoney(lineTotal(line)) }}</span>
      </div>

      <p v-if="lines.length === 0" class="px-3 py-10 text-center text-text-dim">
        Escanea el primer producto para empezar
      </p>
    </div>

    <div class="border-t border-border px-3 py-2 text-sm text-text-dim select-none">
      {{ lines.length }} {{ lines.length === 1 ? "línea" : "líneas" }} ·
      {{ totalItems(lines) }} items
    </div>
  </div>
</template>
