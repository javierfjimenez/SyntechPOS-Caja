<script setup lang="ts">
import ModalBase from "@/components/ui/ModalBase.vue";

/**
 * Shell de modal del diseño Caja PRO: header (título + X), body con scroll y
 * footer de acciones. Envuelve ModalBase (focus-trap + devolución de foco).
 * Slots: default = body; `footer` = botones.
 */
withDefaults(defineProps<{ title: string; size?: "sm" | "md" | "lg" }>(), { size: "md" });

const emit = defineEmits<{ cerrar: [] }>();

const widths = { sm: "w-[380px]", md: "w-[440px]", lg: "w-[520px]" };
</script>

<template>
  <ModalBase @cerrar="emit('cerrar')">
    <div :class="widths[size]" class="-m-6 flex max-h-[92vh] max-w-full flex-col overflow-hidden rounded-xl">
      <div class="flex flex-none items-center gap-2.5 border-b border-border px-5 py-4">
        <h3 class="flex-1 text-base font-extrabold">{{ title }}</h3>
        <button
          type="button"
          tabindex="-1"
          aria-label="Cerrar"
          class="grid h-[30px] w-[30px] place-items-center rounded-lg text-text-dim hover:bg-zinc-100"
          @mousedown.prevent
          @click="emit('cerrar')"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" class="h-[18px] w-[18px]"><path d="M5.47 5.47a.75.75 0 0 1 1.06 0L12 10.94l5.47-5.47a.75.75 0 1 1 1.06 1.06L13.06 12l5.47 5.47a.75.75 0 1 1-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 0 1-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 0 1 0-1.06Z" /></svg>
        </button>
      </div>

      <div class="overflow-y-auto px-5 py-[18px]">
        <slot />
      </div>

      <div v-if="$slots.footer" class="flex flex-none gap-2.5 px-5 pb-[18px]">
        <slot name="footer" />
      </div>
    </div>
  </ModalBase>
</template>
