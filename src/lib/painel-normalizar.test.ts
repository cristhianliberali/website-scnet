import { expect, test } from "bun:test";
import { mesclarPainel, normalizarPainel, respostaTrazPainel } from "./painel-normalizar";

test("aceita snake_case, camelCase e os apelidos em inglês", () => {
  const painel = normalizarPainel({
    cliente: { id: 42, nome: "Ana Souza", cpf_cnpj: "000.000.000-00" },
    contracts: [{ id: "c1", contractNumber: "CTR-1", planName: "600 Mega", monthlyValue: 129.9 }],
  });

  expect(painel.cliente.id).toBe("42");
  expect(painel.cliente.documento).toBe("000.000.000-00");
  expect(painel.contratos[0]?.numero).toBe("CTR-1");
  expect(painel.contratos[0]?.plano).toBe("600 Mega");
  expect(painel.contratos[0]?.valorMensal).toBe(129.9);
});

test("lê valores em pt-BR, em texto e com símbolo de moeda", () => {
  const painel = normalizarPainel({
    faturas: [
      { id: "f1", valor: "1.234,56" },
      { id: "f2", valor: "R$ 89,90" },
      { id: "f3", valor: "219.90" },
      { id: "f4", valor: 15 },
    ],
  });

  expect(painel.faturas.map((f) => f.valor)).toEqual([1234.56, 89.9, 219.9, 15]);
});

test("encaixa status desconhecido no padrão em vez de quebrar", () => {
  const painel = normalizarPainel({
    faturas: [
      { id: "f1", status: "LIQUIDADO" },
      { id: "f2", status: "coisa nenhuma" },
    ],
    contratos: [{ id: "c1", status_financeiro: "Em Dia", status_conexao: "SUSPENSO" }],
  });

  expect(painel.faturas[0]?.status).toBe("pago");
  expect(painel.faturas[1]?.status).toBe("aberto");
  expect(painel.contratos[0]?.statusFinanceiro).toBe("em_dia");
  expect(painel.contratos[0]?.statusConexao).toBe("offline");
});

test("aceita a lista dentro de um envelope por seção", () => {
  const painel = normalizarPainel({ faturas: { itens: [{ id: "f1", valor: 10 }] } });
  expect(painel.faturas).toHaveLength(1);
  expect(painel.faturas[0]?.id).toBe("f1");
});

test("resposta sem nenhuma parte do painel não dispara recarga", () => {
  expect(respostaTrazPainel({ protocolo: "2026-1" })).toBe(false);
  expect(respostaTrazPainel({ faturas: [] })).toBe(true);
  expect(respostaTrazPainel({ painel: { chamados: [] } })).toBe(true);
});

test("mesclar troca só o que veio na resposta", () => {
  const atual = normalizarPainel({
    cliente: { nome: "Ana" },
    faturas: [{ id: "f1", status: "aberto" }],
    chamados: [{ id: "t1", assunto: "antigo" }],
  });

  const depois = mesclarPainel(atual, { chamados: [{ id: "t2", assunto: "novo" }] });

  expect(depois.chamados.map((c) => c.id)).toEqual(["t2"]);
  // não veio na resposta, então continua como estava
  expect(depois.faturas).toEqual(atual.faturas);
  expect(depois.cliente.nome).toBe("Ana");
});

test("mesclar aceita as listas dentro de `painel`", () => {
  const atual = normalizarPainel({ faturas: [{ id: "f1" }] });
  const depois = mesclarPainel(atual, { painel: { faturas: [{ id: "f2" }, { id: "f3" }] } });
  expect(depois.faturas.map((f) => f.id)).toEqual(["f2", "f3"]);
});

test("uma lista vazia na resposta apaga a lista — não é ausência de dado", () => {
  const atual = normalizarPainel({ faturas: [{ id: "f1" }] });
  const depois = mesclarPainel(atual, { faturas: [] });
  expect(depois.faturas).toEqual([]);
});

/* ---------------- o que veio com as tabelas do painel ---------------- */

test("cliente traz nascimento, tipo de cadastro, endereço e status", () => {
  const { cliente } = normalizarPainel({
    cliente: {
      nome: "Mariana",
      data_nascimento: "1988-04-17",
      tipo_cadastro: "cpf",
      status_cliente: "inativo",
      endereco: { cep: "89801100", logradouro: "Av. Getúlio Vargas", numero: "1842", uf: "SC" },
    },
  });

  expect(cliente.nascimento).toBe("1988-04-17");
  expect(cliente.tipoCadastro).toBe("cpf");
  expect(cliente.status).toBe("inativo");
  expect(cliente.endereco.logradouro).toBe("Av. Getúlio Vargas");
});

test("aceita pessoa física/jurídica no lugar de cpf/cnpj", () => {
  expect(normalizarPainel({ cliente: { tipo_cadastro: "JURIDICA" } }).cliente.tipoCadastro).toBe(
    "cnpj",
  );
  expect(normalizarPainel({ cliente: { tipo_cadastro: "Fisica" } }).cliente.tipoCadastro).toBe(
    "cpf",
  );
  // sem informação não se inventa uma: fica vazio
  expect(normalizarPainel({ cliente: { nome: "X" } }).cliente.tipoCadastro).toBe("");
});

test("status do cliente só é inativo quando o cadastro diz isso", () => {
  expect(normalizarPainel({ cliente: { nome: "X" } }).cliente.status).toBe("ativo");
  expect(normalizarPainel({ cliente: { status_cliente: "Inativo" } }).cliente.status).toBe(
    "inativo",
  );
});

test("contrato separa o endereço em coluna única do endereço em campos", () => {
  const emTexto = normalizarPainel({
    contratos: [{ id: "c1", endereco: "Av. Getúlio Vargas, 1842 - Centro, Chapecó/SC" }],
  }).contratos[0];
  expect(emTexto?.enderecoTexto).toBe("Av. Getúlio Vargas, 1842 - Centro, Chapecó/SC");

  const emCampos = normalizarPainel({
    contratos: [{ id: "c1", endereco: { logradouro: "Av. Getúlio Vargas", numero: "1842" } }],
  }).contratos[0];
  expect(emCampos?.enderecoTexto).toBe("");
  expect(emCampos?.endereco.numero).toBe("1842");
});

test("composição do contrato aceita a coluna com itens separados por ;", () => {
  const contrato = normalizarPainel({
    contratos: [{ id: "c1", composicao: "Roteador Wi-Fi 6;Paramount+;Suporte 24h" }],
  }).contratos[0];

  expect(contrato?.composicao).toEqual(["Roteador Wi-Fi 6", "Paramount+", "Suporte 24h"]);
});

test("contrato traz adesão e vigência", () => {
  const contrato = normalizarPainel({
    contratos: [{ id: "c1", data_adesao: "2022-03-15", data_vencimento_contrato: "2027-03-15" }],
  }).contratos[0];

  expect(contrato?.adesao).toBe("2022-03-15");
  expect(contrato?.vigenciaAte).toBe("2027-03-15");
});

test("a fatura cobra o valor atualizado e guarda o original", () => {
  const [comJuros, noPrazo] = normalizarPainel({
    faturas: [
      { id: "f1", valor_original: 219.9, valor_atual: 234.87, status: "vencida" },
      { id: "f2", valor: 129.9, status: "aberta" },
    ],
  }).faturas;

  // é o atualizado que o cliente paga hoje
  expect(comJuros?.valor).toBe(234.87);
  expect(comJuros?.valorOriginal).toBe(219.9);
  expect(comJuros?.status).toBe("vencido");

  // sem acréscimo, os dois são o mesmo — e a tela não mostra desconto nenhum
  expect(noPrazo?.valor).toBe(129.9);
  expect(noPrazo?.valorOriginal).toBe(129.9);
  expect(noPrazo?.status).toBe("aberto");
});

test("fatura cancelada não vira fatura em aberto", () => {
  const fatura = normalizarPainel({ faturas: [{ id: "f1", status: "cancelada" }] }).faturas[0];
  expect(fatura?.status).toBe("cancelado");
});

test("as formas femininas do banco chegam ao status do contrato", () => {
  const contrato = normalizarPainel({
    contratos: [{ id: "c1", status_fatura: "vencida", status_contrato: "bloqueado" }],
  }).contratos[0];

  expect(contrato?.statusFinanceiro).toBe("vencido");
  expect(contrato?.statusConexao).toBe("offline");
});
