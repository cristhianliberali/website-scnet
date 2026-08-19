/**
 * Cache do painel na memória do servidor.
 *
 * Existe por um motivo concreto: cada consulta atravessa o n8n, que atravessa o
 * cadastro do provedor. Sem cache, um F5 na página, um segundo componente
 * pedindo a mesma coisa ou um cliente clicando entre modais viram outras tantas
 * idas ao webhook — lentas para quem está na tela e caras para o n8n.
 *
 * O que vale saber antes de mexer:
 *
 * - **Mora na memória do processo.** Reiniciar o container ou subir uma segunda
 *   instância simplesmente esvazia o cache; ninguém depende dele para estar
 *   correto, só para ser rápido. É de propósito: dado de cliente em memória
 *   volátil some sozinho, dado em disco não.
 * - **A chave é o `id_cliente`.** Duas abas do mesmo cliente compartilham o
 *   mesmo retrato, e um cliente nunca alcança o de outro.
 * - **Prazo curto e invalidação explícita.** O TTL padrão é de 60 segundos, e
 *   todo formulário que muda algo derruba na hora as seções que ele afeta — o
 *   cliente que troca de plano não fica um minuto vendo o plano antigo.
 * - **Sai no logout.** Encerrar a sessão limpa o retrato daquele cliente.
 */

import type { DadosPainel } from "./cliente-tipos";
import type { SecaoPainel } from "./painel-tipos";

type Entrada = { dados: DadosPainel; expiraEm: number };

/** Segundos de validade de cada retrato. `PAINEL_CACHE_SECONDS=0` desliga o cache. */
function ttlSegundos(): number {
  const bruto = process.env["PAINEL_CACHE_SECONDS"];
  if (bruto === undefined || bruto.trim() === "") return 60;
  const valor = Number(bruto);
  if (!Number.isFinite(valor) || valor < 0) return 60;
  return Math.min(valor, 600);
}

/*
 * Teto de clientes guardados. Sem ele, um pico de acessos deixaria o retrato de
 * todo mundo na memória até o processo reiniciar. Ao estourar, os mais antigos
 * saem primeiro — o Map do JS preserva a ordem de inserção.
 */
const MAXIMO_DE_CLIENTES = 500;

const cache = new Map<string, Map<string, Entrada>>();

function chaveDeSecao(secao: SecaoPainel | "bootstrap"): string {
  return secao;
}

function podarVencidos(agora: number) {
  for (const [idCliente, secoes] of cache) {
    for (const [secao, entrada] of secoes) {
      if (entrada.expiraEm <= agora) secoes.delete(secao);
    }
    if (secoes.size === 0) cache.delete(idCliente);
  }
}

/** O retrato guardado, se ainda estiver no prazo. */
export function lerCachePainel(
  idCliente: string,
  secao: SecaoPainel | "bootstrap",
): DadosPainel | null {
  if (ttlSegundos() === 0) return null;
  const entrada = cache.get(idCliente)?.get(chaveDeSecao(secao));
  if (!entrada) return null;
  if (entrada.expiraEm <= Date.now()) {
    cache.get(idCliente)?.delete(chaveDeSecao(secao));
    return null;
  }
  return entrada.dados;
}

export function gravarCachePainel(
  idCliente: string,
  secao: SecaoPainel | "bootstrap",
  dados: DadosPainel,
) {
  const ttl = ttlSegundos();
  if (ttl === 0) return;

  const agora = Date.now();
  podarVencidos(agora);

  let secoes = cache.get(idCliente);
  if (!secoes) {
    if (cache.size >= MAXIMO_DE_CLIENTES) {
      const maisAntigo = cache.keys().next();
      if (!maisAntigo.done) cache.delete(maisAntigo.value);
    }
    secoes = new Map();
    cache.set(idCliente, secoes);
  }

  secoes.set(chaveDeSecao(secao), { dados, expiraEm: agora + ttl * 1000 });
}

/**
 * Derruba as seções que um formulário desatualizou.
 *
 * O `bootstrap` cai junto com qualquer seção: ele é o retrato inteiro, e uma
 * parte dele desatualizada desatualiza o todo.
 */
export function invalidarCachePainel(idCliente: string, secoes: readonly SecaoPainel[]) {
  const guardadas = cache.get(idCliente);
  if (!guardadas) return;

  guardadas.delete("bootstrap");
  for (const secao of secoes) guardadas.delete(secao);
  if (guardadas.size === 0) cache.delete(idCliente);
}

/** Esquece tudo o que se sabia deste cliente — chamado no logout. */
export function limparCachePainel(idCliente: string) {
  cache.delete(idCliente);
}
