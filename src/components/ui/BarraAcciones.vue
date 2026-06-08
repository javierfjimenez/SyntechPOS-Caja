<script setup lang="ts">
/**
 * Barra de accesos directos (herramienta de UX): saca a la vista las acciones
 * antes escondidas en el menú F10. Icono SVG inline + etiqueta. Todos los
 * botones son tabindex=-1: JAMÁS roban el foco del input de escaneo (§1).
 */
const emit = defineEmits<{
  calculadora: [];
  pantallaCompleta: [];
  recientes: [];
  gasto: [];
  cierre: [];
}>();
</script>

<template>
  <nav
    class="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-surface px-2 select-none"
  >
    <button
      type="button"
      tabindex="-1"
      class="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-text hover:bg-bg"
      title="Calculadora"
      @click="emit('calculadora')"
    >
      <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2H6zm1 3h6v2H7V5zm0 4h2v2H7V9zm0 4h2v2H7v-2zm4-4h2v6h-2V9z" />
      </svg>
      Calculadora
    </button>

    <button
      type="button"
      tabindex="-1"
      class="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-text hover:bg-bg"
      title="Pantalla completa (F11)"
      @click="emit('pantallaCompleta')"
    >
      <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M3 3h5v2H5v3H3V3zm9 0h5v5h-2V5h-3V3zM3 12h2v3h3v2H3v-5zm14 0v5h-5v-2h3v-3h2z" />
      </svg>
      Pantalla completa
    </button>

    <button
      type="button"
      tabindex="-1"
      class="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-text hover:bg-bg"
      title="Transacciones del turno"
      @click="emit('recientes')"
    >
      <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M10 3a7 7 0 100 14 7 7 0 000-14zm0 2a5 5 0 110 10A5 5 0 0110 5zm-.75 1.5v4l3 1.8.75-1.23-2.25-1.32V6.5h-1.5z" />
      </svg>
      Recientes
    </button>

    <span class="mx-1 h-5 w-px bg-border" aria-hidden="true"></span>

    <button
      type="button"
      tabindex="-1"
      class="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-text hover:bg-bg"
      title="Retiro / gasto de efectivo"
      @click="emit('gasto')"
    >
      <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M3 5a2 2 0 012-2h10a2 2 0 012 2v2H3V5zm0 4h14v6a2 2 0 01-2 2H5a2 2 0 01-2-2V9zm9 3a1 1 0 100 2h2a1 1 0 100-2h-2z" />
      </svg>
      Gasto
    </button>

    <button
      type="button"
      tabindex="-1"
      class="flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm text-text hover:bg-bg"
      title="Cierre de caja (arqueo)"
      @click="emit('cierre')"
    >
      <svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-1 1v8a1 1 0 001 1h10a1 1 0 001-1V8a1 1 0 00-1-1h-1V6a4 4 0 00-4-4zm-2 5V6a2 2 0 114 0v1H8zm2 3a1 1 0 011 1v2a1 1 0 11-2 0v-2a1 1 0 011-1z" />
      </svg>
      Cierre de caja
    </button>
  </nav>
</template>
