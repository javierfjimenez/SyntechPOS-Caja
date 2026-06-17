<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";

import ModalBase from "@/components/ui/ModalBase.vue";
import TecladoNumerico from "@/components/ui/TecladoNumerico.vue";
import { avatarFor } from "@/lib/avatar";
import { toMilli } from "@/lib/decimal";
import { formatMoney } from "@/lib/format";
import { editableFocused, focusScan, registerScanFocus } from "@/lib/scan-focus";
import {
  expectedScaleTotal,
  findByCode,
  GRID_PAGE_SIZE,
  listProductsForGrid,
  productToLine,
  scaleToLine,
  type ProductRow,
} from "@/services/product-lookup";
import { parseScaleBarcode } from "@/services/scale-barcode";
import { classifyScanInput } from "@/services/scan-input";
import { useSaleStore } from "@/stores/sale";
import { useTerminalStore } from "@/stores/terminal";
import { useUiStore } from "@/stores/ui";

/**
 * Catálogo central (diseño Caja PRO): el input de escaneo es el dueño del foco
 * y FILTRA el grid en vivo; Enter agrega el primer resultado o resuelve el
 * código (barra/balanza/multiplicador). Click en un tile = +1. Pesables piden
 * peso. El rail de categorías controla el departamento.
 */
const props = defineProps<{ departmentId: number | null }>();
const emit = defineEmits<{ cobrar: []; desconocido: [code: string]; montoLibre: [] }>();

const sale = useSaleStore();
const terminal = useTerminalStore();
const ui = useUiStore();

const input = ref<HTMLInputElement | null>(null);
const term = ref("");
const products = ref<ProductRow[]>([]);
const scroller = ref<HTMLElement | null>(null);

// scroll infinito: se trae una página y se piden más al llegar al fondo
const hayMas = ref(false);
const cargandoMas = ref(false);
let offset = 0;

// pesaje
const pesando = ref<ProductRow | null>(null);
const pesoDigits = ref("");

let searchTimer: ReturnType<typeof setInterval> | undefined;
watch([() => props.departmentId, term], () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(cargar, 120);
});

function filtroActual() {
  return { departmentId: props.departmentId ?? undefined, term: term.value };
}

/** Primera página del filtro actual (reinicia el scroll) */
async function cargar() {
  const page = await listProductsForGrid(filtroActual(), GRID_PAGE_SIZE, 0);
  products.value = page;
  offset = page.length;
  hayMas.value = page.length === GRID_PAGE_SIZE;
  scroller.value?.scrollTo({ top: 0 });
}

/** Siguiente página: acumula al final (scroll infinito) */
async function cargarMas() {
  if (!hayMas.value || cargandoMas.value) return;
  cargandoMas.value = true;
  try {
    const page = await listProductsForGrid(filtroActual(), GRID_PAGE_SIZE, offset);
    products.value.push(...page);
    offset += page.length;
    hayMas.value = page.length === GRID_PAGE_SIZE;
  } finally {
    cargandoMas.value = false;
  }
}

function onScroll() {
  const el = scroller.value;
  if (el === null) return;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 240) void cargarMas();
}

onMounted(async () => {
  await cargar();
  input.value?.focus();
  registerScanFocus(() => setTimeout(() => input.value?.focus(), 0));
  window.addEventListener("keydown", onWindowKeydown);
});
onUnmounted(() => {
  registerScanFocus(null);
  window.removeEventListener("keydown", onWindowKeydown);
});

// ── input de escaneo ──────────────────────────────────────────────────────────
async function submit() {
  const action = classifyScanInput(term.value);
  if (action.kind === "empty") {
    emit("cobrar");
    return;
  }
  if (action.kind === "multiplier") {
    sale.setMultiplier(action.times);
    term.value = "";
    return;
  }
  if (action.kind === "scale") {
    await resolverBalanza(action.code);
    term.value = "";
    return;
  }
  if (action.kind === "code") {
    const product = await findByCode(action.code);
    if (product !== null) {
      await sale.addLine(productToLine(product));
    } else {
      emit("desconocido", action.code);
    }
    term.value = "";
    return;
  }
  // texto: agrega el primer resultado del grid filtrado
  if (products.value[0] !== undefined) {
    await agregar(products.value[0]);
    term.value = "";
  }
}

async function resolverBalanza(code: string) {
  const parsed = parseScaleBarcode(code, terminal.scaleFormat);
  const product = parsed === null ? null : await findByCode(parsed.productCode);
  if (parsed === null || product === null) {
    emit("desconocido", code);
    return;
  }
  await sale.addLine(scaleToLine(product, parsed));
}

function onInputKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    void submit();
  }
}

function refocus() {
  setTimeout(() => {
    if (ui.modalOpen || editableFocused(input.value)) return;
    input.value?.focus();
  }, 30);
}

function onWindowKeydown(e: KeyboardEvent) {
  if (ui.modalOpen || e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.activeElement === input.value || editableFocused(input.value)) return;
  if (e.key.length === 1) {
    input.value?.focus();
    term.value += e.key;
    e.preventDefault();
  }
}

// ── tiles ─────────────────────────────────────────────────────────────────────
async function agregar(p: ProductRow) {
  if (p.is_weighable === 1) {
    pesando.value = p;
    pesoDigits.value = "";
    return;
  }
  await sale.addLine(productToLine(p));
  focusScan();
}

function badge(productId: number): string | null {
  const q = sale.quantityForProduct(productId);
  if (toMilli(q) === 0n) return null;
  return q.endsWith(".000") ? q.slice(0, -4) : q;
}

// pesaje inline
const pesoStr = () => {
  const padded = pesoDigits.value.padStart(4, "0");
  return `${BigInt(padded.slice(0, -3))}.${padded.slice(-3)}`;
};
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
  if (pesando.value === null || toMilli(pesoStr()) === 0n) return;
  await sale.addLine({ ...productToLine(pesando.value, pesoStr()), is_weighable: true });
  cerrarPeso();
  focusScan();
}
</script>

<template>
  <div class="flex min-w-0 flex-1 flex-col px-4 py-3.5">
    <!-- Escaneo + monto libre -->
    <div class="mb-3 flex flex-none gap-2.5">
      <div class="relative flex-1">
        <span class="pointer-events-none absolute top-3.5 left-3.5 text-primary">
          <svg viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5"><path d="M3.75 4.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-1.5 0V5.25a.75.75 0 0 1 .75-.75ZM6.75 4.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-1.5 0V5.25a.75.75 0 0 1 .75-.75ZM10.5 5.25a.75.75 0 0 0-1.5 0v13.5a.75.75 0 0 0 1.5 0V5.25ZM13.5 4.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-1.5 0V5.25a.75.75 0 0 1 .75-.75ZM18 5.25a.75.75 0 0 0-1.5 0v13.5a.75.75 0 0 0 1.5 0V5.25ZM20.25 4.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-1.5 0V5.25a.75.75 0 0 1 .75-.75Z" /></svg>
        </span>
        <input
          ref="input"
          v-model="term"
          type="text"
          autocomplete="off"
          spellcheck="false"
          placeholder="Escanear código o buscar producto…  (Enter = agregar)"
          class="h-12 w-full rounded-lg border border-border bg-surface pr-3.5 pl-11 text-[14.5px] font-medium shadow-sm focus:border-transparent focus:outline-2 focus:outline-primary-hi"
          @keydown="onInputKeydown"
          @blur="refocus"
        />
      </div>
      <button
        type="button"
        tabindex="-1"
        class="flex h-12 flex-none items-center gap-2 rounded-lg border border-dashed border-primary bg-primary/5 px-4 text-[13.5px] font-bold text-primary hover:bg-primary/10"
        @mousedown.prevent
        @click="emit('montoLibre')"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" class="h-[18px] w-[18px]"><path d="M12 3.75a.75.75 0 0 1 .75.75v6.75h6.75a.75.75 0 0 1 0 1.5h-6.75v6.75a.75.75 0 0 1-1.5 0v-6.75H4.5a.75.75 0 0 1 0-1.5h6.75V4.5a.75.75 0 0 1 .75-.75Z" /></svg>
        Monto libre <span class="monto text-[10px] opacity-70">F9</span>
      </button>
    </div>

    <!-- Grid de productos -->
    <div ref="scroller" class="flex-1 overflow-y-auto pr-0.5" @scroll.passive="onScroll">
      <div class="grid gap-[11px]" style="grid-template-columns: repeat(auto-fill, minmax(150px, 1fr))">
        <button
          v-for="p in products"
          :key="p.id"
          type="button"
          tabindex="-1"
          class="relative flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
          @mousedown.prevent
          @click="agregar(p)"
        >
          <span v-if="p.tax_category === 'EXENTO'" class="absolute top-2.5 right-2.5 rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-bold text-text-dim">Exento</span>
          <span v-if="badge(p.id)" class="absolute top-2.5 left-2.5 rounded-full bg-primary px-1.5 text-[10px] font-bold text-white">×{{ badge(p.id) }}</span>

          <span
            class="grid h-9 w-9 place-items-center rounded-lg text-xs font-bold text-white"
            :style="{ backgroundColor: avatarFor(p.name).color }"
          >
            {{ avatarFor(p.name).initials }}
          </span>
          <span class="min-h-[34px] text-[13px] leading-snug font-semibold">{{ p.name }}</span>
          <span class="mt-auto flex items-center justify-between">
            <span class="monto text-[13.5px] font-semibold">{{ formatMoney(p.price) }}</span>
            <span v-if="p.is_weighable === 1" class="text-[10px] font-semibold text-text-dim">Pesable</span>
          </span>
        </button>
      </div>
      <p v-if="products.length === 0" class="px-2 py-8 text-sm text-faint">Sin resultados.</p>
      <p v-else-if="cargandoMas" class="px-2 py-4 text-center text-xs text-faint">Cargando más…</p>
    </div>
  </div>

  <!-- Pesaje -->
  <ModalBase v-if="pesando" @cerrar="cerrarPeso">
    <div class="flex w-72 flex-col gap-3">
      <h3 class="text-lg font-bold">{{ pesando.name }}</h3>
      <p class="text-sm text-text-dim">Peso (kg/lb)</p>
      <div class="monto flex h-14 items-center justify-end rounded-lg border-2 border-primary bg-bg px-4 text-3xl font-bold">
        {{ pesoStr() }}
      </div>
      <p class="monto text-right text-text-dim">≈ {{ formatMoney(expectedScaleTotal(pesando, pesoStr())) }}</p>
      <TecladoNumerico @digito="pesoDigito" @borrar="pesoBorrar" @confirmar="confirmarPeso" />
    </div>
  </ModalBase>
</template>
