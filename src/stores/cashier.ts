import { defineStore } from "pinia";

import { getDb, getMeta, setMeta } from "@/db";
import {
  initialLockout,
  isLocked,
  registerFailure,
  registerSuccess,
  remainingSeconds,
  type LockoutState,
} from "@/lib/lockout";
import { findSupervisorByPin, findUserByPin, type UserRow } from "@/services/auth";

/**
 * Cajero autenticado en ESTE terminal. El PIN se verifica offline contra la
 * réplica local de usuarios; la espera anti fuerza bruta sobrevive reinicios
 * (persistida en catalog_meta).
 */

interface CashierState {
  current: Pick<UserRow, "id" | "name" | "role"> | null;
  lock: LockoutState;
}

const LOCK_KEY = "pin_lock";

async function activeUsers(): Promise<UserRow[]> {
  const db = await getDb();
  return db.select<UserRow[]>(
    "SELECT id, name, role, pin_hash, is_active FROM users WHERE is_active = 1",
  );
}

export const useCashierStore = defineStore("cashier", {
  state: (): CashierState => ({
    current: null,
    lock: initialLockout,
  }),

  actions: {
    async loadLock() {
      const raw = await getMeta(LOCK_KEY);
      if (raw) this.lock = JSON.parse(raw) as LockoutState;
    },

    /** @returns segundos de espera restantes (0 = no hay bloqueo) */
    cooldown(now = Date.now()): number {
      return remainingSeconds(this.lock, now);
    },

    /**
     * @returns true si el PIN abrió sesión de cajero.
     * @throws nunca: el resultado negativo es parte del flujo normal.
     */
    async loginWithPin(pin: string, now = Date.now()): Promise<boolean> {
      if (isLocked(this.lock, now)) return false;

      const user = await findUserByPin(pin, await activeUsers());
      if (user === null) {
        this.lock = registerFailure(this.lock, now);
        await setMeta(LOCK_KEY, JSON.stringify(this.lock));
        return false;
      }

      this.lock = registerSuccess();
      await setMeta(LOCK_KEY, JSON.stringify(this.lock));
      this.current = { id: user.id, name: user.name, role: user.role };
      return true;
    },

    /** PinAutorizacion: valida supervisor/owner SIN cambiar el cajero actual */
    async verifySupervisorPin(pin: string): Promise<UserRow | null> {
      return findSupervisorByPin(pin, await activeUsers());
    },

    logout() {
      this.current = null;
    },
  },
});
