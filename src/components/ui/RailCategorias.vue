<script setup lang="ts">
import type { DepartmentCount } from "@/services/product-lookup";

/**
 * Rail de categorías (diseño Caja PRO): "Todos" + departamentos con conteo.
 * Filtra el grid del centro. Botones tabindex=-1 (no roban el foco del escáner).
 */
defineProps<{
  total: number;
  departments: DepartmentCount[];
  active: number | null; // null = Todos
}>();

const emit = defineEmits<{ seleccionar: [departmentId: number | null] }>();
</script>

<template>
  <aside class="w-[178px] flex-none overflow-y-auto border-r border-border bg-surface px-2 py-2.5">
    <div class="px-2.5 pt-2 pb-1.5 text-[10.5px] font-bold tracking-[0.06em] text-faint uppercase">
      Categorías
    </div>

    <button
      type="button"
      tabindex="-1"
      class="catb"
      :class="active === null ? 'on' : ''"
      @mousedown.prevent
      @click="emit('seleccionar', null)"
    >
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 6a3 3 0 0 1 3-3h2.25a3 3 0 0 1 3 3v2.25a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6Zm9.75 0a3 3 0 0 1 3-3H18a3 3 0 0 1 3 3v2.25a3 3 0 0 1-3 3h-2.25a3 3 0 0 1-3-3V6ZM3 15.75a3 3 0 0 1 3-3h2.25a3 3 0 0 1 3 3V18a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-2.25Zm9.75 0a3 3 0 0 1 3-3H18a3 3 0 0 1 3 3V18a3 3 0 0 1-3 3h-2.25a3 3 0 0 1-3-3v-2.25Z" /></svg>
      <span>Todos</span><span class="c">{{ total }}</span>
    </button>

    <button
      v-for="d in departments"
      :key="d.id"
      type="button"
      tabindex="-1"
      class="catb"
      :class="active === d.id ? 'on' : ''"
      @mousedown.prevent
      @click="emit('seleccionar', d.id)"
    >
      <svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M7.5 6v.75H5.513c-.96 0-1.764.724-1.865 1.679l-1.263 12A1.875 1.875 0 0 0 4.25 22.5h15.5a1.875 1.875 0 0 0 1.865-2.071l-1.263-12a1.875 1.875 0 0 0-1.865-1.679H16.5V6a4.5 4.5 0 1 0-9 0ZM12 3a3 3 0 0 0-3 3v.75h6V6a3 3 0 0 0-3-3Z" clip-rule="evenodd" /></svg>
      <span class="truncate">{{ d.name }}</span><span class="c">{{ d.count }}</span>
    </button>
  </aside>
</template>

<style scoped>
.catb {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 2px;
}
.catb svg {
  width: 18px;
  height: 18px;
  color: var(--color-faint);
  flex: none;
}
.catb .c {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-faint);
}
.catb:hover {
  background: var(--color-zinc-100);
}
.catb.on {
  background: color-mix(in srgb, var(--color-primary) 8%, transparent);
  color: var(--color-primary);
}
.catb.on svg,
.catb.on .c {
  color: var(--color-primary);
}
</style>
