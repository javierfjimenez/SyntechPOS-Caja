<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";

import BotonAccion from "@/components/ui/BotonAccion.vue";
import ModalBase from "@/components/ui/ModalBase.vue";
import { avatarFor } from "@/lib/avatar";
import { toMilli } from "@/lib/decimal";
import { formatMoney } from "@/lib/format";
import {
  expectedScaleTotal,
  listBrands,
  listDepartments,
  listProductsForGrid,
  productToLine,
  type BrandRow,
  type DepartmentRow,
  type ProductRow,
} from "@/services/product-lookup";
import { useSaleStore } from "@/stores/sale";

/**
 * Grid de productos (D24): tiles con avatar generado del nombre (sin imágenes
 * aún). Click en un tile = +1 (igual que escanear). +/- por tile para ajustar;
 * los pesables piden el peso. Navegable por departamento y marca.
 *
 * El grid es un panel AUXILIAR: queda abierto para agregar varios productos y
 * el total corre abajo. Los tiles son tabindex=-1 — JAMÁS roban el foco del
 * escaneo (§1); ModalBase lo devuelve al input al cerrar.
 */
const emit = defineEmits<{ cerrar: [] }>();

const sale = useSaleStore();

const departments = ref<DepartmentRow[]>([]);
const brands = ref<BrandRow[]>([]);
const products = ref<ProductRow[]>([]);
const filtro = ref<{ kind: "todos" } | { kind: "dep"; id: number } | { kind: "marca"; id: number }>({
  kind: "todos",
});
const cargando = ref(false);

// Pesaje inline: tile pesable clickeado → pedir peso antes de agregar
const pesando = ref<ProductRow | null>(null);
const pesoDigits = ref(""); // gramos tecleados: "345" = 0.345

onMounted(async () => {
  [departments.value, brands.value] = await Promise.all([listDepartments(), listBrands()]);
  await cargar();
});

watch(filtro, cargar, { deep: true });

async function cargar() {
  cargando.value = true;
  try {
    const f =
      filtro.value.kind === "dep"
        ? { departmentId: filtro.value.id }
        : filtro.value.kind === "marca"
          ? { brandId: filtro.value.id }
          : {};
    products.value = await listProductsForGrid(f);
  } finally {
    cargando.value = false;
  }
}

/** "2.000" → 2 (oculta los decimales de relleno) para el badge */
function badge(productId: number): string | null {
  const q = sale.quantityForProduct(productId);
  if (toMilli(q) === 0n) return null;
  return q.endsWith(".000") ? q.slice(0, -4) : q;
}

async function clickTile(p: ProductRow) {
  if (p.is_weighable === 1) {
    pesando.value = p;
    pesoDigits.value = "";
    return;
  }
  await sale.addLine(productToLine(p)); // +1 (merge con la línea existente)
}

async function masTile(p: ProductRow) {
  if (p.is_weighable === 1) return;
  await sale.addLine(productToLine(p));
}

async function menosTile(p: ProductRow) {
  if (p.is_weighable === 1) return;
  await sale.decrementByProduct(p.id);
}

// ── Pesaje inline ───────────────────────────────────────────────────────────
const pesoStr = computed(() => {
  const padded = pesoDigits.value.padStart(4, "0");
  return `${BigInt(padded.slice(0, -3))}.${padded.slice(-3)}`;
});

function pesoDigito(d: string) {
  if (pesoDigits.value.length < 6) pesoDigits.value += d;
}
function pesoBorrar() {
  pesoDigits.value = pesoDigits.value.slice(0, -1);
}
async function confirmarPeso() {
  if (pesando.value === null || toMilli(pesoStr.value) === 0n) return;
  await sale.addLine({ ...productToLine(pesando.value, pesoStr.value), is_weighable: true });
  pesando.value = null;
}

function onPesoKeydown(e: KeyboardEvent) {
  if (/^[0-9]$/.test(e.key)) pesoDigito(e.key);
  else if (e.key === "Backspace") pesoBorrar();
  else if (e.key === "Enter") void confirmarPeso();
  else return;
  e.preventDefault();
}
</script>

<template>
  <ModalBase @cerrar="emit('cerrar')">
    <div class="flex h-[40rem] max-h-[85vh] w-[56rem] max-w-[92vw] flex-col gap-3">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-bold text-text">Productos</h2>
        <span class="text-sm text-text-dim">Toca un producto para agregarlo · ESC para volver</span>
      </div>

      <!-- Filtros: Todos / departamentos / marcas -->
      <div class="flex flex-wrap gap-1.5 border-b border-border pb-2">
        <button
          type="button"
          tabindex="-1"
          class="rounded-lg px-3 py-1 text-sm font-medium"
          :class="filtro.kind === 'todos' ? 'bg-primary text-white' : 'bg-bg text-text hover:bg-border'"
          @click="filtro = { kind: 'todos' }"
        >
          Todos
        </button>
        <button
          v-for="d in departments"
          :key="`d${d.id}`"
          type="button"
          tabindex="-1"
          class="rounded-lg px-3 py-1 text-sm font-medium"
          :class="filtro.kind === 'dep' && filtro.id === d.id ? 'bg-primary text-white' : 'bg-bg text-text hover:bg-border'"
          @click="filtro = { kind: 'dep', id: d.id }"
        >
          {{ d.name }}
        </button>
        <button
          v-for="b in brands"
          :key="`b${b.id}`"
          type="button"
          tabindex="-1"
          class="rounded-lg px-3 py-1 text-sm font-medium"
          :class="filtro.kind === 'marca' && filtro.id === b.id ? 'bg-primary text-white' : 'bg-bg text-text hover:bg-border'"
          @click="filtro = { kind: 'marca', id: b.id }"
        >
          {{ b.name }}
        </button>
      </div>

      <!-- Rejilla de tiles -->
      <div class="grid flex-1 auto-rows-min grid-cols-4 gap-2 overflow-y-auto pr-1">
        <button
          v-for="p in products"
          :key="p.id"
          type="button"
          tabindex="-1"
          class="relative flex flex-col items-center gap-1 rounded-lg border border-border bg-surface p-2 text-center hover:border-primary"
          @click="clickTile(p)"
        >
          <span v-if="badge(p.id)" class="absolute top-1 right-1 rounded-full bg-primary px-1.5 text-xs font-bold text-white">
            ×{{ badge(p.id) }}
          </span>

          <!-- Avatar generado (imagen real llega en Fase 2) -->
          <span
            v-if="p.image_url === null"
            class="flex h-12 w-12 items-center justify-center rounded-full text-base font-bold text-white"
            :style="{ backgroundColor: avatarFor(p.name).color }"
          >
            {{ avatarFor(p.name).initials }}
          </span>
          <img v-else :src="p.image_url" alt="" class="h-12 w-12 rounded-full object-cover" />

          <span class="line-clamp-2 text-sm leading-tight text-text">{{ p.name }}</span>
          <span class="monto text-sm font-semibold text-primary">{{ formatMoney(p.price) }}</span>

          <!-- +/- por tile (no pesables) -->
          <span v-if="p.is_weighable === 0" class="mt-0.5 flex items-center gap-1.5" @click.stop>
            <span
              role="button"
              tabindex="-1"
              aria-label="Quitar uno"
              class="flex h-6 w-6 items-center justify-center rounded-md border border-border text-base leading-none text-text-dim hover:bg-bg"
              @click="menosTile(p)"
            >
              −
            </span>
            <span
              role="button"
              tabindex="-1"
              aria-label="Agregar uno"
              class="flex h-6 w-6 items-center justify-center rounded-md border border-border text-base leading-none text-primary hover:bg-bg"
              @click="masTile(p)"
            >
              +
            </span>
          </span>
          <span v-else class="mt-0.5 text-xs text-text-dim">Pesable</span>
        </button>

        <p v-if="!cargando && products.length === 0" class="col-span-4 py-10 text-center text-text-dim">
          No hay productos en este filtro.
        </p>
      </div>

      <!-- Total corriendo + cerrar -->
      <div class="flex items-center justify-between border-t border-border pt-2">
        <span class="text-text-dim">
          {{ sale.sale.lines.length }} {{ sale.sale.lines.length === 1 ? "línea" : "líneas" }} ·
          <span class="monto font-semibold text-text">{{ formatMoney(sale.totals.total) }}</span>
        </span>
        <BotonAccion @click="emit('cerrar')">Listo</BotonAccion>
      </div>
    </div>

    <!-- Pesaje inline (overlay sobre el grid) -->
    <Teleport to="body">
      <div
        v-if="pesando"
        class="fixed inset-0 z-[60] flex items-center justify-center bg-text/50"
        @keydown="onPesoKeydown"
      >
        <div class="flex w-80 flex-col gap-3 rounded-lg bg-surface p-6 shadow-lg">
          <h3 class="text-lg font-bold text-text">{{ pesando.name }}</h3>
          <p class="text-sm text-text-dim">Peso (kg/lb)</p>
          <div class="monto flex h-14 items-center justify-end rounded-lg border-2 border-primary bg-bg px-4 text-3xl font-bold text-text">
            {{ pesoStr }}
          </div>
          <p class="monto text-right text-text-dim">
            ≈ {{ formatMoney(expectedScaleTotal(pesando, pesoStr)) }}
          </p>
          <div class="flex justify-end gap-2">
            <BotonAccion variante="secundario" @click="pesando = null">Cancelar</BotonAccion>
            <BotonAccion :disabled="pesoStr === '0.000'" @click="confirmarPeso">Agregar</BotonAccion>
          </div>
        </div>
      </div>
    </Teleport>
  </ModalBase>
</template>
