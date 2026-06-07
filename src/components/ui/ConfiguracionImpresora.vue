<script setup lang="ts">
import { onMounted, ref } from "vue";

import BotonAccion from "@/components/ui/BotonAccion.vue";
import ModalBase from "@/components/ui/ModalBase.vue";
import { getPrinterConfig, printTest, savePrinterConfig } from "@/services/printer";
import { useUiStore } from "@/stores/ui";

/**
 * Configuración de la impresora (menú F10): USB o red + página de prueba.
 * La pantalla de Estado (4.10) mostrará el estado en vivo.
 */
const emit = defineEmits<{ cerrar: [] }>();

const ui = useUiStore();
const transport = ref<"usb" | "network">("usb");
const host = ref("");
const testing = ref(false);

onMounted(async () => {
  const config = await getPrinterConfig();
  transport.value = config.transport;
  host.value = config.host ?? "";
});

async function guardar() {
  await savePrinterConfig({ transport: transport.value, host: host.value.trim() || null });
  ui.toast("exito", "Impresora configurada.");
  emit("cerrar");
}

async function prueba() {
  if (testing.value) return;
  testing.value = true;
  try {
    await savePrinterConfig({ transport: transport.value, host: host.value.trim() || null });
    await printTest();
    ui.toast("exito", "Página de prueba enviada. Revisa la impresora.");
  } catch (e) {
    ui.toast("error", e instanceof Error ? e.message : String(e));
  } finally {
    testing.value = false;
  }
}
</script>

<template>
  <ModalBase @cerrar="emit('cerrar')">
    <div class="flex w-96 flex-col gap-4">
      <h2 class="text-xl font-bold text-text">Impresora</h2>

      <div class="flex flex-col gap-2">
        <label class="flex items-center gap-2 text-text">
          <input v-model="transport" type="radio" value="usb" class="accent-primary" />
          USB (conectada a esta caja)
        </label>
        <label class="flex items-center gap-2 text-text">
          <input v-model="transport" type="radio" value="network" class="accent-primary" />
          Red (Ethernet/WiFi)
        </label>
      </div>

      <label v-if="transport === 'network'" class="flex flex-col gap-1 text-sm font-medium text-text-dim">
        IP de la impresora
        <input
          v-model="host"
          type="text"
          inputmode="numeric"
          placeholder="192.168.1.50"
          class="monto h-12 rounded-lg border border-border bg-surface px-3 text-base text-text outline-none focus:border-primary"
        />
      </label>

      <div class="flex justify-between gap-2 pt-2">
        <BotonAccion variante="secundario" :disabled="testing" @click="prueba">
          {{ testing ? "Imprimiendo…" : "Imprimir prueba" }}
        </BotonAccion>
        <div class="flex gap-2">
          <BotonAccion variante="secundario" @click="emit('cerrar')">Cancelar</BotonAccion>
          <BotonAccion @click="guardar">Guardar</BotonAccion>
        </div>
      </div>
    </div>
  </ModalBase>
</template>
