/**
 * A consulta de horários que a última etapa da contratação faz.
 *
 * Fica separada de `agenda-db.server.ts` pelo mesmo motivo de
 * `area-cliente.ts`: quem chama é o formulário no navegador, e uma server
 * function atende sem que a tabela de prazos e o Postgres saiam do servidor. O
 * cliente manda a cidade e recebe as datas — nunca a lista de cidades nem os
 * prazos das outras.
 *
 * **É um GET de propósito.** O guarda anti-abuso (`src/start.ts`) conta os POST
 * das server functions no limite de 15 por minuto por IP, que existe para
 * frear envio de formulário. Esta é uma leitura, e uma leitura que o cliente
 * pode repetir ao voltar e trocar a cidade — gastar a cota dele aqui devolveria
 * 429 no meio de uma contratação legítima.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { calcularAgenda, type AgendaInstalacao } from "./agenda-calculo";
import { fusoDaAgenda, lerAgendamento } from "./agenda-db.server";
import { LIMITES } from "./form-limits";

export const consultarAgendaInstalacao = createServerFn({ method: "GET" })
  .validator(z.object({ cidade: z.string().max(LIMITES.cidade).default("") }))
  .handler(async ({ data }): Promise<AgendaInstalacao> => {
    const config = await lerAgendamento();
    return calcularAgenda({
      config,
      cidade: data.cidade,
      agora: new Date(),
      fuso: fusoDaAgenda(),
    });
  });
