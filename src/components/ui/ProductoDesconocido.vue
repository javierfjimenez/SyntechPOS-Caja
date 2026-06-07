<script setup lang="ts">
import { onMounted, ref } from "vue";

import BotonAccion from "@/components/ui/BotonAccion.vue";
import ModalBase from "@/components/ui/ModalBase.vue";
import { listDepartments, logUnknownCode, type DepartmentRow } from "@/services/product-lookup";
import type { SaleLine } from "@/services/sale";
import { useTerminalStore } from "@/stores/terminal";

/**
 * Código no registrado (ui-caja §9.2): venta por departamento (product_id
 * null — M5) / Reintentar / Cancelar. El código queda en el log local que el
 * backoffice mostrará como candidatos a alta. La TASA la define el
 * departamento (@3a8fb67); el permiso viene de settings del bootstrap.
 */
const props = defineProps<{ code: string }>();

const emit = defineEmits<{
  agregar: [line: SaleLine];
  cerrar: [];
}>();

const terminal = useTerminalStore();

const departments = ref<DepartmentRow[]>([]);
const departmentId = ref<number | null>(null);
const price = ref("");
const error = ref<string | null>(null);

// settings del negocio: ¿se permite vender por departamento en esta caja?
const allowed = terminal.allowDepartmentSale;

onMounted(async () => {
  await logUnknownCode(props.code);
  departments.value = await listDepartments();
  departmentId.value = departments.value[0]?.id ?? null;
});

function agregar() {
  if (departmentId.value === null) return;
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(price.value.trim())) {
    error.value = "Escribe el precio (ej. 150.00)";
    return;
  }
  const dept = departments.value.find((d) => d.id === departmentId.value)!;
  const normalized = price.value.trim().includes(".")
    ? price.value.trim().padEnd(price.value.trim().indexOf(".") + 3, "0")
    : `${price.value.trim()}.00`;

  emit("agregar", {
    product_id: null,
    department_id: dept.id,
    description: `Venta ${dept.name}`,
    quantity: "1.000",
    unit_price: normalized,
    discount_amount: "0.00",
    tax_category: dept.tax_category, // la tasa la define el departamento
    unit_cost: "0.0000",
    is_weighable: false,
  });
}
</script>

<template>
  <ModalBase @cerrar="emit('cerrar')">
    <div class="flex w-96 flex-col gap-4">
      <h2 class="text-xl font-bold text-text">Producto no registrado</h2>
      <p class="text-text-dim">
        Código <span class="monto font-semibold text-text">{{ code }}</span> no está en el catálogo.
      </p>

      <p v-if="!allowed" class="rounded-lg bg-warning/10 px-3 py-2 text-sm font-medium text-warning">
        La venta por departamento está desactivada para este negocio.
        Pide al dueño activarla en el panel o registrar el producto.
      </p>

      <label v-if="allowed" class="flex flex-col gap-1 text-sm font-medium text-text-dim">
        Departamento
        <select
          v-model="departmentId"
          class="h-12 rounded-lg border border-border bg-surface px-3 text-base text-text outline-none focus:border-primary"
        >
          <option v-for="d in departments" :key="d.id" :value="d.id">{{ d.name }}</option>
        </select>
      </label>

      <label v-if="allowed" class="flex flex-col gap-1 text-sm font-medium text-text-dim">
        Precio
        <input
          v-model="price"
          type="text"
          inputmode="decimal"
          placeholder="0.00"
          class="monto h-12 rounded-lg border border-border bg-surface px-3 text-lg text-text outline-none focus:border-primary"
          @keydown.enter.prevent="agregar"
        />
      </label>

      <p v-if="error" class="text-sm font-medium text-danger">{{ error }}</p>

      <div class="flex justify-end gap-2">
        <BotonAccion variante="secundario" @click="emit('cerrar')">Cancelar</BotonAccion>
        <BotonAccion v-if="allowed" :disabled="departmentId === null" @click="agregar">
          Venta por departamento
        </BotonAccion>
      </div>
    </div>
  </ModalBase>
</template>
