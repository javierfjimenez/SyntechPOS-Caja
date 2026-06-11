<script setup lang="ts">
import { onMounted, ref } from "vue";

import ModalPro from "@/components/ui/ModalPro.vue";
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
  <ModalPro title="Producto no registrado" size="sm" @cerrar="emit('cerrar')">
    <p class="text-[13px] text-text-dim">
      Código <span class="monto font-semibold text-text">{{ code }}</span> no está en el catálogo.
    </p>

    <p v-if="!allowed" class="mt-3 rounded-lg bg-warning/10 px-3 py-2 text-sm font-medium text-warning">
      La venta por departamento está desactivada para este negocio.
      Pide al dueño activarla en el panel o registrar el producto.
    </p>

    <template v-if="allowed">
      <label class="mt-3.5 mb-1.5 block text-[12.5px] font-semibold">Departamento</label>
      <select v-model="departmentId" class="h-11 w-full rounded-lg border border-border px-3 text-sm focus:border-primary focus:outline-none">
        <option v-for="d in departments" :key="d.id" :value="d.id">{{ d.name }}</option>
      </select>

      <label class="mt-3.5 mb-1.5 block text-[12.5px] font-semibold">Precio</label>
      <input
        v-model="price"
        type="text"
        inputmode="decimal"
        placeholder="0.00"
        class="monto h-11 w-full rounded-lg border border-border px-3 text-lg focus:border-primary focus:outline-none"
        @keydown.enter.prevent="agregar"
      />
    </template>

    <p v-if="error" class="mt-2 text-sm font-medium text-danger">{{ error }}</p>

    <template #footer>
      <button type="button" tabindex="-1" class="h-[46px] flex-1 rounded-lg border border-border font-bold text-text-dim" @mousedown.prevent @click="emit('cerrar')">Cancelar</button>
      <button v-if="allowed" type="button" tabindex="-1" class="h-[46px] flex-1 rounded-lg bg-primary font-bold text-white disabled:opacity-50" :disabled="departmentId === null" @mousedown.prevent @click="agregar">
        Venta por departamento
      </button>
    </template>
  </ModalPro>
</template>
