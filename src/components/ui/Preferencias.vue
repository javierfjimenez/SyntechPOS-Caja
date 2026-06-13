<script setup lang="ts">
import ModalPro from "@/components/ui/ModalPro.vue";
import { soundAdd } from "@/lib/sounds";
import { useTerminalStore } from "@/stores/terminal";

/**
 * Preferencias locales de la caja (por terminal, no las dicta el servidor).
 * Hoy: sonidos de interacción. Al activarlos suena un blip de muestra.
 */
const emit = defineEmits<{ cerrar: [] }>();

const terminal = useTerminalStore();

async function toggleSonidos(on: boolean) {
  await terminal.setSounds(on);
  if (on) soundAdd(); // confirmación audible inmediata
}
</script>

<template>
  <ModalPro title="Preferencias" size="sm" @cerrar="emit('cerrar')">
    <div class="flex items-center gap-3 rounded-lg border border-border px-4 py-3.5">
      <span class="grid h-9 w-9 flex-none place-items-center rounded-lg bg-primary/10 text-primary">
        <svg viewBox="0 0 24 24" fill="currentColor" class="h-[19px] w-[19px]"><path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 0 0 1.5 12c0 .898.121 1.768.348 2.595.341 1.24 1.518 1.905 2.66 1.905H6.44l4.5 4.5c.944.945 2.56.276 2.56-1.06V4.06ZM18.584 5.106a.75.75 0 0 1 1.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 0 1-1.06-1.06 8.25 8.25 0 0 0 0-11.668.75.75 0 0 1 0-1.06Z" /><path d="M15.932 7.757a.75.75 0 0 1 1.061 0 6 6 0 0 1 0 8.486.75.75 0 0 1-1.06-1.061 4.5 4.5 0 0 0 0-6.364.75.75 0 0 1 0-1.06Z" /></svg>
      </span>
      <div class="min-w-0 flex-1">
        <div class="text-[13.5px] font-semibold">Sonidos de caja</div>
        <div class="text-[12px] text-text-dim">Blips al agregar, quitar, error y cobro.</div>
      </div>
      <button
        type="button"
        tabindex="-1"
        role="switch"
        :aria-checked="terminal.soundsEnabled"
        class="relative h-6 w-11 flex-none rounded-full transition-colors"
        :class="terminal.soundsEnabled ? 'bg-primary' : 'bg-border'"
        @mousedown.prevent
        @click="toggleSonidos(!terminal.soundsEnabled)"
      >
        <span
          class="absolute top-0.5 grid h-5 w-5 place-items-center rounded-full bg-white shadow transition-all"
          :class="terminal.soundsEnabled ? 'left-[22px]' : 'left-0.5'"
        ></span>
      </button>
    </div>

    <template #footer>
      <button
        type="button"
        tabindex="-1"
        class="h-[46px] flex-1 rounded-lg border border-border font-bold text-text-dim"
        @mousedown.prevent
        @click="emit('cerrar')"
      >
        Listo (ESC)
      </button>
    </template>
  </ModalPro>
</template>
