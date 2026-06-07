<script setup lang="ts">
/** Pie con los atajos contextuales de la pantalla (ui-caja.md §11). */
defineProps<{
  atajos: { tecla: string; label: string }[];
}>();
</script>

<template>
  <footer
    class="flex h-10 shrink-0 items-center gap-6 border-t border-border bg-surface px-4 text-sm text-text-dim select-none"
  >
    <span v-for="a in atajos" :key="a.tecla" class="flex items-center gap-1.5">
      <kbd class="rounded border border-border bg-bg px-1.5 py-0.5 font-mono text-xs font-semibold text-text">{{
        a.tecla
      }}</kbd>
      {{ a.label }}
    </span>
  </footer>
</template>
