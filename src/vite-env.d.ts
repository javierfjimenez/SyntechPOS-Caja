/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base de la API del servidor (con /api/v1) — ver .env */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
