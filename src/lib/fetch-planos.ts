import { createServerFn } from "@tanstack/react-start";
import { loadPlanos } from "./planos-db";
import type { Plan } from "./plans";

/**
 * Planos exibidos na home e no formulário de contratação.
 *
 * Chamado pelos loaders das rotas, então a lista já vem renderizada no HTML
 * (SSR) — o Postgres é acessado só no servidor, nunca pelo navegador.
 */
export const fetchPlanos = createServerFn({ method: "GET" }).handler(async (): Promise<Plan[]> =>
  loadPlanos(),
);
