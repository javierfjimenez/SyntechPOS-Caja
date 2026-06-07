<script setup lang="ts">
import { ref, watch } from "vue";

import BotonAccion from "@/components/ui/BotonAccion.vue";
import ModalBase from "@/components/ui/ModalBase.vue";
import { fromCents, toCents } from "@/lib/decimal";
import { formatMoney } from "@/lib/format";
import { searchCustomers, type CustomerRow } from "@/services/product-lookup";
import type { SaleCustomer } from "@/services/sale";

/**
 * BuscadorCliente (F4 — ui-caja §9.3): buscar por nombre/RNC/cédula en la
 * réplica local, o CREAR RÁPIDO (viaja inline en el evento → e-CF tipo 31).
 * Cliente moroso → aviso ámbar. Crédito muestra su límite disponible.
 */
const emit = defineEmits<{
  seleccionar: [customer: SaleCustomer | null];
  cerrar: [];
}>();

const term = ref("");
const results = ref<CustomerRow[]>([]);
const creating = ref(false);

// crear rápido
const newName = ref("");
const newDocument = ref("");
const newPhone = ref("");
const error = ref<string | null>(null);

let seq = 0;
watch(term, async (value) => {
  if (value.trim().length < 2) {
    results.value = [];
    return;
  }
  const s = ++seq;
  const found = await searchCustomers(value);
  if (s === seq) results.value = found;
});

function moroso(c: CustomerRow): boolean {
  if (c.credit_limit === null || c.credit_balance === null) return false;
  return toCents(c.credit_balance) > toCents(c.credit_limit);
}

function disponible(c: CustomerRow): string | null {
  if (c.credit_limit === null || toCents(c.credit_limit) === 0n) return null;
  return formatMoney(fromCents(toCents(c.credit_limit) - toCents(c.credit_balance ?? "0.00")));
}

function pick(c: CustomerRow) {
  emit("seleccionar", {
    id: c.id,
    name: c.name,
    document_type: c.document_type,
    document_number: c.document_number,
    phone: c.phone,
  });
}

function crearRapido() {
  const doc = newDocument.value.trim().replace(/\D/g, "");
  if (newName.value.trim().length < 3) {
    error.value = "Escribe el nombre del cliente.";
    return;
  }
  if (!/^\d{9}$|^\d{11}$/.test(doc)) {
    error.value = "RNC (9 dígitos) o cédula (11 dígitos).";
    return;
  }
  emit("seleccionar", {
    id: null, // inline: el servidor hace upsert por documento
    name: newName.value.trim(),
    document_type: doc.length === 9 ? "rnc" : "cedula",
    document_number: doc,
    phone: newPhone.value.trim() || null,
  });
}
</script>

<template>
  <ModalBase @cerrar="emit('cerrar')">
    <div class="flex w-[28rem] flex-col gap-4">
      <h2 class="text-xl font-bold text-text">Cliente</h2>

      <template v-if="!creating">
        <input
          v-model="term"
          type="text"
          placeholder="Nombre, RNC o cédula…"
          class="h-12 rounded-lg border border-border bg-surface px-3 text-base text-text outline-none focus:border-primary"
        />

        <ul v-if="results.length > 0" class="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          <li
            v-for="c in results"
            :key="c.id"
            class="cursor-pointer px-3 py-2.5 hover:bg-bg"
            @click="pick(c)"
          >
            <div class="flex items-center justify-between">
              <span class="font-medium text-text">{{ c.name }}</span>
              <span class="monto text-sm text-text-dim">{{ c.document_number }}</span>
            </div>
            <p v-if="moroso(c)" class="text-sm font-medium text-warning">
              ⚠ Cliente con balance vencido
            </p>
            <p v-else-if="disponible(c)" class="text-sm text-text-dim">
              Crédito disponible: <span class="monto">{{ disponible(c) }}</span>
            </p>
          </li>
        </ul>
        <p v-else-if="term.trim().length >= 2" class="py-2 text-center text-text-dim">
          Sin resultados para "{{ term }}"
        </p>

        <div class="flex justify-between gap-2 border-t border-border pt-3">
          <BotonAccion variante="secundario" @click="emit('seleccionar', null)">
            Consumidor final
          </BotonAccion>
          <BotonAccion @click="creating = true">Crear rápido</BotonAccion>
        </div>
      </template>

      <template v-else>
        <input
          v-model="newName"
          type="text"
          placeholder="Nombre completo o razón social"
          class="h-12 rounded-lg border border-border bg-surface px-3 text-base text-text outline-none focus:border-primary"
        />
        <input
          v-model="newDocument"
          type="text"
          inputmode="numeric"
          placeholder="RNC (9) o cédula (11)"
          class="monto h-12 rounded-lg border border-border bg-surface px-3 text-base text-text outline-none focus:border-primary"
        />
        <input
          v-model="newPhone"
          type="text"
          inputmode="tel"
          placeholder="Teléfono (opcional)"
          class="monto h-12 rounded-lg border border-border bg-surface px-3 text-base text-text outline-none focus:border-primary"
          @keydown.enter.prevent="crearRapido"
        />
        <p v-if="error" class="text-sm font-medium text-danger">{{ error }}</p>
        <div class="flex justify-end gap-2">
          <BotonAccion variante="secundario" @click="creating = false">Volver</BotonAccion>
          <BotonAccion @click="crearRapido">Usar este cliente</BotonAccion>
        </div>
      </template>
    </div>
  </ModalBase>
</template>
