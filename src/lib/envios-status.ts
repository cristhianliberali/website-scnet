/**
 * Como o veredito do webhook vira o status gravado no envio.
 *
 * Fica em arquivo próprio, e não dentro do `envios-db.server.ts`, porque os
 * dois formulários precisam desta tradução e o módulo do banco é `.server` —
 * importá-lo só por causa de uma função de três linhas arrastaria o driver do
 * Postgres para dentro de quem só queria classificar uma resposta.
 *
 * A distinção que interessa está entre as duas últimas linhas: "falhou no CRM"
 * é problema a resolver, "sem CRM configurado" é o ambiente de desenvolvimento.
 * Na tela do /admin, confundir os dois faria toda máquina de teste parecer um
 * incidente.
 */

import type { StatusEnvio } from "./envios-tipos";
import type { WebhookOutcome } from "./webhook";

export function statusDoWebhook(outcome: WebhookOutcome): StatusEnvio {
  if (outcome.reason === "not_configured") return "sem_webhook";
  return outcome.ok ? "webhook_ok" : "webhook_erro";
}
