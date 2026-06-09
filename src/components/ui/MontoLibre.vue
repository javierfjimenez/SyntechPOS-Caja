<script setup lang="ts">
import { onMounted, ref } from "vue";

import ModalPro from "@/components/ui/ModalPro.vue";
import { listDepartments, type DepartmentRow } from "@/services/product-lookup";
import type { SaleLine } from "@/services/sale";

/**
 * Monto libre (diseño Caja PRO): línea a precio manual (product_id null, venta
 * por departamento — M5). Checkbox de ITBIS. La tasa la fija el departamento;
 * si la cajera marca "sin ITBIS" se usa EXENTO. Respeta allow_department_sale.
 */
const emit = defineEmits<{ agregar: [line: SaleLine]; cerrar: [] }>();

const departments = ref<DepartmentRow[]>([]);
const name = ref("");
const price = ref("");
const conItbis = ref(true);
const error = ref<string | null>(null);

onMounted(async () => {
  departments.value = await listDepartments();
});

function agregar() {
  const p = price.value.trim();
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(p) || Number(p) <= 0) {
    error.value = "Indica un precio válido.";
    return;
  }
  const dept = departments.value[0];
  if (dept === undefined) {
    error.value = "No hay departamentos en el catálogo.";
    return;
  }
  const normalized = Number(p).toFixed(2);
  emit("agregar", {
    product_id: null,
    department_id: dept.id,
    description: name.value.trim() || "Venta rápida",
    quantity: "1.000",
    unit_price: normalized,
    discount_amount: "0.00",
    // con ITBIS usa la tasa del departamento; sin ITBIS, EXENTO
    tax_category: conItbis.value ? dept.tax_category : "EXENTO",
    unit_cost: "0.0000",
    is_weighable: false,
  });
}
</script>

<template>
  <ModalPro title="Monto libre" size="sm" @cerrar="emit('cerrar')">
    <label class="mb-1.5 block text-[12.5px] font-semibold">Descripción</label>
    <input
      v-model="name"
      class="mb-3.5 h-11 w-full rounded-lg border border-border px-3.5 text-sm focus:border-primary focus:outline-none"
      placeholder="Ej. Servicio / artículo varios"
    />

    <label class="mb-1.5 block text-[12.5px] font-semibold">Precio (RD$)</label>
    <input
      v-model="price"
      class="monto h-11 w-full rounded-lg border border-border px-3.5 text-sm focus:border-primary focus:outline-none"
      inputmode="decimal"
      placeholder="0.00"
      @keydown.enter.prevent="agregar"
    />

    <label class="mt-3.5 flex cursor-pointer items-center gap-2 text-[13px] font-semibold">
      <input v-model="conItbis" type="checkbox" class="h-4 w-4 accent-primary" />
      Aplica ITBIS
    </label>

    <p v-if="error" class="mt-2 text-sm font-medium text-danger">{{ error }}</p>

    <template #footer>
      <button type="button" tabindex="-1" class="h-[46px] flex-1 rounded-lg border border-border font-bold text-text-dim" @mousedown.prevent @click="emit('cerrar')">Cancelar</button>
      <button type="button" tabindex="-1" class="h-[46px] flex-1 rounded-lg bg-primary font-bold text-white" @mousedown.prevent @click="agregar">Agregar</button>
    </template>
  </ModalPro>
</template>
