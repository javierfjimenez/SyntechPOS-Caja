<script setup lang="ts">
/**
 * Botón base de la caja (ui-caja.md §11): target mínimo 48px, radios rounded-lg.
 * Regla DISENO §3: UNA sola acción primary por pantalla.
 */
withDefaults(
  defineProps<{
    variante?: "primary" | "secundario" | "peligro";
    disabled?: boolean;
    grande?: boolean;
  }>(),
  { variante: "primary", disabled: false, grande: false },
);

const clases = {
  primary: "bg-primary text-white hover:bg-primary-hi",
  secundario: "bg-surface text-text border border-border hover:bg-bg",
  peligro: "bg-danger text-white hover:opacity-90",
};
</script>

<template>
  <button
    type="button"
    :disabled="disabled"
    class="min-h-12 rounded-lg px-6 font-semibold transition-colors select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-hi disabled:cursor-not-allowed disabled:opacity-40"
    :class="[clases[variante], grande ? 'min-h-16 text-xl' : 'text-lg']"
  >
    <slot />
  </button>
</template>
