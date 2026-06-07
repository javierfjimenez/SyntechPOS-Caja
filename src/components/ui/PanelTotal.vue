<script setup lang="ts">
import { computed } from "vue";

import BotonAccion from "@/components/ui/BotonAccion.vue";
import { formatMoney } from "@/lib/format";
import { subtotal, type SaleTotals } from "@/services/sale";

/**
 * Panel derecho de la venta (ui-caja §5): subtotal, ITBIS por tasa,
 * descuento y el TOTAL en 60px — legible a 1 metro (DISENO §1).
 */
const props = defineProps<{
  totals: SaleTotals;
  customerName: string | null;
  suspendedCount: number;
  disabled: boolean;
}>();

const emit = defineEmits<{ cobrar: []; cambiarCliente: [] }>();

const sub = computed(() => subtotal(props.totals));
</script>

<template>
  <aside class="flex h-full flex-col gap-3 border-l border-border bg-surface p-4">
    <div class="flex items-center justify-between text-[15px]">
      <span class="text-text-dim">Cliente:</span>
      <button
        type="button"
        tabindex="-1"
        class="font-medium text-primary hover:underline"
        @click="emit('cambiarCliente')"
      >
        {{ customerName ?? "Consumidor final" }} <span class="text-text-dim">[F4]</span>
      </button>
    </div>

    <dl class="space-y-1.5 border-t border-border pt-3 text-[15px]">
      <div class="flex justify-between">
        <dt class="text-text-dim">Subtotal</dt>
        <dd class="monto">{{ formatMoney(sub) }}</dd>
      </div>
      <div class="flex justify-between">
        <dt class="text-text-dim">ITBIS 18%</dt>
        <dd class="monto">{{ formatMoney(totals.taxed18_itbis) }}</dd>
      </div>
      <div v-if="totals.taxed16_itbis !== '0.00'" class="flex justify-between">
        <dt class="text-text-dim">ITBIS 16%</dt>
        <dd class="monto">{{ formatMoney(totals.taxed16_itbis) }}</dd>
      </div>
      <div class="flex justify-between">
        <dt class="text-text-dim">Descuento</dt>
        <dd class="monto">{{ formatMoney(totals.discount_total) }}</dd>
      </div>
    </dl>

    <div class="mt-auto border-t border-border pt-3">
      <p class="text-sm font-semibold text-text-dim">TOTAL</p>
      <p class="monto text-[56px] leading-tight font-bold text-text">
        {{ formatMoney(totals.total) }}
      </p>
    </div>

    <BotonAccion grande :disabled="disabled" @click="emit('cobrar')">
      COBRAR <span class="font-normal opacity-75">(F12)</span>
    </BotonAccion>

    <p class="text-center text-sm text-text-dim select-none">
      Suspender F8
      <template v-if="suspendedCount > 0">
        · <span class="font-medium text-warning">{{ suspendedCount }} suspendida{{ suspendedCount > 1 ? "s" : "" }}</span> F9
      </template>
      <template v-else>· Recuperar F9</template>
    </p>
  </aside>
</template>
