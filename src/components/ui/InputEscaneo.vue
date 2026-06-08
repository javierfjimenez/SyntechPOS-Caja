<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

import { formatMoney } from "@/lib/format";
import { searchProducts, type ProductRow } from "@/services/product-lookup";
import { editableFocused, registerScanFocus } from "@/lib/scan-focus";
import { classifyScanInput, isSearchable } from "@/services/scan-input";
import { useSaleStore } from "@/stores/sale";
import { useUiStore } from "@/stores/ui";

/**
 * EL componente de la caja (ui-caja §5 y §11): un solo input acepta TODO —
 * escáner, búsqueda por nombre, multiplicador n*, códigos de balanza.
 *
 * POLÍTICA DE FOCO (la regla más importante del spec): este input es el DUEÑO.
 * - blur sin modal abierto → re-foco automático en <50ms
 * - teclas imprimibles en cualquier parte de la pantalla → caen aquí
 * - los modales lo capturan y ModalBase lo DEVUELVE al cerrarse
 */
const emit = defineEmits<{
  agregar: [product: ProductRow];
  escaneoBalanza: [code: string];
  codigo: [code: string];
  cobrar: [];
  quitarLinea: [];
}>();

const sale = useSaleStore();
const ui = useUiStore();

const input = ref<HTMLInputElement | null>(null);
const text = ref("");
const results = ref<ProductRow[]>([]);
const highlighted = ref(0);

const dropdownOpen = computed(() => results.value.length > 0);

// ── Búsqueda instantánea (esto ES el F2) ──────────────────────────────────────
let searchSeq = 0;
watch(text, async (value) => {
  if (!isSearchable(value)) {
    results.value = [];
    return;
  }
  const seq = ++searchSeq;
  const found = await searchProducts(value);
  if (seq === searchSeq) {
    results.value = found;
    highlighted.value = 0;
  }
});

function reset() {
  text.value = "";
  results.value = [];
  highlighted.value = 0;
}

async function submit() {
  // Dropdown abierto: Enter agrega el resaltado
  if (dropdownOpen.value) {
    const product = results.value[highlighted.value]!;
    reset();
    emit("agregar", product);
    return;
  }

  const action = classifyScanInput(text.value);
  reset();

  switch (action.kind) {
    case "empty":
      emit("cobrar"); // F12 implícito: Enter con input vacío
      break;
    case "multiplier":
      sale.setMultiplier(action.times);
      break;
    case "scale":
      emit("escaneoBalanza", action.code);
      break;
    case "code":
      emit("codigo", action.code); // la vista lo resuelve (producto o desconocido)
      break;
    case "search":
      break; // texto sin resultados: nada que agregar
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    void submit();
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    if (dropdownOpen.value) {
      highlighted.value = Math.min(results.value.length - 1, highlighted.value + 1);
    } else {
      sale.selectNext();
    }
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (dropdownOpen.value) {
      highlighted.value = Math.max(0, highlighted.value - 1);
    } else {
      sale.selectPrevious();
    }
  } else if (e.key === "Escape") {
    e.preventDefault();
    if (dropdownOpen.value || text.value !== "") {
      reset(); // primer ESC: limpia el input/búsqueda
    } else {
      emit("quitarLinea"); // input limpio: ESC quita la línea seleccionada
    }
  }
}

// ── Dueño del foco ────────────────────────────────────────────────────────────
function refocus() {
  setTimeout(() => {
    // No robar el foco si hay un modal abierto o si la cajera está en OTRO
    // campo de texto (p. ej. la búsqueda del grid)
    if (ui.modalOpen || editableFocused(input.value)) return;
    input.value?.focus(); // <50ms (ui-caja §1)
  }, 30);
}

/** Teclas imprimibles fuera del input (sin modal) → caen en el input */
function onWindowKeydown(e: KeyboardEvent) {
  if (ui.modalOpen || e.ctrlKey || e.metaKey || e.altKey) return;
  if (document.activeElement === input.value) return;
  if (editableFocused(input.value)) return; // la cajera escribe en otro campo (búsqueda del grid)
  if (e.key.length === 1) {
    input.value?.focus();
    text.value += e.key;
    e.preventDefault();
  } else if (e.key === "Backspace") {
    input.value?.focus();
  }
}

function selectResult(index: number) {
  const product = results.value[index]!;
  reset();
  emit("agregar", product);
}

onMounted(() => {
  input.value?.focus();
  window.addEventListener("keydown", onWindowKeydown);
  // tras un tick: gana a ModalBase al restaurar foco (el grid puede pedir volver)
  registerScanFocus(() => setTimeout(() => input.value?.focus(), 0));
});
onUnmounted(() => {
  window.removeEventListener("keydown", onWindowKeydown);
  registerScanFocus(null);
});

defineExpose({ focus: () => input.value?.focus() });
</script>

<template>
  <div class="relative">
    <div class="flex items-center gap-2">
      <input
        ref="input"
        v-model="text"
        type="text"
        autocomplete="off"
        spellcheck="false"
        placeholder="🔍 Escanea o escribe nombre/código…"
        class="h-12 w-full rounded-lg border-2 border-border bg-surface px-4 text-lg text-text outline-none focus:border-primary"
        @keydown="onKeydown"
        @blur="refocus"
      />
      <span
        v-if="sale.multiplier !== null"
        class="monto shrink-0 rounded-lg bg-primary px-3 py-2 text-lg font-bold text-white"
        :title="`Las próximas unidades = ${sale.multiplier}`"
      >
        ×{{ sale.multiplier }}
      </span>
    </div>

    <!-- Dropdown de búsqueda instantánea (↑↓ + Enter) -->
    <ul
      v-if="dropdownOpen"
      class="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
    >
      <li
        v-for="(p, i) in results"
        :key="p.id"
        class="flex cursor-pointer items-center justify-between px-4 py-2.5 text-text"
        :class="i === highlighted ? 'bg-primary text-white' : 'hover:bg-bg'"
        @mousedown.prevent="selectResult(i)"
      >
        <span>{{ p.name }}</span>
        <span class="monto" :class="i === highlighted ? 'text-white' : 'text-text-dim'">
          {{ formatMoney(p.price) }}
        </span>
      </li>
    </ul>
  </div>
</template>
