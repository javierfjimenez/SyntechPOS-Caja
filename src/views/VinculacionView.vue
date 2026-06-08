<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";

import { ApiError } from "@/api/client";
import BotonAccion from "@/components/ui/BotonAccion.vue";
import {
  initialLockout,
  isLocked,
  registerFailure,
  remainingSeconds,
  type LockoutState,
} from "@/lib/lockout";
import { useCashierStore } from "@/stores/cashier";
import { useOutboxStore } from "@/stores/outbox";
import { useSyncStore } from "@/stores/sync";
import { useTerminalStore } from "@/stores/terminal";

/**
 * Pantalla 1 — Vinculación (ui-caja.md §2). Una sola vez por terminal; el
 * ÚNICO flujo que exige internet. Tras validar el código: bootstrap (datos
 * del ticket) + descarga del catálogo completo con progreso real.
 * 5 códigos errados → espera de 1 minuto.
 */
const router = useRouter();
const terminal = useTerminalStore();
const sync = useSyncStore();
const outbox = useOutboxStore();
const cashier = useCashierStore();

onMounted(() => void outbox.refresh());

const CODE_LENGTH = 6;
const fase = ref<"codigo" | "descargando">("codigo");
const codigo = ref("");
const enviando = ref(false);
const error = ref<string | null>(null);
const filas = ref(0);
const lock = ref<LockoutState>(initialLockout);
const ahora = ref(Date.now());

let timer: ReturnType<typeof setInterval> | undefined;

const espera = computed(() => remainingSeconds(lock.value, ahora.value));
const completo = computed(() => codigo.value.length === CODE_LENGTH);

async function descargarCatalogo() {
  fase.value = "descargando";
  error.value = null;
  await terminal.fetchBootstrap();
  const ok = await sync.syncNow(true, (rows) => (filas.value = rows));
  if (!ok) {
    throw new ApiError("La descarga del catálogo se interrumpió.", null);
  }
  cashier.logout(); // tras (re)vincular, la cajera vuelve a autenticarse
  await router.replace({ name: "login" });
}

async function vincular() {
  if (!completo.value || enviando.value || isLocked(lock.value, Date.now())) return;
  enviando.value = true;
  error.value = null;
  try {
    await terminal.link(codigo.value);
    await descargarCatalogo();
  } catch (e) {
    if (fase.value === "descargando") {
      // El código YA validó: solo falta repetir la descarga (botón Reintentar)
      error.value = "La descarga del catálogo se interrumpió. Revisa la conexión y reintenta.";
    } else {
      codigo.value = "";
      if (e instanceof ApiError && e.status === null) {
        error.value = "Sin conexión. Necesitas internet solo para este paso.";
      } else {
        error.value = e instanceof ApiError ? e.message : "Error inesperado. Intenta de nuevo.";
        lock.value = registerFailure(lock.value, Date.now());
      }
    }
  } finally {
    enviando.value = false;
  }
}

async function reintentarDescarga() {
  if (enviando.value) return;
  enviando.value = true;
  try {
    await descargarCatalogo();
  } catch {
    error.value = "La descarga del catálogo se interrumpió. Revisa la conexión y reintenta.";
  } finally {
    enviando.value = false;
  }
}

// Teclado físico: dígitos + Backspace + Enter — sin campo visible que apuntar
function onKeydown(e: KeyboardEvent) {
  if (fase.value !== "codigo") return;
  if (/^[0-9]$/.test(e.key) && codigo.value.length < CODE_LENGTH) {
    codigo.value += e.key;
    error.value = null;
  } else if (e.key === "Backspace") {
    codigo.value = codigo.value.slice(0, -1);
  } else if (e.key === "Enter") {
    void vincular();
  } else {
    return;
  }
  e.preventDefault();
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown);
  timer = setInterval(() => (ahora.value = Date.now()), 1000);
  // Reabrió la app con la descarga a medias (vinculada pero sin catálogo): retomar.
  // Si está REVOCADA, NO: el token está muerto, hay que re-vincular con código nuevo.
  if (terminal.linked && !terminal.revoked) {
    void reintentarDescarga();
  }
});
onUnmounted(() => {
  window.removeEventListener("keydown", onKeydown);
  clearInterval(timer);
});
</script>

<template>
  <main class="flex h-screen flex-col items-center justify-center gap-6 bg-bg px-8">
    <h1 class="text-4xl font-bold text-primary">SyntechPOS</h1>
    <p v-if="!terminal.revoked" class="text-xl text-text">Vincula esta caja a tu negocio</p>

    <!-- Terminal revocada por el servidor (token robado/desvinculado en el panel) -->
    <div
      v-if="terminal.revoked && fase === 'codigo'"
      class="max-w-lg rounded-lg border border-danger bg-danger/5 p-4 text-center"
    >
      <p class="text-lg font-bold text-danger">Esta caja fue desvinculada</p>
      <p class="mt-1 text-text-dim">
        El servidor revocó el acceso de esta caja. Pide un código nuevo en el panel
        (Configuración → Cajas) para reconectarla.
      </p>
      <p v-if="outbox.pending > 0" class="mt-2 text-sm font-medium text-warning">
        ⚠ Hay {{ outbox.pending }} evento{{ outbox.pending > 1 ? "s" : "" }} sin enviar. Al
        reconectar con credenciales nuevas podrían no recuperarse — repórtalo a soporte.
      </p>
    </div>

    <template v-if="fase === 'codigo'">
      <p v-if="!terminal.revoked" class="text-center text-text-dim">
        Pide el código en el panel del negocio:<br />
        <span class="font-medium text-text">Configuración → Cajas → Vincular caja</span>
      </p>

      <div class="flex gap-3 py-4" aria-label="Código de vinculación">
        <span
          v-for="i in CODE_LENGTH"
          :key="i"
          class="monto flex h-16 w-12 items-center justify-center rounded-lg border-2 bg-surface text-3xl font-bold"
          :class="i === codigo.length + 1 ? 'border-primary' : 'border-border'"
        >
          {{ codigo[i - 1] ?? "" }}
        </span>
      </div>

      <p v-if="espera > 0" class="font-medium text-warning">
        Demasiados intentos. Espera {{ espera }} segundos.
      </p>
      <p v-else-if="error" class="font-medium text-danger">{{ error }}</p>

      <BotonAccion grande :disabled="!completo || enviando || espera > 0" @click="vincular">
        {{ enviando ? "Vinculando…" : terminal.revoked ? "Reconectar caja" : "Vincular caja" }}
      </BotonAccion>
    </template>

    <template v-else>
      <div class="flex flex-col items-center gap-3 py-4">
        <p v-if="!error" class="text-lg text-text">
          ▸ Descargando catálogo…
          <span class="monto font-semibold">{{ filas.toLocaleString("en-US") }}</span> filas
        </p>
        <p v-else class="font-medium text-danger">{{ error }}</p>
      </div>

      <BotonAccion v-if="error" grande :disabled="enviando" @click="reintentarDescarga">
        {{ enviando ? "Descargando…" : "Reintentar descarga" }}
      </BotonAccion>
    </template>
  </main>
</template>
