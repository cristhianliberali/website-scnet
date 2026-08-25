/**
 * O estado da área do cliente, do jeito que as telas o consultam.
 *
 * Fica separado de `area-cliente-db.server.ts` porque quem chama são os
 * `loader` das rotas — que rodam no servidor durante o SSR e no navegador
 * durante a navegação. Uma server function atende os dois casos com a mesma
 * chamada, e o Postgres continua sendo tocado só do lado do servidor.
 */

import { createServerFn } from "@tanstack/react-start";

import { lerAreaCliente } from "./area-cliente-db.server";
import type { ConfigAreaCliente } from "./admin-tipos";

export const estadoAreaCliente = createServerFn({ method: "GET" }).handler(
  async (): Promise<ConfigAreaCliente> => lerAreaCliente(),
);
