<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

/**
 * Modal transversal (ui-caja.md §9): captura el foco completo (focus-trap),
 * ESC cierra y al desmontarse DEVUELVE el foco a quien lo tenía — el escáner
 * jamás dispara al vacío (política de foco §1).
 */
const emit = defineEmits<{ cerrar: [] }>();

const panel = ref<HTMLElement | null>(null);
let focoAnterior: HTMLElement | null = null;

function focusables(): HTMLElement[] {
  if (!panel.value) return [];
  return Array.from(
    panel.value.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute("disabled"));
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.stopPropagation();
    emit("cerrar");
    return;
  }
  if (e.key !== "Tab") return;
  const items = focusables();
  if (items.length === 0) {
    e.preventDefault();
    return;
  }
  const first = items[0]!;
  const last = items[items.length - 1]!;
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

onMounted(() => {
  focoAnterior = document.activeElement as HTMLElement | null;
  (focusables()[0] ?? panel.value)?.focus();
});

onUnmounted(() => {
  focoAnterior?.focus();
});
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-text/40"
      @keydown="onKeydown"
    >
      <div
        ref="panel"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        class="min-w-96 rounded-lg bg-surface p-6 shadow-lg focus:outline-none"
      >
        <slot />
      </div>
    </div>
  </Teleport>
</template>
