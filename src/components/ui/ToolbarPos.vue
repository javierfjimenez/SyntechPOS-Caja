<script setup lang="ts">
import { formatMoney } from "@/lib/format";

/**
 * Toolbar de funciones (diseño Caja PRO): accesos directos con icono + atajo.
 * Emite hacia VentaView, que enruta a los modales/acciones reales.
 */
defineProps<{
  propinaOn: boolean;
  heldCount: number;
  drawerCash: string;
}>();

const emit = defineEmits<{
  cliente: [];
  descuento: [];
  propina: [];
  suspender: [];
  recuperar: [];
  efectivo: [];
  devolucion: [];
  cerrar: [];
}>();
</script>

<template>
  <nav
    class="flex h-[52px] flex-none items-center gap-1.5 overflow-x-auto border-b border-border bg-surface px-3"
  >
    <button type="button" tabindex="-1" class="fn" @click="emit('cliente')">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" /></svg>
      <span class="fl">Cliente</span><span class="fk">F2</span>
    </button>

    <button type="button" tabindex="-1" class="fn" @click="emit('descuento')">
      <svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M9.493 2.853a.75.75 0 0 0-1.486-.205L7.545 6H4.198a.75.75 0 0 0 0 1.5h3.14l-.69 5H3.302a.75.75 0 0 0 0 1.5h3.14l-.435 3.148a.75.75 0 0 0 1.486.205L7.955 14h2.986l-.434 3.148a.75.75 0 0 0 1.486.205L12.456 14h3.346a.75.75 0 0 0 0-1.5h-3.14l.69-5h3.346a.75.75 0 0 0 0-1.5h-3.14l.435-3.147a.75.75 0 0 0-1.486-.205L11.545 6H8.559l.434-3.147ZM8.353 7.5l-.69 5h2.986l.69-5H8.353Z" clip-rule="evenodd" /></svg>
      <span class="fl">Descuento</span><span class="fk">F3</span>
    </button>

    <button type="button" tabindex="-1" class="fn" @click="emit('propina')">
      <svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm.75 3.75a.75.75 0 0 0-1.5 0v.816a3.836 3.836 0 0 0-1.72.756C8.818 8.138 8.418 8.92 8.418 9.75c0 .829.4 1.612 1.113 2.178.502.4 1.102.647 1.719.756v2.978a2.536 2.536 0 0 1-.921-.421l-.879-.66a.75.75 0 0 0-.9 1.2l.879.66c.533.4 1.169.645 1.821.75V18a.75.75 0 0 0 1.5 0v-.81a4.124 4.124 0 0 0 1.821-.749c.745-.559 1.179-1.344 1.179-2.191 0-.847-.434-1.632-1.179-2.191a4.122 4.122 0 0 0-1.821-.75V8.354c.29.082.559.213.786.393l.415.33a.75.75 0 0 0 .933-1.175l-.415-.33a3.836 3.836 0 0 0-1.719-.755V6Z" clip-rule="evenodd" /></svg>
      <span class="fl">{{ propinaOn ? "Propina ✓" : "Propina" }}</span><span class="fk">F4</span>
    </button>

    <button type="button" tabindex="-1" class="fn" @click="emit('suspender')">
      <svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M6.75 5.25a.75.75 0 0 1 .75-.75H9a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H7.5a.75.75 0 0 1-.75-.75V5.25Zm7.5 0A.75.75 0 0 1 15 4.5h1.5a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H15a.75.75 0 0 1-.75-.75V5.25Z" clip-rule="evenodd" /></svg>
      <span class="fl">En espera</span><span class="fk">F5</span>
    </button>

    <button type="button" tabindex="-1" class="fn" @click="emit('recuperar')">
      <svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M3 9.375C3 8.339 3.84 7.5 4.875 7.5h9.75c1.036 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-9.75A1.875 1.875 0 0 1 3 20.625V9.375Zm9.586 4.594a.75.75 0 0 0-1.172-.938l-2.476 3.096-.908-.907a.75.75 0 0 0-1.06 1.06l1.5 1.5a.75.75 0 0 0 1.116-.062l3-3.75Z" clip-rule="evenodd" /></svg>
      <span class="fl">Recuperar</span>
      <span v-if="heldCount > 0" class="cnt">{{ heldCount }}</span>
      <span class="fk">F6</span>
    </button>

    <button type="button" tabindex="-1" class="fn" @click="emit('efectivo')">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 7.5a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5Z" /><path fill-rule="evenodd" d="M1.5 4.875C1.5 3.839 2.34 3 3.375 3h17.25c1.035 0 1.875.84 1.875 1.875v9.75c0 1.036-.84 1.875-1.875 1.875H3.375A1.875 1.875 0 0 1 1.5 14.625v-9.75ZM8.25 9.75a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0Z" clip-rule="evenodd" /></svg>
      <span class="fl">Efectivo</span><span class="fk">F7</span>
    </button>

    <button type="button" tabindex="-1" class="fn" @click="emit('devolucion')">
      <svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M9.53 2.47a.75.75 0 0 1 0 1.06L4.81 8.25H15a6.75 6.75 0 0 1 0 13.5h-3a.75.75 0 0 1 0-1.5h3a5.25 5.25 0 1 0 0-10.5H4.81l4.72 4.72a.75.75 0 1 1-1.06 1.06l-6-6a.75.75 0 0 1 0-1.06l6-6a.75.75 0 0 1 1.06 0Z" clip-rule="evenodd" /></svg>
      <span class="fl">Devolución</span>
    </button>

    <span class="flex-1"></span>

    <span class="flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-semibold text-text-dim">
      <svg viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4 text-success"><path d="M5.25 9a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h13.5a3 3 0 0 0 3-3v-6a3 3 0 0 0-3-3H15a.75.75 0 0 0-.75.75 2.25 2.25 0 0 1-4.5 0A.75.75 0 0 0 9 9H5.25Z" /><path d="M2.25 7.125A2.625 2.625 0 0 1 4.875 4.5h14.25a2.625 2.625 0 0 1 2.598 2.244 4.5 4.5 0 0 0-2.598-.744H4.875c-.944 0-1.82.29-2.544.787-.052-.218-.081-.444-.081-.662Z" /></svg>
      Efectivo en caja: <b class="monto text-text">{{ formatMoney(drawerCash) }}</b>
    </span>

    <button type="button" tabindex="-1" class="fn danger" @click="emit('cerrar')">
      <svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Zm3.75 8.25v-3a3.75 3.75 0 1 0-7.5 0v3h7.5Z" clip-rule="evenodd" /></svg>
      <span class="fl">Cerrar caja</span><span class="fk">F8</span>
    </button>
  </nav>
</template>

<style scoped>
.fn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 7px 11px;
  white-space: nowrap;
  position: relative;
  transition: 0.12s;
}
.fn:hover {
  background: var(--color-zinc-100);
  border-color: color-mix(in srgb, var(--color-primary) 25%, transparent);
}
.fn svg {
  width: 17px;
  height: 17px;
  color: var(--color-primary);
}
.fn .fl {
  font-size: 13px;
  font-weight: 600;
}
.fn .fk {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--color-faint);
  background: var(--color-zinc-100);
  padding: 1px 5px;
  border-radius: 4px;
}
.fn .cnt {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 18px;
  height: 18px;
  border-radius: 999px;
  background: var(--color-warning);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  display: grid;
  place-items: center;
  padding: 0 4px;
}
.fn.danger svg {
  color: var(--color-danger);
}
.fn.danger:hover {
  border-color: color-mix(in srgb, var(--color-danger) 25%, transparent);
}
</style>
