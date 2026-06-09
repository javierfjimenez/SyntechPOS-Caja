<script setup lang="ts">
import { formatMoney } from "@/lib/format";
import { lineTotal, subtotal } from "@/services/sale";
import { useSaleStore } from "@/stores/sale";

/**
 * Panel del ticket (diseño Caja PRO): tipo de comprobante E32/E31, cliente,
 * líneas con stepper + precio editable, y el pie con totales + Cobrar.
 * Lee el carrito real del store; emite las acciones a VentaView.
 */
const props = defineProps<{
  ticketNumber: number;
  tipo: "consumo" | "credito";
  customerName: string | null;
  propinaLabel: string | null; // "Propina legal (10%)" si aplica
  propinaMonto: string; // "0.00"
  descuentoMonto: string; // "0.00" (global, ya prorrateado a líneas)
}>();

const emit = defineEmits<{
  vaciar: [];
  setTipo: [t: "consumo" | "credito"];
  cliente: [];
  cobrar: [];
}>();

const sale = useSaleStore();

function qty(q: string): string {
  return q.endsWith(".000") ? q.slice(0, -4) : q;
}

function onPrice(index: number, e: Event) {
  const raw = (e.target as HTMLInputElement).value.replace(/[^0-9.]/g, "");
  if (raw === "" || Number.isNaN(Number(raw))) return;
  void sale.setLinePrice(index, Number(raw).toFixed(2));
}

void props;
</script>

<template>
  <section class="flex w-[398px] flex-none flex-col border-l border-border bg-surface">
    <!-- Encabezado -->
    <div class="flex-none border-b border-border px-4 py-3.5">
      <div class="flex items-center justify-between">
        <h2 class="flex items-center gap-1.5 text-[14.5px] font-extrabold">
          Venta <span class="monto text-[12.5px] font-semibold text-text-dim">#{{ ticketNumber }}</span>
        </h2>
        <button
          type="button"
          tabindex="-1"
          class="flex items-center gap-1.5 text-xs font-semibold text-danger hover:opacity-80"
          :disabled="sale.isEmpty"
          :class="sale.isEmpty ? 'opacity-40' : ''"
          @mousedown.prevent
          @click="emit('vaciar')"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" class="h-3.5 w-3.5"><path fill-rule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 0 1 3.878.512.75.75 0 1 1-.256 1.478l-.209-.035-1.005 13.07a3 3 0 0 1-2.991 2.77H8.084a3 3 0 0 1-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 0 1-.256-1.478A48.567 48.567 0 0 1 7.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 0 1 3.369 0c1.603.051 2.815 1.387 2.815 2.951Z" clip-rule="evenodd" /></svg>
          Vaciar
        </button>
      </div>

      <!-- Tipo de comprobante -->
      <div class="mt-2.5 flex gap-1.5 rounded-lg bg-zinc-100 p-1">
        <button
          type="button"
          tabindex="-1"
          class="seg-b"
          :class="tipo === 'consumo' ? 'on' : ''"
          @mousedown.prevent
          @click="emit('setTipo', 'consumo')"
        >
          E32 · Consumo
        </button>
        <button
          type="button"
          tabindex="-1"
          class="seg-b"
          :class="tipo === 'credito' ? 'on' : ''"
          @mousedown.prevent
          @click="emit('setTipo', 'credito')"
        >
          E31 · Crédito fiscal
        </button>
      </div>

      <!-- Cliente -->
      <button
        type="button"
        tabindex="-1"
        class="mt-2.5 flex w-full items-center gap-2.5 rounded-lg border border-dashed border-border px-3 py-2.5 text-[12.5px] font-medium text-text-dim hover:border-primary/60 hover:text-primary"
        @mousedown.prevent
        @click="emit('cliente')"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" class="h-[17px] w-[17px] text-primary"><path d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" /></svg>
        <span>{{ customerName ?? "Consumidor final" }}</span>
        <svg viewBox="0 0 24 24" fill="currentColor" class="ml-auto h-[15px] w-[15px] text-faint"><path fill-rule="evenodd" d="M16.28 11.47a.75.75 0 0 1 0 1.06l-7.5 7.5a.75.75 0 0 1-1.06-1.06L14.69 12 7.72 5.03a.75.75 0 0 1 1.06-1.06l7.5 7.5Z" clip-rule="evenodd" /></svg>
      </button>
    </div>

    <!-- Líneas -->
    <div class="flex-1 overflow-y-auto">
      <div
        v-if="sale.isEmpty"
        class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-faint"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" class="h-11 w-11"><path d="M2.25 2.25a.75.75 0 0 0 0 1.5h1.386c.17 0 .318.114.362.278l2.558 9.592a3.752 3.752 0 0 0-2.806 3.63c0 .414.336.75.75.75h15.75a.75.75 0 0 0 0-1.5H5.378A2.25 2.25 0 0 1 7.5 15h11.218a.75.75 0 0 0 .674-.421 60.358 60.358 0 0 0 2.96-7.228.75.75 0 0 0-.525-.965A60.864 60.864 0 0 0 5.68 4.509l-.232-.867A1.875 1.875 0 0 0 3.636 2.25H2.25ZM3.75 20.25a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0ZM16.5 20.25a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z" /></svg>
        <p class="max-w-[24ch] text-[13px] font-medium">Escanea o toca un producto para empezar la venta.</p>
      </div>

      <div v-for="(l, i) in sale.sale.lines" v-else :key="i" class="border-b border-border px-4 py-2.5">
        <div class="flex items-center gap-2.5">
          <span class="min-w-0 flex-1 truncate text-[13px] font-semibold">{{ l.description }}</span>
          <span v-if="l.tax_category === 'EXENTO'" class="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-bold text-text-dim">Exento</span>
          <button
            type="button"
            tabindex="-1"
            aria-label="Quitar"
            class="grid h-6 w-6 flex-none place-items-center rounded-md text-faint hover:bg-danger/10 hover:text-danger"
            @mousedown.prevent
            @click="sale.removeLineAt(i)"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" class="h-[15px] w-[15px]"><path fill-rule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 0 1 3.878.512.75.75 0 1 1-.256 1.478l-.209-.035-1.005 13.07a3 3 0 0 1-2.991 2.77H8.084a3 3 0 0 1-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 0 1-.256-1.478A48.567 48.567 0 0 1 7.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 0 1 3.369 0c1.603.051 2.815 1.387 2.815 2.951Z" clip-rule="evenodd" /></svg>
          </button>
        </div>
        <div class="mt-2 flex items-center gap-2.5">
          <span v-if="l.is_weighable" class="monto text-[13px] font-semibold">{{ qty(l.quantity) }}</span>
          <span v-else class="flex items-center overflow-hidden rounded-lg border border-border">
            <button type="button" tabindex="-1" class="step" @mousedown.prevent @click="sale.decrementLine(i)">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.5 12a.75.75 0 0 1 .75-.75h13.5a.75.75 0 0 1 0 1.5H5.25A.75.75 0 0 1 4.5 12Z" /></svg>
            </button>
            <span class="monto w-[30px] text-center text-[13px] font-semibold">{{ qty(l.quantity) }}</span>
            <button type="button" tabindex="-1" class="step" @mousedown.prevent @click="sale.incrementLine(i)">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5a.75.75 0 0 1 .75.75v6h6a.75.75 0 0 1 0 1.5h-6v6a.75.75 0 0 1-1.5 0v-6h-6a.75.75 0 0 1 0-1.5h6v-6A.75.75 0 0 1 12 4.5Z" /></svg>
            </button>
          </span>
          <span class="text-[11px] text-faint">×</span>
          <input
            class="monto w-[74px] rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[12px] text-text-dim hover:border-border focus:border-primary focus:text-text focus:outline-none"
            :value="Number(l.unit_price).toFixed(2)"
            title="Editar precio"
            @change="onPrice(i, $event)"
          />
          <span class="monto ml-auto flex-none text-[13.5px] font-semibold">{{ formatMoney(lineTotal(l)) }}</span>
        </div>
      </div>
    </div>

    <!-- Pie: totales + cobrar -->
    <div class="flex-none border-t border-border bg-surface px-4 py-3.5">
      <div class="mb-1.5 flex items-center justify-between text-[13px] text-text-dim">
        <span>Subtotal</span><span class="monto text-text">{{ formatMoney(subtotal(sale.totals)) }}</span>
      </div>
      <div v-if="descuentoMonto !== '0.00'" class="mb-1.5 flex items-center justify-between text-[13px] text-text-dim">
        <span>Descuento</span><span class="monto text-danger">−{{ formatMoney(descuentoMonto) }}</span>
      </div>
      <div class="mb-1.5 flex items-center justify-between text-[13px] text-text-dim">
        <span>ITBIS (18%)</span><span class="monto text-text">{{ formatMoney(sale.totals.taxed18_itbis) }}</span>
      </div>
      <div v-if="propinaLabel" class="mb-1.5 flex items-center justify-between text-[13px] text-text-dim">
        <span>{{ propinaLabel }}</span><span class="monto text-text">{{ formatMoney(propinaMonto) }}</span>
      </div>

      <div class="mt-2.5 flex items-baseline justify-between border-t border-border pt-2.5 pb-3">
        <span class="text-sm font-bold">Total</span>
        <span class="monto text-[27px] font-bold tracking-tight text-success">{{ formatMoney(sale.totals.total) }}</span>
      </div>

      <button
        type="button"
        tabindex="-1"
        class="flex h-[52px] w-full items-center justify-center gap-2.5 rounded-lg bg-primary text-[15.5px] font-extrabold text-white hover:bg-primary-hi disabled:cursor-not-allowed disabled:bg-border disabled:text-faint"
        :disabled="sale.isEmpty"
        @mousedown.prevent
        @click="emit('cobrar')"
      >
        <svg viewBox="0 0 24 24" fill="#fff" class="h-[21px] w-[21px]"><path fill-rule="evenodd" d="M7.5 6v.75H5.513c-.96 0-1.764.724-1.865 1.679l-1.263 12A1.875 1.875 0 0 0 4.25 22.5h15.5a1.875 1.875 0 0 0 1.865-2.071l-1.263-12a1.875 1.875 0 0 0-1.865-1.679H16.5V6a4.5 4.5 0 1 0-9 0ZM12 3a3 3 0 0 0-3 3v.75h6V6a3 3 0 0 0-3-3Zm-3 8.25a3 3 0 1 0 6 0v-.75a.75.75 0 0 1 1.5 0v.75a4.5 4.5 0 1 1-9 0v-.75a.75.75 0 0 1 1.5 0v.75Z" clip-rule="evenodd" /></svg>
        Cobrar <span class="monto">{{ formatMoney(sale.totals.total) }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.seg-b {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-dim);
  padding: 7px 4px;
  border-radius: 6px;
}
.seg-b.on {
  background: var(--color-surface);
  color: var(--color-primary);
  box-shadow: var(--shadow-sm);
}
.step {
  width: 26px;
  height: 28px;
  display: grid;
  place-items: center;
  color: var(--color-primary);
}
.step:hover {
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
}
.step svg {
  width: 14px;
  height: 14px;
}
</style>
