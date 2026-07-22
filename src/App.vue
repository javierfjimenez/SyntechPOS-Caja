<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";

import PinAutorizacion from "@/components/ui/PinAutorizacion.vue";
import { bootError } from "@/lib/boot";

/**
 * Marco de la app. Kiosk (ui-caja.md §1): el intento de cerrar la ventana lo
 * intercepta Rust y emite kiosk:close-requested → aquí se pide el PIN de
 * supervisor y, si procede, se autoriza la salida.
 */
const pidiendoSalida = ref(false);
let unlisten: UnlistenFn | undefined;

/**
 * Arranque: hasta que la PRIMERA navegación resuelve, el guard está cargando la
 * base local (asíncrono) y el RouterView estaría vacío — se veía un destello del
 * fondo antes del login. El splash cubre ese hueco con la marca.
 */
const router = useRouter();
const arrancando = ref(true);

onMounted(async () => {
  await router.isReady();
  arrancando.value = false;

  unlisten = await listen("kiosk:close-requested", () => {
    pidiendoSalida.value = true;
  });
});
onUnmounted(() => unlisten?.());

async function salirAutorizado() {
  pidiendoSalida.value = false;
  await invoke("authorize_exit");
}

function reintentarArranque() {
  window.location.reload();
}
</script>

<template>
  <!--
    Fallback de arranque: se pinta SOLO cuando la caja no pudo cargar sus datos
    locales, es decir cuando la librería de UI todavía no tiene con qué operar.
    Por eso lleva estilo propio y no componentes de @/components/ui/.
  -->
  <div v-if="bootError !== null" class="arranque-fallido">
    <h1>La caja no pudo iniciar</h1>
    <p>No se pudo abrir la base de datos local ni leer la configuración del terminal.</p>
    <pre>{{ bootError }}</pre>
    <button type="button" @click="reintentarArranque">Reintentar</button>
    <p class="pie">Si se repite, avisa a soporte con el mensaje de arriba.</p>
  </div>

  <!-- Splash de arranque: marca sobre el fondo, sin destello de RouterView vacío -->
  <div v-else-if="arrancando" class="splash">
    <span class="splash-marca">SyntechPOS</span>
  </div>

  <RouterView v-else />

  <PinAutorizacion
    v-if="pidiendoSalida"
    accion="Salir de la caja"
    @autorizado="salirAutorizado"
    @cancelar="pidiendoSalida = false"
  />
</template>

<style scoped>
.arranque-fallido {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  min-height: 100vh;
  padding: 2rem;
  text-align: center;
  background: var(--color-surface, #fff);
  color: var(--color-text, #18181b);
}
.arranque-fallido h1 {
  font-size: 1.5rem;
  font-weight: 700;
}
.arranque-fallido pre {
  max-width: 40rem;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  background: rgb(0 0 0 / 0.05);
  font-family: "IBM Plex Mono", ui-monospace, monospace;
  font-size: 0.8125rem;
  white-space: pre-wrap;
  word-break: break-word;
}
.arranque-fallido button {
  padding: 0.75rem 2rem;
  min-height: 48px; /* target táctil de caja (ui-caja §11) */
  border-radius: 0.5rem;
  background: var(--color-primary, #4338ca);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
.arranque-fallido .pie {
  font-size: 0.8125rem;
  opacity: 0.7;
}

.splash {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--color-bg, #fafafa);
}
.splash-marca {
  font-size: 2rem;
  font-weight: 700;
  color: var(--color-primary, #4338ca);
  letter-spacing: -0.01em;
}
</style>
