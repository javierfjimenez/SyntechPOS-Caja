import { ref } from "vue";

/**
 * Arranque resiliente de la caja.
 *
 * Al abrir la ventana, el guard del router necesita el IPC de Tauri (versión de
 * la app) y el plugin de SQLite (catalog_meta). Ninguno de los dos está
 * garantizado en el primer tick: la webview puede ejecutar el JS antes de que
 * el backend termine de registrarse, y la primera carga de la base corre además
 * las migraciones.
 *
 * Sin reintento, ese fallo transitorio rechazaba la promesa del guard,
 * vue-router abortaba la navegación y la caja se quedaba EN BLANCO hasta que
 * alguien recargaba a mano. Una caja que no arranca es una caja bloqueada
 * (regla #1) — así que aquí se reintenta, y si aun así no levanta, el error se
 * MUESTRA en vez de dejar la pantalla vacía.
 */

const MAX_ATTEMPTS = 6;
const BASE_DELAY_MS = 120;

/** Mensaje del último fallo de arranque; null = arrancó bien */
export const bootError = ref<string | null>(null);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ejecuta la carga inicial reintentando mientras el entorno se termina de
 * levantar (120ms → 240 → 480 → …, ~4 seg en total).
 *
 * @returns true si arrancó; false si agotó los intentos (con `bootError` puesto)
 */
export async function bootWithRetry(load: () => Promise<void>): Promise<boolean> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      await load();
      bootError.value = null;
      return true;
    } catch (error) {
      bootError.value = error instanceof Error ? error.message : String(error);
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(BASE_DELAY_MS * 2 ** attempt);
      }
    }
  }
  return false;
}
