<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { onMounted, onUnmounted, ref } from "vue";

import PinAutorizacion from "@/components/ui/PinAutorizacion.vue";

/**
 * Marco de la app. Kiosk (ui-caja.md §1): el intento de cerrar la ventana lo
 * intercepta Rust y emite kiosk:close-requested → aquí se pide el PIN de
 * supervisor y, si procede, se autoriza la salida.
 */
const pidiendoSalida = ref(false);
let unlisten: UnlistenFn | undefined;

onMounted(async () => {
  unlisten = await listen("kiosk:close-requested", () => {
    pidiendoSalida.value = true;
  });
});
onUnmounted(() => unlisten?.());

async function salirAutorizado() {
  pidiendoSalida.value = false;
  await invoke("authorize_exit");
}
</script>

<template>
  <RouterView />

  <PinAutorizacion
    v-if="pidiendoSalida"
    accion="Salir de la caja"
    @autorizado="salirAutorizado"
    @cancelar="pidiendoSalida = false"
  />
</template>
