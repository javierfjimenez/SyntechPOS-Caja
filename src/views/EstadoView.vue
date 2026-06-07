<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";

import BarraEstado from "@/components/ui/BarraEstado.vue";
import BotonAccion from "@/components/ui/BotonAccion.vue";
import PieAtajos from "@/components/ui/PieAtajos.vue";
import ToastCaja from "@/components/ui/ToastCaja.vue";
import { formatTime } from "@/lib/format";
import { printTest } from "@/services/printer";
import { reprintStamped } from "@/services/reprint";
import { useCashierStore } from "@/stores/cashier";
import { useEcfStore } from "@/stores/ecf";
import { useOutboxStore } from "@/stores/outbox";
import { useSessionStore } from "@/stores/session";
import { useSyncStore } from "@/stores/sync";
import { useTerminalStore } from "@/stores/terminal";
import { useUiStore } from "@/stores/ui";

/**
 * Pantalla 8 — Estado de la caja (ui-caja §8): la "consola de confianza".
 * Todo lo que el dueño/soporte pregunta por teléfono está aquí.
 */
const router = useRouter();
const terminal = useTerminalStore();
const outbox = useOutboxStore();
const sync = useSyncStore();
const ecf = useEcfStore();
const session = useSessionStore();
const cashier = useCashierStore();
const ui = useUiStore();

const ahora = ref(Date.now());
const ventasSesion = ref<number | null>(null);
let timer: ReturnType<typeof setInterval> | undefined;

const conexionLabel = computed(() => {
  if (terminal.revoked) return "● Terminal desvinculada — contacta al administrador";
  if (!terminal.online) return "● Sin conexión (la caja sigue operando)";
  const hace = terminal.lastServerContact === null ? null : Math.round((ahora.value - terminal.lastServerContact) / 1000);
  return hace === null ? "● En línea" : `● En línea (servidor respondió hace ${hace} seg)`;
});

const conexionColor = computed(() =>
  terminal.revoked ? "text-danger" : terminal.online ? "text-success" : "text-warning",
);

onMounted(() => {
  timer = setInterval(() => (ahora.value = Date.now()), 1000);
  void outbox.refresh();
  void ecf.refresh();
  void session.activity().then((a) => (ventasSesion.value = a.salesCount)).catch(() => {});
  window.addEventListener("keydown", onKeydown);
});
onUnmounted(() => {
  clearInterval(timer);
  window.removeEventListener("keydown", onKeydown);
});

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && !ui.modalOpen) void router.replace({ name: "venta" });
}

async function sincronizarAhora() {
  await outbox.drainNow();
  const ok = await sync.syncNow();
  ui.toast(ok ? "exito" : "error", ok ? "Sincronizado." : "Sin conexión con el servidor.");
}

async function actualizarCatalogo() {
  const ok = await sync.syncNow();
  ui.toast(ok ? "exito" : "error", ok ? `Catálogo en versión ${sync.catalogVersion}.` : "Sin conexión.");
}

async function prueba() {
  try {
    await printTest();
    ui.toast("exito", "Página de prueba enviada.");
  } catch (e) {
    ui.toast("error", e instanceof Error ? e.message : String(e));
  }
}

async function reimprimir(saleUlid: string, ticket: number) {
  try {
    await reprintStamped(saleUlid);
    ui.toast("exito", `Ticket #${ticket} reimpreso.`);
  } catch (e) {
    ui.toast("error", e instanceof Error ? e.message : String(e));
  }
}
</script>

<template>
  <div class="flex h-screen flex-col bg-bg">
    <BarraEstado />

    <main class="flex flex-1 flex-col gap-3 overflow-y-auto p-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold text-text">Estado de la caja</h1>
        <button type="button" class="text-sm text-text-dim hover:underline" @click="router.replace({ name: 'venta' })">
          ESC volver
        </button>
      </div>

      <dl class="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        <div class="grid grid-cols-[11rem_1fr_auto] items-center gap-3 px-4 py-3">
          <dt class="text-text-dim">Conexión</dt>
          <dd :class="conexionColor" class="font-medium">{{ conexionLabel }}</dd>
          <span></span>
        </div>

        <div class="grid grid-cols-[11rem_1fr_auto] items-center gap-3 px-4 py-3">
          <dt class="text-text-dim">Pendientes envío</dt>
          <dd>{{ outbox.pending }} eventos en cola</dd>
          <BotonAccion variante="secundario" @click="sincronizarAhora">Sincronizar ahora</BotonAccion>
        </div>

        <div v-if="terminal.ecfEnabled" class="grid grid-cols-[11rem_1fr_auto] items-start gap-3 px-4 py-3">
          <dt class="text-text-dim">Comprobantes</dt>
          <dd>
            {{ ecf.pendingCount }} ventas esperando QR
            <ul v-if="ecf.pending.some((p) => p.resolved)" class="mt-1 space-y-1">
              <li v-for="p in ecf.pending.filter((x) => x.resolved)" :key="p.sale_ulid" class="text-sm">
                Ticket #{{ p.ticket_number }} — QR listo
                <button type="button" class="ml-2 font-medium text-primary hover:underline" @click="reimprimir(p.sale_ulid, p.ticket_number)">
                  Reimprimir timbrado
                </button>
              </li>
            </ul>
          </dd>
          <BotonAccion variante="secundario" @click="ecf.poll">Consultar ahora</BotonAccion>
        </div>

        <div class="grid grid-cols-[11rem_1fr_auto] items-center gap-3 px-4 py-3">
          <dt class="text-text-dim">Catálogo</dt>
          <dd>
            versión {{ sync.catalogVersion }}
            <template v-if="sync.lastSyncAt"> · actualizado {{ formatTime(new Date(sync.lastSyncAt)) }}</template>
          </dd>
          <BotonAccion variante="secundario" @click="actualizarCatalogo">Actualizar ahora</BotonAccion>
        </div>

        <div class="grid grid-cols-[11rem_1fr_auto] items-center gap-3 px-4 py-3">
          <dt class="text-text-dim">Impresora</dt>
          <dd>configurada en menú F10 → Impresora</dd>
          <BotonAccion variante="secundario" @click="prueba">Imprimir prueba</BotonAccion>
        </div>

        <div class="grid grid-cols-[11rem_1fr_auto] items-center gap-3 px-4 py-3">
          <dt class="text-text-dim">Sesión actual</dt>
          <dd>
            <template v-if="session.isOpen">
              abierta {{ formatTime(new Date(session.openedAt!)) }}
              <template v-if="ventasSesion !== null"> · {{ ventasSesion }} ventas</template>
              · {{ cashier.current?.name }}
            </template>
            <template v-else>sin sesión</template>
          </dd>
          <span></span>
        </div>

        <div class="grid grid-cols-[11rem_1fr_auto] items-center gap-3 px-4 py-3">
          <dt class="text-text-dim">App</dt>
          <dd>
            v{{ terminal.appVersion }}
            <span v-if="terminal.updateRequired" class="font-medium text-warning">
              — ACTUALIZACIÓN REQUERIDA (puedes seguir vendiendo; el envío de ventas no se bloquea)
            </span>
            <span v-else class="text-success">(al día)</span>
          </dd>
          <span></span>
        </div>
      </dl>
    </main>

    <PieAtajos :atajos="[{ tecla: 'ESC', label: 'Volver a la venta' }]" />
    <ToastCaja />
  </div>
</template>
