<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

import ModalBase from "@/components/ui/ModalBase.vue";
import {
  clear,
  initialCalc,
  pressBackspace,
  pressDigit,
  pressDot,
  pressEquals,
  pressOp,
  pressPercent,
  type CalcState,
  type Op,
} from "@/lib/calculator";

/**
 * Calculadora de caja (herramienta de UX): aritmética exacta (lib/calculator),
 * teclado físico + botones. ModalBase devuelve el foco al input de escaneo al
 * cerrar (política de foco ui-caja §1).
 */
const emit = defineEmits<{ cerrar: [] }>();

const state = ref<CalcState>(initialCalc);

function digito(d: string) {
  state.value = pressDigit(state.value, d);
}
function operador(op: Op) {
  state.value = pressOp(state.value, op);
}
function igual() {
  state.value = pressEquals(state.value);
}
function punto() {
  state.value = pressDot(state.value);
}
function porciento() {
  state.value = pressPercent(state.value);
}
function borrar() {
  state.value = pressBackspace(state.value);
}
function limpiar() {
  state.value = clear();
}

// Teclas: dígitos, + - * /, Enter/= , % , Backspace , . , Escape (ModalBase)
function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") return; // lo maneja ModalBase
  if (/^[0-9]$/.test(e.key)) digito(e.key);
  else if (e.key === ".") punto();
  else if (e.key === "+" || e.key === "-" || e.key === "*" || e.key === "/") operador(e.key);
  else if (e.key === "Enter" || e.key === "=") igual();
  else if (e.key === "%") porciento();
  else if (e.key === "Backspace") borrar();
  else if (e.key.toLowerCase() === "c") limpiar();
  else return;
  e.preventDefault();
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => window.removeEventListener("keydown", onKeydown));

const teclas: { label: string; run: () => void; variant?: "op" | "clear" }[] = [
  { label: "C", run: limpiar, variant: "clear" },
  { label: "←", run: borrar, variant: "clear" },
  { label: "%", run: porciento, variant: "op" },
  { label: "÷", run: () => operador("/"), variant: "op" },
  { label: "7", run: () => digito("7") },
  { label: "8", run: () => digito("8") },
  { label: "9", run: () => digito("9") },
  { label: "×", run: () => operador("*"), variant: "op" },
  { label: "4", run: () => digito("4") },
  { label: "5", run: () => digito("5") },
  { label: "6", run: () => digito("6") },
  { label: "−", run: () => operador("-"), variant: "op" },
  { label: "1", run: () => digito("1") },
  { label: "2", run: () => digito("2") },
  { label: "3", run: () => digito("3") },
  { label: "+", run: () => operador("+"), variant: "op" },
];
</script>

<template>
  <ModalBase @cerrar="emit('cerrar')">
    <div class="flex w-72 flex-col gap-3">
      <h2 class="text-lg font-bold text-text">Calculadora</h2>

      <div
        class="monto flex h-16 items-center justify-end rounded-lg border border-border bg-bg px-4 text-3xl font-bold text-text"
        :class="state.error ? 'text-danger' : ''"
      >
        {{ state.display }}
      </div>

      <div class="grid grid-cols-4 gap-2">
        <button
          v-for="(t, i) in teclas"
          :key="i"
          type="button"
          tabindex="-1"
          class="h-14 rounded-lg text-xl font-semibold select-none"
          :class="
            t.variant === 'op'
              ? 'bg-primary/10 text-primary hover:bg-primary/20'
              : t.variant === 'clear'
                ? 'bg-bg text-text-dim hover:bg-border'
                : 'border border-border bg-surface text-text hover:bg-bg'
          "
          @click="t.run"
        >
          {{ t.label }}
        </button>
        <button
          type="button"
          tabindex="-1"
          class="col-span-2 h-14 rounded-lg border border-border bg-surface text-xl font-semibold text-text select-none hover:bg-bg"
          @click="digito('0')"
        >
          0
        </button>
        <button
          type="button"
          tabindex="-1"
          class="h-14 rounded-lg border border-border bg-surface text-xl font-semibold text-text select-none hover:bg-bg"
          @click="punto"
        >
          .
        </button>
        <button
          type="button"
          tabindex="-1"
          class="h-14 rounded-lg bg-primary text-2xl font-bold text-white select-none hover:bg-primary-hi"
          @click="igual"
        >
          =
        </button>
      </div>

      <button
        type="button"
        class="text-sm text-text-dim underline-offset-2 hover:underline"
        @click="emit('cerrar')"
      >
        Cerrar (ESC)
      </button>
    </div>
  </ModalBase>
</template>
