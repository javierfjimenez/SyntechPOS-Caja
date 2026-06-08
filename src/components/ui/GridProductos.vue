<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

import BotonAccion from "@/components/ui/BotonAccion.vue";
import ModalBase from "@/components/ui/ModalBase.vue";
import TecladoNumerico from "@/components/ui/TecladoNumerico.vue";
import { avatarFor } from "@/lib/avatar";
import { toMilli } from "@/lib/decimal";
import { formatMoney } from "@/lib/format";
import { focusScan } from "@/lib/scan-focus";
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
 * Grid de productos SIEMPRE VISIBLE en la columna derecha de la venta (D24):
 * tiles con avatar generado del nombre (sin imágenes aún). Click en un tile =
 * +1 (igual que escanear); +/- por tile para ajustar; los pesables piden peso.
 * Navegable por departamento y marca.
 *
 * Los tiles son tabindex=-1 — JAMÁS roban el foco del input de escaneo (§1):
 * la cajera escanea con el teclado y toca el grid con el mouse/pantalla.
 */
const sale = useSaleStore();

const departments = ref<DepartmentRow[]>([]);
const brands = ref<BrandRow[]>([]);
const products = ref<ProductRow[]>([]);
const filtro = ref<{ kind: "todos" } | { kind: "dep"; id: number } | { kind: "marca"; id: number }>({
  kind: "todos",
});
const term = ref("");
const cargando = ref(false);

// Pesaje: tile pesable clickeado → pedir peso antes de agregar (modal)
const pesando = ref<ProductRow | null>(null);
const pesoDigits = ref(""); // gramos tecleados: "345" = 0.345

onMounted(async () => {
  [departments.value, brands.value] = await Promise.all([listDepartments(), listBrands()]);
  await cargar();
  window.addEventListener("keydown", onPesoKeydown);
});
onUnmounted(() => window.removeEventListener("keydown", onPesoKeydown));

watch(filtro, cargar, { deep: true });

// la búsqueda escribe rápido: debounce para no consultar por cada tecla
let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(term, () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(cargar, 150);
});

async function cargar() {
  cargando.value = true;
  try {
    const base =
      filtro.value.kind === "dep"
        ? { departmentId: filtro.value.id }
        : filtro.value.kind === "marca"
          ? { brandId: filtro.value.id }
          : {};
    products.value = await listProductsForGrid({ ...base, term: term.value });
  } finally {
    cargando.value = false;
  }
}

/** "2.000" → 2 (oculta decimales de relleno) para el badge */
function badge(productId: number): string | null {
  const q = sale.quantityForProduct(productId);
  if (toMilli(q) === 0n) return null;
  return q.endsWith(".000") ? q.slice(0, -4) : q;
}

async function clickTile(p: ProductRow) {
  if (p.is_weighable === 1) {
    // ModalBase marca el modal abierto → el escáner no roba las teclas al pesar
    pesando.value = p;
    pesoDigits.value = "";
    return;
  }
  await sale.addLine(productToLine(p)); // +1 (merge con la línea existente)
  focusScan(); // elegido el producto, el escáner recupera el foco
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
function cerrarPeso() {
  pesando.value = null;
}
async function confirmarPeso() {
  if (pesando.value === null || toMilli(pesoStr.value) === 0n) return;
  await sale.addLine({ ...productToLine(pesando.value, pesoStr.value), is_weighable: true });
  cerrarPeso();
  focusScan(); // tras pesar, el escáner recupera el foco (gana a ModalBase)
}

/** ESC en la búsqueda: limpia y devuelve el foco al escáner */
function limpiarBusqueda() {
  term.value = "";
  focusScan();
}

function onPesoKeydown(e: KeyboardEvent) {
  if (pesando.value === null) return;
  if (/^[0-9]$/.test(e.key)) pesoDigito(e.key);
  else if (e.key === "Backspace") pesoBorrar();
  else if (e.key === "Enter") void confirmarPeso();
  else return;
  e.preventDefault();
}
</script>

<template>
  <aside class="flex h-full min-h-0 flex-col gap-2 border-l border-border bg-surface p-3">
    <!-- Búsqueda del grid (un campo aparte del escáner; respeta el foco) -->
    <input
      v-model="term"
      type="text"
      autocomplete="off"
      spellcheck="false"
      placeholder="🔍 Buscar producto…"
      class="h-10 w-full rounded-lg border border-border bg-bg px-3 text-text outline-none focus:border-primary"
      @keydown.esc.prevent="limpiarBusqueda"
    />

    <!-- Filtros: Todos / departamentos / marcas -->
    <div class="flex max-h-20 flex-wrap gap-1 overflow-y-auto">
      <button
        type="button"
        tabindex="-1"
        class="rounded-lg px-2.5 py-1 text-sm font-medium"
        :class="filtro.kind === 'todos' ? 'bg-primary text-white' : 'bg-bg text-text hover:bg-border'"
        @mousedown.prevent
        @click="filtro = { kind: 'todos' }"
      >
        Todos
      </button>
      <button
        v-for="d in departments"
        :key="`d${d.id}`"
        type="button"
        tabindex="-1"
        class="rounded-lg px-2.5 py-1 text-sm font-medium"
        :class="filtro.kind === 'dep' && filtro.id === d.id ? 'bg-primary text-white' : 'bg-bg text-text hover:bg-border'"
        @mousedown.prevent
        @click="filtro = { kind: 'dep', id: d.id }"
      >
        {{ d.name }}
      </button>
      <button
        v-for="b in brands"
        :key="`b${b.id}`"
        type="button"
        tabindex="-1"
        class="rounded-lg px-2.5 py-1 text-sm font-medium"
        :class="filtro.kind === 'marca' && filtro.id === b.id ? 'bg-primary text-white' : 'bg-bg text-text hover:bg-border'"
        @mousedown.prevent
        @click="filtro = { kind: 'marca', id: b.id }"
      >
        {{ b.name }}
      </button>
    </div>

    <!-- Rejilla de tiles (siempre visible; se adapta al ancho) -->
    <div class="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2 overflow-y-auto pr-1">
      <button
        v-for="p in products"
        :key="p.id"
        type="button"
        tabindex="-1"
        class="relative flex flex-col items-center gap-1 rounded-lg border border-border bg-surface p-2 text-center hover:border-primary"
        @mousedown.prevent
        @click="clickTile(p)"
      >
        <span v-if="badge(p.id)" class="absolute top-1 right-1 rounded-full bg-primary px-1.5 text-xs font-bold text-white">
          ×{{ badge(p.id) }}
        </span>

        <!-- Avatar generado (imagen real llega en Fase 2) -->
        <span
          v-if="p.image_url === null"
          class="flex h-11 w-11 items-center justify-center rounded-full text-base font-bold text-white"
          :style="{ backgroundColor: avatarFor(p.name).color }"
        >
          {{ avatarFor(p.name).initials }}
        </span>
        <img v-else :src="p.image_url" alt="" class="h-11 w-11 rounded-full object-cover" />

        <span class="line-clamp-2 text-sm leading-tight text-text">{{ p.name }}</span>
        <span class="monto text-sm font-semibold text-primary">{{ formatMoney(p.price) }}</span>

        <!-- +/- por tile (no pesables) -->
        <span v-if="p.is_weighable === 0" class="mt-0.5 flex items-center gap-1.5" @click.stop @mousedown.prevent>
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

      <p v-if="!cargando && products.length === 0" class="col-span-full py-10 text-center text-text-dim">
        No hay productos en este filtro.
      </p>
    </div>
  </aside>

  <!-- Pesaje (modal): captura el foco y lo devuelve al input al cerrar -->
  <ModalBase v-if="pesando" @cerrar="cerrarPeso">
    <div class="flex w-72 flex-col gap-3">
      <h3 class="text-lg font-bold text-text">{{ pesando.name }}</h3>
      <p class="text-sm text-text-dim">Peso (kg/lb)</p>
      <div class="monto flex h-14 items-center justify-end rounded-lg border-2 border-primary bg-bg px-4 text-3xl font-bold text-text">
        {{ pesoStr }}
      </div>
      <p class="monto text-right text-text-dim">≈ {{ formatMoney(expectedScaleTotal(pesando, pesoStr)) }}</p>
      <TecladoNumerico @digito="pesoDigito" @borrar="pesoBorrar" @confirmar="confirmarPeso" />
      <div class="flex justify-end gap-2">
        <BotonAccion variante="secundario" @click="cerrarPeso">Cancelar</BotonAccion>
        <BotonAccion :disabled="pesoStr === '0.000'" @click="confirmarPeso">Agregar</BotonAccion>
      </div>
    </div>
  </ModalBase>
</template>
