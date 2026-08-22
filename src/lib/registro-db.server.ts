/**
 * O que o cliente pede, gravado no banco.
 *
 * **Por que existe.** Até aqui um formulário do painel virava só uma chamada ao
 * n8n: se o fluxo do outro lado não guardasse nada, o pedido não existia em
 * lugar nenhum que o cliente pudesse consultar — nem protocolo, nem estado, nem
 * "em que pé está". Agora cada solicitação vira uma linha em `web_formularios`,
 * com protocolo gerado pelo banco e status que um humano move; é dela que sai a
 * seção "Atendimentos" do painel e a fila do /admin.
 *
 * A indicação segue por fora, em `indicacoes_web`: ela tem tabela própria,
 * bônus próprio e um extrato próprio na tela do cliente.
 *
 * **O carimbo da campanha.** Uma indicação nasce com as condições que valiam no
 * dia — nome da campanha, tipo de bônus, descrição e valor são copiados da
 * configuração vigente para dentro da linha. Trocar a campanha amanhã não
 * reescreve o que foi prometido hoje, e é isso que faz o extrato do cliente
 * continuar verdadeiro depois da terceira campanha do ano.
 */

import { env, getClient, identifier } from "./postgres.server";
import { lerConfigIndicacao } from "./config-db.server";
import { ROTULO_FORMULARIO, type FormularioPainel } from "./painel-tipos";
import type { DadosPainel, ValorJson } from "./cliente-tipos";

const schema = () => identifier(env("POSTGRES_SCHEMA"), "public", "POSTGRES_SCHEMA");

const tabelaFormularios = () =>
  identifier(env("POSTGRES_FORMULARIOS_TABLE"), "web_formularios", "POSTGRES_FORMULARIOS_TABLE");

const tabelaIndicacoes = () =>
  identifier(env("POSTGRES_INDICACOES_TABLE"), "indicacoes_web", "POSTGRES_INDICACOES_TABLE");

/* ---------------- leitura tolerante dos campos ---------------- */

const texto = (campos: DadosPainel, ...nomes: string[]): string => {
  for (const nome of nomes) {
    const valor = (campos as Record<string, ValorJson | undefined>)[nome];
    if (typeof valor === "string" && valor.trim()) return valor.trim();
    if (typeof valor === "number") return String(valor);
  }
  return "";
};

const cortar = (valor: string, max: number) => (valor.length > max ? valor.slice(0, max) : valor);

const ouNulo = (valor: string) => (valor ? valor : null);

/**
 * Como cada formulário se apresenta na tela de atendimentos.
 *
 * Sem isto, todo chamado apareceria como "trocar_plano" — o nome interno do
 * evento. O cliente não pediu um `trocar_plano`; ele pediu uma troca de plano,
 * e é isso que ele precisa reconhecer na lista três semanas depois.
 */
function resumoDaSolicitacao(formulario: FormularioPainel, campos: DadosPainel) {
  const categoria = ROTULO_FORMULARIO[formulario];
  const contrato = texto(campos, "id_contrato", "contrato", "numero_contrato");

  switch (formulario) {
    case "trocar_plano": {
      const plano = texto(campos, "plano");
      const valor = texto(campos, "valor_total", "valor_plano");
      return {
        categoria,
        assunto: plano ? `Troca para ${plano}` : categoria,
        descricao: valor ? `Novo valor mensal informado no pedido: ${valor}.` : "",
        contrato,
      };
    }
    case "mudanca_endereco": {
      const endereco = [
        texto(campos, "logradouro"),
        texto(campos, "numero"),
        texto(campos, "bairro"),
        texto(campos, "cidade"),
        texto(campos, "uf"),
      ]
        .filter(Boolean)
        .join(", ");
      const dataVisita = texto(campos, "data_visita");
      return {
        categoria,
        assunto: endereco ? `Mudança para ${endereco}` : categoria,
        descricao: dataVisita ? `Preferência de visita: ${dataVisita}.` : "",
        contrato,
      };
    }
    case "trocar_titular": {
      const novo = texto(campos, "novo_titular_nome") || nomeDoNovoTitular(campos);
      return {
        categoria,
        assunto: novo ? `Transferência para ${novo}` : categoria,
        descricao: "",
        contrato,
      };
    }
    case "abrir_chamado":
      return {
        categoria: texto(campos, "categoria") || categoria,
        assunto: texto(campos, "assunto") || categoria,
        descricao: texto(campos, "descricao"),
        contrato,
      };
    case "desbloqueio_confianca":
      return {
        categoria,
        assunto: categoria,
        descricao: `Pedido de liberação com faturas em aberto (${texto(campos, "valor_total") || "valor não informado"}).`,
        contrato,
      };
    default:
      return { categoria, assunto: categoria, descricao: "", contrato };
  }
}

/** O novo titular chega aninhado em `novo_titular`. */
function nomeDoNovoTitular(campos: DadosPainel): string {
  const bruto = (campos as Record<string, ValorJson | undefined>)["novo_titular"];
  if (bruto && typeof bruto === "object" && !Array.isArray(bruto)) {
    const nome = (bruto as Record<string, ValorJson>)["nome"];
    if (typeof nome === "string") return nome.trim();
  }
  return "";
}

/* ---------------- solicitações ---------------- */

/**
 * Grava a solicitação e devolve o protocolo que o banco gerou.
 *
 * Devolve `null` quando não deu para gravar — sem banco, sem tabela, coluna
 * faltando. Quem chamou segue com o que o n8n respondeu: um pedido que chegou
 * ao fluxo e não foi registrado aqui é melhor que um pedido recusado por causa
 * de uma migração que ninguém rodou.
 */
export async function registrarSolicitacao(
  idCliente: string,
  formulario: FormularioPainel,
  campos: DadosPainel,
): Promise<string | null> {
  const sql = getClient();
  if (!sql) return null;

  const resumo = resumoDaSolicitacao(formulario, campos);

  try {
    /*
     * `sql.json` e não `JSON.stringify`: o postgres.js serializa o objeto para a
     * coluna `jsonb` sozinho, e mandar o texto pronto faz ele serializar duas
     * vezes — o que fica gravado é uma string JSON, não um objeto, e nenhuma
     * consulta com `->>` acha mais nada lá dentro.
     */
    const linhas = (await sql`
      insert into ${sql(schema())}.${sql(tabelaFormularios())}
        (id_cliente, formulario, campos, categoria, assunto, descricao, cod_contrato)
      values (
        ${idCliente},
        ${formulario},
        ${sql.json(campos as never)},
        ${cortar(resumo.categoria, 120)},
        ${cortar(resumo.assunto, 180)},
        ${ouNulo(resumo.descricao)},
        ${ouNulo(resumo.contrato)}
      )
      returning protocolo
    `) as unknown as { protocolo: string }[];

    return linhas[0]?.protocolo ?? null;
  } catch (err) {
    console.error(
      `Não foi possível registrar a solicitação "${formulario}" do cliente ${idCliente}. ` +
        "Rode docs/n8n/schema-admin.sql se as colunas de protocolo/status ainda não existem.",
      err,
    );
    return null;
  }
}

/* ---------------- indicações ---------------- */

/**
 * Grava a indicação com o carimbo da campanha vigente.
 *
 * O valor só acompanha bônus em dinheiro: a restrição `indicacoes_web_valor_ck`
 * recusa "prêmio de R$ 50,00", que é a linha meio preenchida que ninguém sabe
 * depois se era para pagar ou para entregar.
 */
export async function registrarIndicacao(
  idCliente: string,
  nomeCliente: string,
  campos: DadosPainel,
): Promise<string | null> {
  const sql = getClient();
  if (!sql) return null;

  const nome = texto(campos, "nome_indicacao", "nome");
  const telefone = texto(campos, "telefone_indicacao", "telefone").replace(/\D/g, "");
  if (!nome || !telefone) return null;

  const config = await lerConfigIndicacao();
  const emDinheiro =
    config.campanhaTipoBonus === "pix" || config.campanhaTipoBonus === "desconto_fatura";
  const valor = emDinheiro ? config.campanhaValor.replace(",", ".").trim() : "";

  try {
    const linhas = (await sql`
      insert into ${sql(schema())}.${sql(tabelaIndicacoes())}
        (id_cliente, nome_cliente, nome_indicacao, telefone_indicacao, cidade, observacoes,
         campanha, tipo_bonus, descricao_bonus, valor_indicacao)
      values (
        ${idCliente},
        ${cortar(nomeCliente, 150)},
        ${cortar(nome, 150)},
        ${cortar(telefone, 20)},
        ${ouNulo(cortar(texto(campos, "cidade"), 120))},
        ${ouNulo(texto(campos, "observacoes"))},
        ${ouNulo(cortar(config.campanhaNome, 120))},
        ${config.campanhaTipoBonus || null}::public.tipo_bonus_indicacao,
        ${ouNulo(config.campanhaDescricaoBonus)},
        ${valor && Number.isFinite(Number(valor)) ? valor : null}::numeric
      )
      returning protocolo
    `) as unknown as { protocolo: string }[];

    return linhas[0]?.protocolo ?? null;
  } catch (err) {
    console.error(
      `Não foi possível registrar a indicação do cliente ${idCliente}. ` +
        "Rode docs/n8n/schema-upgrade-indicacoes.sql e schema-admin.sql.",
      err,
    );
    return null;
  }
}
