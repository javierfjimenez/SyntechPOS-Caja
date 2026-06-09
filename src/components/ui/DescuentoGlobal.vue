<script setup lang="ts">
import { computed, ref } from "vue";

import ModalPro from "@/components/ui/ModalPro.vue";
import PinAutorizacion from "@/components/ui/PinAutorizacion.vue";
import type { UserRow } from "@/services/auth";
import { useSaleStore } from "@/stores/sale";
import { useTerminalStore } from "@/stores/terminal";
import { useUiStore } from "@/stores/ui";

/**
 * Descuento global (diseño Caja PRO): % o monto, botones rápidos. Se reparte
 * a las líneas (store.applyGlobalDiscount) → totales y evento correctos. Si el
 * % supera settings.max_discount_percent → PIN de supervisor (regla fiscal).
 */
const emit = defineEmits<{ cerrar: [] }>();

const sale = useSaleStore();
const terminal = useTerminalStore();
const ui = useUiStore();

const mode = ref<"pct" | "amt">("pct");
const val = ref("");
const error = ref<string | null>(null);
const askingPin = ref(false);

const quickPct = [5, 10, 15, 20];
const quickAmt = [50, 100, 200, 500];

/** % efectivo del descuento sobre el bruto (solo para el umbral del PIN; float ok) */
const pctEfectivo = computed(() => {
  const v = Number(val.value) || 0;
  if (mode.value === "pct") return v;
  let gross = 0;
  for (const l of sale.sale.lines) gross += Number(l.unit_price) * Number(l.quantity);
  return gross === 0 ? 0 : (v / gross) * 100;
});

function aplicar() {
  const v = Number(val.value);
  if (Number.isNaN(v) || v <= 0) {
    error.value = "Indica el descuento.";
    return;
  }
  if (pctEfectivo.value > terminal.maxDiscountPercent) {
    askingPin.value = true;
    return;
  }
  void confirmar(null);
}

async function confirmar(supervisor: UserRow | null) {
  askingPin.value = false;
  await sale.applyGlobalDiscount(mode.value, Number(val.value));
  if (supervisor !== null) await sale.setSupervisor(supervisor.id);
  ui.toast("exito", "Descuento aplicado.");
  emit("cerrar");
}

async function quitar() {
  await sale.clearGlobalDiscount();
  emit("cerrar");
}
</script>

<template>
  <ModalPro v-if="!askingPin" title="Descuento global" size="sm" @cerrar="emit('cerrar')">
    <div class="mb-3.5 flex gap-1.5 rounded-lg bg-zinc-100 p-1">
      <button type="button" tabindex="-1" class="mseg" :class="mode === 'pct' ? 'on' : ''" @mousedown.prevent @click="mode = 'pct'">Porcentaje %</button>
      <button type="button" tabindex="-1" class="mseg" :class="mode === 'amt' ? 'on' : ''" @mousedown.prevent @click="mode = 'amt'">Monto RD$</button>
    </div>

    <label class="mb-1.5 block text-[12.5px] font-semibold">{{ mode === "pct" ? "Porcentaje a descontar" : "Monto a descontar" }}</label>
    <input
      v-model="val"
      class="monto h-11 w-full rounded-lg border border-border px-3.5 text-sm focus:border-primary focus:outline-none"
      inputmode="decimal"
      placeholder="0"
      @keydown.enter.prevent="aplicar"
    />

    <div class="mt-2.5 flex flex-wrap gap-2">
      <button
        v-for="q in mode === 'pct' ? quickPct : quickAmt"
        :key="q"
        type="button"
        tabindex="-1"
        class="monto min-w-[70px] flex-1 rounded-lg border border-border py-2.5 text-[13px] font-semibold hover:border-primary hover:text-primary"
        @mousedown.prevent
        @click="val = String(q)"
      >
        {{ mode === "pct" ? q + "%" : q }}
      </button>
    </div>

    <p v-if="error" class="mt-2 text-sm font-medium text-danger">{{ error }}</p>
    <p v-if="pctEfectivo > terminal.maxDiscountPercent" class="mt-2 text-xs font-medium text-warning">
      Sobre el {{ terminal.maxDiscountPercent }}% pedirá PIN de supervisor.
    </p>

    <template #footer>
      <button type="button" tabindex="-1" class="h-[46px] flex-1 rounded-lg border border-border font-bold text-text-dim" @mousedown.prevent @click="quitar">Quitar</button>
      <button type="button" tabindex="-1" class="h-[46px] flex-1 rounded-lg bg-primary font-bold text-white" @mousedown.prevent @click="aplicar">Aplicar</button>
    </template>
  </ModalPro>

  <PinAutorizacion
    v-else
    accion="Descuento global"
    :detalle="`${val}${mode === 'pct' ? '%' : ' RD$'} (sobre el ${terminal.maxDiscountPercent}% permitido)`"
    @autorizado="confirmar"
    @cancelar="askingPin = false"
  />
</template>

<style scoped>
.mseg {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-dim);
  padding: 9px;
  border-radius: 6px;
}
.mseg.on {
  background: var(--color-surface);
  color: var(--color-primary);
  box-shadow: var(--shadow-sm);
}
</style>
