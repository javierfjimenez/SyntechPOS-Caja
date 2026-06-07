<script setup lang="ts">
import { useUiStore } from "@/stores/ui";

/**
 * Notificaciones (DISENO §6): éxito verde 3 seg, error rojo persistente con
 * botón de acción. Esquina superior derecha; también lleva el "Deshacer".
 */
const ui = useUiStore();
</script>

<template>
  <Teleport to="body">
    <div class="fixed top-12 right-4 z-50 flex w-80 flex-col gap-2">
      <div
        v-for="t in ui.toasts"
        :key="t.id"
        class="flex items-center justify-between gap-3 rounded-lg px-4 py-3 text-white shadow-lg"
        :class="t.kind === 'exito' ? 'bg-success' : 'bg-danger'"
      >
        <span class="text-[15px]">{{ t.text }}</span>
        <button
          v-if="t.action"
          type="button"
          tabindex="-1"
          class="shrink-0 rounded border border-white/60 px-2 py-1 text-sm font-semibold hover:bg-white/10"
          @click="t.action.run(); ui.dismiss(t.id)"
        >
          {{ t.action.label }}
        </button>
        <button
          v-else-if="t.kind === 'error'"
          type="button"
          tabindex="-1"
          aria-label="Cerrar"
          class="shrink-0 text-xl leading-none opacity-80 hover:opacity-100"
          @click="ui.dismiss(t.id)"
        >
          ×
        </button>
      </div>
    </div>
  </Teleport>
</template>
