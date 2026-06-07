<script setup lang="ts">
/**
 * Teclado numérico touch (Login, Apertura, Cobro, PinAutorizacion — ui-caja.md §11).
 * El teclado físico lo maneja la pantalla dueña; estos botones no roban el foco
 * (tabindex -1): el flujo por teclado jamás se interrumpe.
 */
const emit = defineEmits<{
  digito: [d: string];
  borrar: [];
  confirmar: [];
}>();

const teclas = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
</script>

<template>
  <div class="grid w-fit grid-cols-3 gap-2">
    <button
      v-for="t in teclas"
      :key="t"
      type="button"
      tabindex="-1"
      class="h-16 w-20 rounded-lg border border-border bg-surface text-2xl font-semibold text-text select-none hover:bg-bg active:bg-border"
      @click="emit('digito', t)"
    >
      {{ t }}
    </button>

    <button
      type="button"
      tabindex="-1"
      aria-label="Borrar"
      class="h-16 w-20 rounded-lg border border-border bg-surface text-2xl text-text-dim select-none hover:bg-bg active:bg-border"
      @click="emit('borrar')"
    >
      ←
    </button>
    <button
      type="button"
      tabindex="-1"
      class="h-16 w-20 rounded-lg border border-border bg-surface text-2xl font-semibold text-text select-none hover:bg-bg active:bg-border"
      @click="emit('digito', '0')"
    >
      0
    </button>
    <button
      type="button"
      tabindex="-1"
      aria-label="Confirmar"
      class="h-16 w-20 rounded-lg bg-primary text-2xl font-semibold text-white select-none hover:bg-primary-hi"
      @click="emit('confirmar')"
    >
      ✓
    </button>
  </div>
</template>
