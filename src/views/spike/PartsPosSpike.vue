<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";

import { PARTS_MOCK, type PartRow } from "@/spike/parts-mock";

/**
 * SPIKE (Fase 0) — POS de repuestos, prototipo de UX.
 *
 * ⚠️ DESECHABLE: datos mock, carrito local, sin store/DB/eventos. Sirve para
 * validar el buscador-grid antes de invertir en el contrato (docs/specs/
 * pos-profiles.md). El diseño real usará el core compartido (useSaleStore,
 * CobroModal, impresión, arqueo). NO mergear tal cual.
 */

type SearchField = "name" | "reference" | "code" | "barcode";

const FIELDS: { value: SearchField; label: string }[] = [
  { value: "name", label: "Descripción" },
  { value: "reference", label: "Referencia" },
  { value: "code", label: "Código" },
  { value: "barcode", label: "Cód. Barra" },
];

const field = ref<SearchField>("name");
const query = ref("");
const highlighted = ref(0);
const searchInput = ref<HTMLInputElement | null>(null);

// Marca de tiempo del "último sync" (D-pos-2: el stock es un snapshot)
const lastSync = "12:30";

const results = computed<PartRow[]>(() => {
  const q = query.value.trim().toLowerCase();
  if (q === "") return PARTS_MOCK;
  return PARTS_MOCK.filter((p) => {
    const v = p[field.value];
    return v !== null && String(v).toLowerCase().includes(q);
  });
});

// ─────────────────────────── carrito local (mock) ───────────────────────────

interface CartLine {
  product: PartRow;
  qty: number;
}
const cart = ref<CartLine[]>([]);
const isCredit = ref(false);

function addToCart(p: PartRow) {
  const existing = cart.value.find((l) => l.product.id === p.id);
  if (existing) existing.qty += 1;
  else cart.value.push({ product: p, qty: 1 });
  // Foco sagrado (ui-caja §1): tras elegir, el buscador recupera el foco
  query.value = "";
  highlighted.value = 0;
  void nextTick(() => searchInput.value?.focus());
}

function step(line: CartLine, delta: number) {
  line.qty += delta;
  if (line.qty <= 0) cart.value = cart.value.filter((l) => l !== line);
}

function clearCart() {
  cart.value = [];
  isCredit.value = false;
}

const lineTotal = (l: CartLine): number => Number(l.product.price) * l.qty;

const total = computed(() => cart.value.reduce((s, l) => s + lineTotal(l), 0));
const itbis = computed(() =>
  cart.value.reduce((s, l) => {
    const rate = l.product.taxCategory === "ITBIS18" ? 0.18 : l.product.taxCategory === "ITBIS16" ? 0.16 : 0;
    // Precio CON ITBIS → el impuesto es la fracción incluida
    return s + (lineTotal(l) * rate) / (1 + rate);
  }, 0),
);
const subtotal = computed(() => total.value - itbis.value);
const itemCount = computed(() => cart.value.reduce((s, l) => s + l.qty, 0));

function money(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─────────────────────────── teclado ───────────────────────────

function onKeydown(e: KeyboardEvent) {
  if (e.key === "ArrowDown") {
    highlighted.value = Math.min(highlighted.value + 1, results.value.length - 1);
    e.preventDefault();
  } else if (e.key === "ArrowUp") {
    highlighted.value = Math.max(highlighted.value - 1, 0);
    e.preventDefault();
  } else if (e.key === "Enter") {
    const row = results.value[highlighted.value];
    if (row) addToCart(row);
    e.preventDefault();
  }
}

function stockColor(stock: number): string {
  if (stock <= 0) return "text-danger";
  if (stock <= 3) return "text-warning";
  return "text-text-dim";
}

onMounted(() => searchInput.value?.focus());
</script>

<template>
  <div class="flex h-screen flex-col bg-bg text-text">
    <!-- Aviso inequívoco de prototipo -->
    <div class="flex-none bg-warning/15 px-4 py-1.5 text-center text-xs font-semibold text-warning">
      PROTOTIPO · perfil Repuestos · datos de ejemplo — no vende de verdad
    </div>

    <div class="flex min-h-0 flex-1">
      <!-- Columna principal: buscador + grid -->
      <main class="flex min-w-0 flex-1 flex-col p-4">
        <!-- Buscador -->
        <div class="flex flex-none items-center gap-3">
          <label class="text-sm font-medium text-text-dim">Buscar por</label>
          <select
            v-model="field"
            class="rounded-lg border border-border bg-surface px-3 py-2 text-sm focus:border-primary focus:outline-none"
          >
            <option v-for="f in FIELDS" :key="f.value" :value="f.value">{{ f.label }}</option>
          </select>
          <div class="relative flex-1">
            <input
              ref="searchInput"
              v-model="query"
              type="text"
              placeholder="Escribe para buscar… (↑↓ para navegar, Enter para agregar)"
              class="w-full rounded-lg border-2 border-border bg-surface px-4 py-2.5 text-base focus:border-primary focus:outline-none"
              @keydown="onKeydown"
            />
          </div>
        </div>

        <!-- Grid de resultados -->
        <div class="mt-3 min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-surface">
          <table class="w-full text-sm">
            <thead class="sticky top-0 bg-zinc-100 text-left text-xs font-semibold text-text-dim">
              <tr>
                <th class="px-3 py-2">Código</th>
                <th class="px-3 py-2">Descripción</th>
                <th class="px-3 py-2">Referencia</th>
                <th class="px-3 py-2 text-right">Precio</th>
                <th class="px-3 py-2 text-right">Existencia</th>
                <th class="px-3 py-2">Ubicación</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(p, i) in results"
                :key="p.id"
                class="cursor-pointer border-t border-border"
                :class="i === highlighted ? 'bg-primary/10' : 'hover:bg-bg'"
                @click="highlighted = i"
                @dblclick="addToCart(p)"
              >
                <td class="monto px-3 py-2 text-text-dim">{{ p.code }}</td>
                <td class="px-3 py-2 font-medium">{{ p.name }}</td>
                <td class="monto px-3 py-2 text-text-dim">{{ p.reference ?? "—" }}</td>
                <td class="monto px-3 py-2 text-right font-semibold">{{ money(Number(p.price)) }}</td>
                <td class="monto px-3 py-2 text-right font-semibold" :class="stockColor(p.stock)">
                  {{ p.stock.toFixed(2) }}
                </td>
                <td class="px-3 py-2 text-text-dim">{{ p.location ?? "—" }}</td>
              </tr>
              <tr v-if="results.length === 0">
                <td colspan="6" class="px-3 py-10 text-center text-text-dim">
                  Sin coincidencias para «{{ query }}»
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p class="mt-2 flex-none text-xs text-text-dim">
          {{ results.length }} resultado(s) · existencia: snapshot del último sync ({{ lastSync }})
          · <span class="text-warning">ámbar</span> = poco stock ·
          <span class="text-danger">rojo</span> = agotado/negativo
        </p>
      </main>

      <!-- Panel del carrito (mock) -->
      <aside class="flex w-[400px] flex-none flex-col border-l border-border bg-surface">
        <div class="flex flex-none items-center justify-between border-b border-border px-4 py-3.5">
          <h2 class="text-[14.5px] font-extrabold">
            Venta <span class="monto text-[12.5px] font-semibold text-text-dim">#1043</span>
          </h2>
          <button
            type="button"
            class="text-xs font-semibold text-danger hover:opacity-80"
            :class="cart.length === 0 ? 'opacity-40' : ''"
            :disabled="cart.length === 0"
            @click="clearCart"
          >
            Vaciar
          </button>
        </div>

        <div class="min-h-0 flex-1 overflow-auto">
          <div v-if="cart.length === 0" class="flex h-full items-center justify-center px-6 text-center text-sm text-text-dim">
            Busca una pieza y presiona Enter (o doble-clic) para agregarla.
          </div>
          <ul v-else class="divide-y divide-border">
            <li v-for="line in cart" :key="line.product.id" class="px-4 py-2.5">
              <div class="flex items-start justify-between gap-2">
                <span class="text-sm font-medium">{{ line.product.name }}</span>
                <span class="monto flex-none text-sm font-semibold">{{ money(lineTotal(line)) }}</span>
              </div>
              <div class="mt-1 flex items-center justify-between">
                <span class="monto text-xs text-text-dim">{{ line.product.reference ?? line.product.code }}</span>
                <div class="flex items-center gap-2">
                  <button type="button" class="h-6 w-6 rounded-md border border-border text-primary" @click="step(line, -1)">−</button>
                  <span class="monto w-6 text-center text-sm">{{ line.qty }}</span>
                  <button type="button" class="h-6 w-6 rounded-md border border-border text-primary" @click="step(line, 1)">+</button>
                </div>
              </div>
            </li>
          </ul>
        </div>

        <!-- Totales -->
        <div class="flex-none border-t border-border px-4 py-3">
          <div class="flex justify-between text-sm text-text-dim">
            <span>Sub Total</span><span class="monto">{{ money(subtotal) }}</span>
          </div>
          <div class="flex justify-between text-sm text-text-dim">
            <span>ITBIS</span><span class="monto">{{ money(itbis) }}</span>
          </div>
          <div class="mt-1 flex justify-between border-t border-border pt-2 text-lg font-extrabold">
            <span>Total</span><span class="monto">RD$ {{ money(total) }}</span>
          </div>

          <label class="mt-3 flex items-center gap-2 text-sm">
            <input v-model="isCredit" type="checkbox" class="h-4 w-4" />
            Convertir venta a crédito (F9)
          </label>

          <button
            type="button"
            class="mt-3 min-h-14 w-full rounded-lg bg-primary text-lg font-semibold text-white hover:bg-primary-hi disabled:opacity-40"
            :disabled="cart.length === 0"
            @click="clearCart"
          >
            {{ isCredit ? "Cobrar a crédito" : "Cobrar" }} · {{ itemCount }} art. · RD$ {{ money(total) }}
          </button>
          <p class="mt-1.5 text-center text-[11px] text-text-dim">
            (prototipo: “Cobrar” solo vacía el carrito)
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>
