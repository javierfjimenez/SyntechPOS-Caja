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

const emit = defineEmits<{
  seleccionar: [index: number];
  incrementar: [index: number];
  decrementar: [index: number];
}>();

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
      class="grid grid-cols-[7.5rem_1fr_7rem_7rem] gap-2 border-b border-border px-3 py-2 text-sm font-semibold text-text-dim select-none"
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
        class="grid cursor-pointer grid-cols-[7.5rem_1fr_7rem_7rem] items-center gap-2 px-3 py-2 text-[17px]"
        :class="i === selectedIndex ? 'bg-primary/10 font-medium' : 'hover:bg-bg'"
        @click="emit('seleccionar', i)"
      >
        <span class="flex items-center gap-1">
          <template v-if="!line.is_weighable">
            <button
              type="button"
              tabindex="-1"
              aria-label="Quitar uno"
              class="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface text-lg leading-none text-text-dim hover:bg-bg"
              @click.stop="emit('decrementar', i)"
            >
              −
            </button>
            <span class="monto w-7 text-center">{{ qty(line) }}</span>
            <button
              type="button"
              tabindex="-1"
              aria-label="Agregar uno"
              class="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface text-lg leading-none text-primary hover:bg-bg"
              @click.stop="emit('incrementar', i)"
            >
              +
            </button>
          </template>
          <span v-else class="monto">
            <span v-if="i === selectedIndex" aria-hidden="true">▸</span>{{ qty(line) }}
          </span>
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
