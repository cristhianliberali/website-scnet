/**
 * Os modais de serviço: troca de plano, indicações, mudança de endereço, troca
 * de titular, suporte técnico e teste de velocidade.
 *
 * Um formulário, um evento, uma resposta. Nenhum deles simula o resultado: o
 * protocolo, a data da visita e a medição vêm do n8n — se não vierem, a tela
 * mostra só a confirmação de que o pedido foi registrado.
 */

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Check,
  Gauge,
  Headphones,
  Search,
  Sparkles,
  Truck,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErroPainel, useFormularioPainel } from "@/hooks/use-painel";
import { numeroDaResposta, textoDaResposta } from "@/lib/painel-normalizar";
import type {
  AdicionalPlano,
  ClientePainel,
  Contrato,
  Indicacao,
  PlanoDisponivel,
} from "@/lib/painel-tipos";
import { data, moeda } from "@/lib/painel-formato";
import { cn } from "@/lib/utils";
import {
  AcoesModal,
  BotaoCopiar,
  Campo,
  CampoTexto,
  CampoTextoLongo,
  EstadoVazio,
  ModalPainel,
  NotaModal,
  SeloStatus,
  SucessoEnvio,
} from "./painel-ui";

/** Seletor de contrato — repetido em quase todo formulário do painel. */
function SeletorContrato({
  contratos,
  valor,
  aoMudar,
}: {
  contratos: Contrato[];
  valor: string;
  aoMudar: (id: string) => void;
}) {
  if (contratos.length <= 1) return null;
  return (
    <Campo rotulo="Contrato">
      <Select value={valor} onValueChange={aoMudar}>
        <SelectTrigger>
          <SelectValue placeholder="Escolha o contrato" />
        </SelectTrigger>
        <SelectContent>
          {contratos.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.apelido}
              {c.numero && ` — ${c.numero}`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Campo>
  );
}

/* ---------------- trocar de plano ---------------- */

export function ModalTrocarPlano({
  aberto,
  aoFechar,
  contratos,
  planos,
  adicionais,
  contratoInicial,
}: {
  aberto: boolean;
  aoFechar: () => void;
  contratos: Contrato[];
  planos: PlanoDisponivel[];
  adicionais: AdicionalPlano[];
  contratoInicial: string;
}) {
  const [contratoId, setContratoId] = useState(contratoInicial);
  const [planoId, setPlanoId] = useState("");
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [concluido, setConcluido] = useState<{ mensagem: string; protocolo: string } | null>(null);

  const envio = useFormularioPainel();
  const tratarErro = useErroPainel();

  useEffect(() => {
    if (!aberto) return;
    setContratoId(contratoInicial || contratos[0]?.id || "");
    setPlanoId(planos.find((p) => p.destaque)?.id ?? planos[0]?.id ?? "");
    setEscolhidos([]);
    setConcluido(null);
  }, [aberto, contratoInicial, contratos, planos]);

  const contrato = contratos.find((c) => c.id === contratoId);
  const plano = planos.find((p) => p.id === planoId);
  const extras = adicionais.filter((a) => escolhidos.includes(a.id));
  const total = (plano?.valor ?? 0) + extras.reduce((soma, a) => soma + a.valor, 0);
  const diferenca = total - (contrato?.valorMensal ?? 0);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    if (!plano) {
      toast.error("Escolha o plano que você quer.");
      return;
    }

    try {
      const resposta = await envio.mutateAsync({
        formulario: "trocar_plano",
        dados: {
          id_contrato: contratoId,
          id_plano: plano.id,
          plano: plano.nome,
          valor_plano: plano.valor,
          adicionais: extras.map((a) => ({ id: a.id, nome: a.nome, valor: a.valor })),
          valor_total: total,
        },
      });

      setConcluido({
        mensagem: resposta.mensagem ?? "Pedido de troca registrado. Vamos confirmar com você.",
        protocolo: textoDaResposta(resposta.dados, "protocolo", "protocol", "numero_protocolo"),
      });
    } catch (erro) {
      tratarErro(erro, "Não foi possível pedir a troca agora.");
    }
  }

  return (
    <ModalPainel
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Trocar de plano"
      descricao="Escolha a velocidade que você quer e confirme a troca."
      icone={Zap}
      largura="max-w-3xl"
    >
      {concluido ? (
        <SucessoEnvio
          titulo="Pedido registrado"
          mensagem={concluido.mensagem}
          protocolo={concluido.protocolo || undefined}
        >
          <Button type="button" variant="outline" onClick={aoFechar}>
            Fechar
          </Button>
        </SucessoEnvio>
      ) : planos.length === 0 ? (
        <EstadoVazio
          icone={Zap}
          titulo="Nenhum plano disponível para troca"
          texto="Fale com o atendimento: as opções para o seu endereço são confirmadas caso a caso."
        />
      ) : (
        <form onSubmit={(e) => void submeter(e)} className="space-y-4 pt-4">
          <SeletorContrato contratos={contratos} valor={contratoId} aoMudar={setContratoId} />

          {contrato && (
            <NotaModal>
              Plano atual: <strong>{contrato.plano || "—"}</strong> por{" "}
              <strong>{moeda(contrato.valorMensal)}</strong> por mês.
            </NotaModal>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {planos.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlanoId(p.id)}
                className={cn(
                  "relative cursor-pointer rounded-xl border p-4 text-left transition-all hover:border-brand/50",
                  planoId === p.id ? "border-brand bg-brand/5 shadow-sm" : "border-border",
                )}
              >
                {p.selo && (
                  <span className="absolute right-3 top-3 rounded bg-zap/25 px-1.5 py-0.5 font-ui text-[10px] font-bold text-zap-ink">
                    {p.selo}
                  </span>
                )}
                <p className="font-display text-sm font-extrabold text-brand-deep">{p.nome}</p>
                <p className="mt-1 font-display text-xl font-extrabold text-foreground">
                  {moeda(p.valor)}
                  <span className="font-body text-xs font-normal text-muted-foreground">/mês</span>
                </p>
                <div className="mt-1 flex gap-3 font-body text-xs text-muted-foreground">
                  {p.download && (
                    <span className="flex items-center gap-1">
                      <ArrowDown className="size-3" />
                      {p.download}
                    </span>
                  )}
                  {p.upload && (
                    <span className="flex items-center gap-1">
                      <ArrowUp className="size-3" />
                      {p.upload}
                    </span>
                  )}
                </div>
                {p.vantagens.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {p.vantagens.slice(0, 4).map((v) => (
                      <li
                        key={v}
                        className="flex items-start gap-1.5 font-body text-xs text-muted-foreground"
                      >
                        <Check className="mt-0.5 size-3 shrink-0 text-brand" />
                        {v}
                      </li>
                    ))}
                  </ul>
                )}
              </button>
            ))}
          </div>

          {adicionais.length > 0 && (
            <div className="space-y-2">
              <p className="font-ui text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Adicionais
              </p>
              {adicionais.map((a) => (
                <label
                  key={a.id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3"
                >
                  <Checkbox
                    checked={escolhidos.includes(a.id)}
                    onCheckedChange={(marcado) =>
                      setEscolhidos((atual) =>
                        marcado ? [...atual, a.id] : atual.filter((id) => id !== a.id),
                      )
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-ui text-sm font-bold text-foreground">
                      {a.nome}
                    </span>
                    {a.descricao && (
                      <span className="block font-body text-xs text-muted-foreground">
                        {a.descricao}
                      </span>
                    )}
                  </span>
                  <span className="font-display text-sm font-extrabold text-brand">
                    +{moeda(a.valor)}
                  </span>
                </label>
              ))}
            </div>
          )}

          <div className="rounded-xl bg-secondary/60 p-4">
            <div className="flex items-center justify-between">
              <span className="font-ui text-sm font-bold text-foreground">Novo valor mensal</span>
              <span className="font-display text-xl font-extrabold text-brand">{moeda(total)}</span>
            </div>
            {contrato && diferenca !== 0 && (
              <p className="mt-1 font-body text-xs text-muted-foreground">
                {diferenca > 0 ? "Aumento" : "Redução"} de {moeda(Math.abs(diferenca))} em relação
                ao plano atual.
              </p>
            )}
          </div>

          <AcoesModal
            aoCancelar={aoFechar}
            rotuloConfirmar="Confirmar troca de plano"
            enviando={envio.isPending}
            desabilitado={!plano}
          />
        </form>
      )}
    </ModalPainel>
  );
}

/* ---------------- indicações ---------------- */

export function ModalIndicacoes({
  aberto,
  aoFechar,
  cliente,
  indicacoes,
}: {
  aberto: boolean;
  aoFechar: () => void;
  cliente: ClientePainel;
  indicacoes: Indicacao[];
}) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const envio = useFormularioPainel();
  const tratarErro = useErroPainel();

  const instaladas = indicacoes.filter((i) => i.status === "instalado");

  async function submeter(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !telefone.trim()) {
      toast.error("Preencha o nome e o telefone do seu amigo.");
      return;
    }

    try {
      const resposta = await envio.mutateAsync({
        formulario: "indicar_amigo",
        dados: {
          nome: nome.trim(),
          telefone: telefone.trim(),
          codigo_indicacao: cliente.codigoIndicacao,
        },
      });

      toast.success(
        resposta.mensagem ?? "Indicação enviada! Vamos entrar em contato com seu amigo.",
      );
      setNome("");
      setTelefone("");
    } catch (erro) {
      tratarErro(erro, "Não foi possível enviar a indicação agora.");
    }
  }

  return (
    <ModalPainel
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Minhas indicações"
      descricao="Indique um amigo e ganhe desconto quando ele instalar."
      icone={Users}
      largura="max-w-3xl"
    >
      <div className="space-y-5 pt-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border p-4 text-center">
            <p className="font-display text-2xl font-extrabold text-brand">{indicacoes.length}</p>
            <p className="font-body text-xs text-muted-foreground">indicações feitas</p>
          </div>
          <div className="rounded-xl border border-border p-4 text-center">
            <p className="font-display text-2xl font-extrabold text-emerald-600">
              {instaladas.length}
            </p>
            <p className="font-body text-xs text-muted-foreground">já instaladas</p>
          </div>
          <div className="rounded-xl border border-border p-4 text-center">
            <p className="font-display text-2xl font-extrabold text-foreground">
              {moeda(cliente.descontoAcumulado)}
            </p>
            <p className="font-body text-xs text-muted-foreground">em desconto acumulado</p>
          </div>
        </div>

        {(cliente.linkIndicacao || cliente.codigoIndicacao) && (
          <div className="rounded-xl border border-dashed border-border bg-secondary/50 p-4">
            <p className="font-ui text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Seu link de indicação
            </p>
            <p className="mt-1 break-all font-body text-sm text-foreground">
              {cliente.linkIndicacao || cliente.codigoIndicacao}
            </p>
            <BotaoCopiar
              texto={cliente.linkIndicacao || cliente.codigoIndicacao}
              rotulo="Copiar link"
              className="mt-2"
            />
          </div>
        )}

        <form
          onSubmit={(e) => void submeter(e)}
          className="space-y-4 rounded-xl border border-border p-4"
        >
          <p className="font-ui text-sm font-bold text-foreground">Indicar um amigo agora</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoTexto
              rotulo="Nome do amigo"
              valor={nome}
              aoMudar={setNome}
              placeholder="Ex: Pedro Henrique"
            />
            <CampoTexto
              rotulo="WhatsApp"
              valor={telefone}
              aoMudar={setTelefone}
              placeholder="(49) 99999-8888"
              inputMode="tel"
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="brand" disabled={envio.isPending}>
              <Sparkles className="size-4" />
              {envio.isPending ? "Enviando..." : "Enviar indicação"}
            </Button>
          </div>
        </form>

        <div>
          <p className="mb-2 font-ui text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Quem você já indicou
          </p>
          {indicacoes.length === 0 ? (
            <EstadoVazio
              icone={Users}
              titulo="Nenhuma indicação ainda"
              texto="Indique alguém pelo formulário acima e acompanhe o andamento por aqui."
            />
          ) : (
            <div className="space-y-2">
              {indicacoes.map((i) => (
                <div
                  key={i.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
                >
                  <div>
                    <p className="font-ui text-sm font-bold text-foreground">{i.nome || "—"}</p>
                    <p className="font-body text-xs text-muted-foreground">
                      {i.telefone}
                      {i.data && ` · ${data(i.data)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {i.desconto > 0 && (
                      <span className="font-display text-sm font-extrabold text-emerald-600">
                        {moeda(i.desconto)}
                      </span>
                    )}
                    <SeloStatus tipo="indicacao" valor={i.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ModalPainel>
  );
}

/* ---------------- mudança de endereço ---------------- */

export function ModalMudancaEndereco({
  aberto,
  aoFechar,
  contratos,
  contratoInicial,
}: {
  aberto: boolean;
  aoFechar: () => void;
  contratos: Contrato[];
  contratoInicial: string;
}) {
  const [contratoId, setContratoId] = useState(contratoInicial);
  const [cep, setCep] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [dataVisita, setDataVisita] = useState("");
  const [periodo, setPeriodo] = useState("manha");
  const [viabilidade, setViabilidade] = useState<{ ok: boolean; mensagem: string } | null>(null);
  const [concluido, setConcluido] = useState<{ mensagem: string; protocolo: string } | null>(null);

  const envio = useFormularioPainel();
  const tratarErro = useErroPainel();

  useEffect(() => {
    if (!aberto) return;
    setContratoId(contratoInicial || contratos[0]?.id || "");
    setViabilidade(null);
    setConcluido(null);
  }, [aberto, contratoInicial, contratos]);

  async function conferirViabilidade() {
    if (cep.replace(/\D/g, "").length < 8) {
      toast.error("Digite o CEP completo para conferir a cobertura.");
      return;
    }

    try {
      const resposta = await envio.mutateAsync({
        formulario: "viabilidade_endereco",
        dados: { cep: cep.trim(), numero: numero.trim(), id_contrato: contratoId },
      });

      /*
       * Quem diz se há cobertura é o n8n. Um "ok" sem `viavel` na resposta é
       * lido como viável — o fluxo respondeu positivo, e travar o cliente por
       * um campo ausente seria inventar uma recusa que ninguém deu.
       */
      const viavelBruto = textoDaResposta(resposta.dados, "viavel", "viabilidade", "disponivel");
      const viavel =
        viavelBruto === "" || !["false", "nao", "não", "0"].includes(viavelBruto.toLowerCase());

      // o cadastro costuma devolver o endereço completo junto da consulta
      const preencher = (atual: string, ...nomes: string[]) =>
        textoDaResposta(resposta.dados, ...nomes) || atual;
      setLogradouro((v) => preencher(v, "logradouro", "rua", "street"));
      setBairro((v) => preencher(v, "bairro"));
      setCidade((v) => preencher(v, "cidade", "municipio"));
      setUf((v) => preencher(v, "uf", "estado"));

      setViabilidade({
        ok: viavel,
        mensagem:
          resposta.mensagem ??
          (viavel
            ? "Temos cobertura nesse endereço."
            : "Ainda não temos cobertura nesse endereço."),
      });
    } catch (erro) {
      tratarErro(erro, "Não foi possível consultar a cobertura agora.");
    }
  }

  async function submeter(e: FormEvent) {
    e.preventDefault();
    if (!cep.trim() || !logradouro.trim() || !numero.trim() || !cidade.trim()) {
      toast.error("Preencha CEP, rua, número e cidade.");
      return;
    }

    try {
      const resposta = await envio.mutateAsync({
        formulario: "mudanca_endereco",
        dados: {
          id_contrato: contratoId,
          cep: cep.trim(),
          logradouro: logradouro.trim(),
          numero: numero.trim(),
          complemento: complemento.trim(),
          bairro: bairro.trim(),
          cidade: cidade.trim(),
          uf: uf.trim().toUpperCase(),
          data_visita: dataVisita,
          periodo_visita: periodo,
        },
      });

      setConcluido({
        mensagem:
          resposta.mensagem ?? "Mudança solicitada. Vamos confirmar a data da visita com você.",
        protocolo: textoDaResposta(resposta.dados, "protocolo", "protocol", "numero_protocolo"),
      });
    } catch (erro) {
      tratarErro(erro, "Não foi possível registrar a mudança agora.");
    }
  }

  return (
    <ModalPainel
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Mudança de endereço"
      descricao="Leve sua internet para o endereço novo. Conferimos a cobertura antes."
      icone={Truck}
      largura="max-w-3xl"
    >
      {concluido ? (
        <SucessoEnvio
          titulo="Mudança solicitada"
          mensagem={concluido.mensagem}
          protocolo={concluido.protocolo || undefined}
        >
          <Button type="button" variant="outline" onClick={aoFechar}>
            Fechar
          </Button>
        </SucessoEnvio>
      ) : (
        <form onSubmit={(e) => void submeter(e)} className="space-y-4 pt-4">
          <SeletorContrato contratos={contratos} valor={contratoId} aoMudar={setContratoId} />

          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <CampoTexto
              rotulo="CEP do novo endereço"
              valor={cep}
              aoMudar={setCep}
              placeholder="00000-000"
              inputMode="numeric"
            />
            <Button
              type="button"
              variant="outline"
              disabled={envio.isPending}
              onClick={() => void conferirViabilidade()}
            >
              <Search className="size-4" />
              Conferir cobertura
            </Button>
          </div>

          {viabilidade && (
            <NotaModal tom={viabilidade.ok ? "info" : "alerta"}>{viabilidade.mensagem}</NotaModal>
          )}

          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <CampoTexto rotulo="Rua / avenida" valor={logradouro} aoMudar={setLogradouro} />
            <CampoTexto rotulo="Número" valor={numero} aoMudar={setNumero} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <CampoTexto
              rotulo="Complemento"
              valor={complemento}
              aoMudar={setComplemento}
              placeholder="Apto, bloco, casa..."
            />
            <CampoTexto rotulo="Bairro" valor={bairro} aoMudar={setBairro} />
          </div>

          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <CampoTexto rotulo="Cidade" valor={cidade} aoMudar={setCidade} />
            <CampoTexto rotulo="UF" valor={uf} aoMudar={setUf} maxLength={2} placeholder="SC" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <CampoTexto
              rotulo="Data desejada para a visita"
              valor={dataVisita}
              aoMudar={setDataVisita}
              type="date"
            />
            <Campo rotulo="Período">
              <Select value={periodo} onValueChange={setPeriodo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manha">Manhã (8h às 12h)</SelectItem>
                  <SelectItem value="tarde">Tarde (13h às 18h)</SelectItem>
                </SelectContent>
              </Select>
            </Campo>
          </div>

          <NotaModal>
            A data é uma preferência: a confirmação depende da agenda técnica da sua região e chega
            pelo WhatsApp.
          </NotaModal>

          <AcoesModal
            aoCancelar={aoFechar}
            rotuloConfirmar="Solicitar mudança"
            enviando={envio.isPending}
          />
        </form>
      )}
    </ModalPainel>
  );
}

/* ---------------- trocar titular ---------------- */

export function ModalTrocarTitular({
  aberto,
  aoFechar,
  contratos,
  cliente,
  contratoInicial,
}: {
  aberto: boolean;
  aoFechar: () => void;
  contratos: Contrato[];
  cliente: ClientePainel;
  contratoInicial: string;
}) {
  const [contratoId, setContratoId] = useState(contratoInicial);
  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const [rg, setRg] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [vinculo, setVinculo] = useState("familiar");
  const [aceito, setAceito] = useState(false);
  const [concluido, setConcluido] = useState<{ mensagem: string; protocolo: string } | null>(null);

  const envio = useFormularioPainel();
  const tratarErro = useErroPainel();

  useEffect(() => {
    if (!aberto) return;
    setContratoId(contratoInicial || contratos[0]?.id || "");
    setConcluido(null);
  }, [aberto, contratoInicial, contratos]);

  async function submeter(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim() || !documento.trim() || !telefone.trim()) {
      toast.error("Preencha nome, documento e telefone do novo titular.");
      return;
    }
    if (!aceito) {
      toast.error("Confirme que o novo titular está de acordo com a transferência.");
      return;
    }

    try {
      const resposta = await envio.mutateAsync({
        formulario: "trocar_titular",
        dados: {
          id_contrato: contratoId,
          titular_atual: cliente.nome,
          novo_titular: {
            nome: nome.trim(),
            documento: documento.trim(),
            rg: rg.trim(),
            nascimento,
            email: email.trim(),
            telefone: telefone.trim(),
          },
          vinculo,
          aceite_confirmado: true,
        },
      });

      setConcluido({
        mensagem:
          resposta.mensagem ??
          "Transferência solicitada. Nosso time entra em contato para conferir os documentos.",
        protocolo: textoDaResposta(resposta.dados, "protocolo", "protocol", "numero_protocolo"),
      });
    } catch (erro) {
      tratarErro(erro, "Não foi possível solicitar a troca agora.");
    }
  }

  return (
    <ModalPainel
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Trocar titular do contrato"
      descricao="Passe o contrato para outra pessoa mantendo a instalação."
      icone={UserCheck}
      largura="max-w-3xl"
    >
      {concluido ? (
        <SucessoEnvio
          titulo="Transferência solicitada"
          mensagem={concluido.mensagem}
          protocolo={concluido.protocolo || undefined}
        >
          <Button type="button" variant="outline" onClick={aoFechar}>
            Fechar
          </Button>
        </SucessoEnvio>
      ) : (
        <form onSubmit={(e) => void submeter(e)} className="space-y-4 pt-4">
          <SeletorContrato contratos={contratos} valor={contratoId} aoMudar={setContratoId} />

          <NotaModal>
            Titular atual: <strong>{cliente.nome || "—"}</strong>
            {cliente.documento && ` · ${cliente.documento}`}
          </NotaModal>

          <div className="grid gap-4 sm:grid-cols-2">
            <CampoTexto
              rotulo="Nome completo do novo titular"
              valor={nome}
              aoMudar={setNome}
              placeholder="Ex: Mariana Silva Rocha"
              className="sm:col-span-2"
            />
            <CampoTexto
              rotulo="CPF ou CNPJ"
              valor={documento}
              aoMudar={setDocumento}
              placeholder="000.000.000-00"
            />
            <CampoTexto rotulo="RG / órgão emissor" valor={rg} aoMudar={setRg} />
            <CampoTexto
              rotulo="Data de nascimento"
              valor={nascimento}
              aoMudar={setNascimento}
              type="date"
            />
            <Campo rotulo="Vínculo com você">
              <Select value={vinculo} onValueChange={setVinculo}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="familiar">Familiar (cônjuge, parente)</SelectItem>
                  <SelectItem value="novo_morador">Novo morador / comprador</SelectItem>
                  <SelectItem value="socio">Sócio ou representante da empresa</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </Campo>
            <CampoTexto
              rotulo="E-mail do novo titular"
              valor={email}
              aoMudar={setEmail}
              type="email"
              placeholder="email@exemplo.com.br"
            />
            <CampoTexto
              rotulo="WhatsApp do novo titular"
              valor={telefone}
              aoMudar={setTelefone}
              placeholder="(49) 99999-8888"
              inputMode="tel"
            />
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
            <Checkbox checked={aceito} onCheckedChange={(v) => setAceito(v === true)} />
            <span className="font-body text-xs text-muted-foreground">
              Confirmo que o novo titular está de acordo com a transferência e que as faturas em
              aberto continuam sob minha responsabilidade até a conclusão.
            </span>
          </label>

          <NotaModal tom="alerta">
            A transferência só é concluída depois da conferência dos documentos pelo nosso time.
          </NotaModal>

          <AcoesModal
            aoCancelar={aoFechar}
            rotuloConfirmar="Solicitar transferência"
            enviando={envio.isPending}
          />
        </form>
      )}
    </ModalPainel>
  );
}

/* ---------------- suporte técnico ---------------- */

const CATEGORIAS = [
  "Internet lenta ou oscilando",
  "Sem conexão",
  "Wi-Fi com pouco alcance",
  "Troca ou configuração de equipamento",
  "Dúvida sobre a fatura",
  "Outro assunto",
];

export function ModalSuporte({
  aberto,
  aoFechar,
  contratos,
  contratoInicial,
}: {
  aberto: boolean;
  aoFechar: () => void;
  contratos: Contrato[];
  contratoInicial: string;
}) {
  const [contratoId, setContratoId] = useState(contratoInicial);
  const [categoria, setCategoria] = useState(CATEGORIAS[0] as string);
  const [assunto, setAssunto] = useState("");
  const [descricao, setDescricao] = useState("");
  const [diagnostico, setDiagnostico] = useState<string | null>(null);
  const [concluido, setConcluido] = useState<{ mensagem: string; protocolo: string } | null>(null);

  const envio = useFormularioPainel();
  const tratarErro = useErroPainel();

  useEffect(() => {
    if (!aberto) return;
    setContratoId(contratoInicial || contratos[0]?.id || "");
    setDiagnostico(null);
    setConcluido(null);
  }, [aberto, contratoInicial, contratos]);

  async function diagnosticar() {
    try {
      const resposta = await envio.mutateAsync({
        formulario: "diagnostico_conexao",
        dados: { id_contrato: contratoId },
      });

      setDiagnostico(
        textoDaResposta(resposta.dados, "diagnostico", "resultado", "resumo") ||
          resposta.mensagem ||
          "Diagnóstico concluído. Nenhum problema encontrado na nossa rede.",
      );
    } catch (erro) {
      tratarErro(erro, "Não foi possível rodar o diagnóstico agora.");
    }
  }

  async function submeter(e: FormEvent) {
    e.preventDefault();
    if (!assunto.trim() || !descricao.trim()) {
      toast.error("Conte o assunto e descreva o que está acontecendo.");
      return;
    }

    try {
      const resposta = await envio.mutateAsync({
        formulario: "abrir_chamado",
        dados: {
          id_contrato: contratoId,
          categoria,
          assunto: assunto.trim(),
          descricao: descricao.trim(),
          ...(diagnostico ? { diagnostico } : {}),
        },
      });

      setConcluido({
        mensagem: resposta.mensagem ?? "Chamado aberto. Nosso time já está com ele.",
        protocolo: textoDaResposta(resposta.dados, "protocolo", "protocol", "numero_protocolo"),
      });
    } catch (erro) {
      tratarErro(erro, "Não foi possível abrir o chamado agora.");
    }
  }

  return (
    <ModalPainel
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Suporte técnico"
      descricao="Conte o que está acontecendo e abrimos um chamado com protocolo."
      icone={Headphones}
    >
      {concluido ? (
        <SucessoEnvio
          titulo="Chamado aberto"
          mensagem={concluido.mensagem}
          protocolo={concluido.protocolo || undefined}
        >
          <Button type="button" variant="outline" onClick={aoFechar}>
            Fechar
          </Button>
        </SucessoEnvio>
      ) : (
        <form onSubmit={(e) => void submeter(e)} className="space-y-4 pt-4">
          <SeletorContrato contratos={contratos} valor={contratoId} aoMudar={setContratoId} />

          <div className="rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-ui text-sm font-bold text-foreground">Diagnóstico rápido</p>
                <p className="font-body text-xs text-muted-foreground">
                  Conferimos o sinal do seu ponto antes de abrir o chamado.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={envio.isPending}
                onClick={() => void diagnosticar()}
              >
                <Activity className="size-4" />
                Rodar diagnóstico
              </Button>
            </div>
            {diagnostico && (
              <div className="mt-3">
                <NotaModal>{diagnostico}</NotaModal>
              </div>
            )}
          </div>

          <Campo rotulo="Categoria">
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>

          <CampoTexto
            rotulo="Assunto"
            valor={assunto}
            aoMudar={setAssunto}
            placeholder="Ex: sinal cai toda noite por volta das 20h"
          />

          <CampoTextoLongo
            rotulo="O que está acontecendo"
            valor={descricao}
            aoMudar={setDescricao}
            rows={4}
            placeholder="Conte desde quando começou, em quais aparelhos acontece e quais luzes do equipamento estão acesas."
          />

          <AcoesModal
            aoCancelar={aoFechar}
            rotuloConfirmar="Abrir chamado"
            enviando={envio.isPending}
          />
        </form>
      )}
    </ModalPainel>
  );
}

/* ---------------- teste de velocidade ---------------- */

type Medicao = { download: number; upload: number; ping: number; mensagem: string };

export function ModalTesteVelocidade({
  aberto,
  aoFechar,
  contrato,
}: {
  aberto: boolean;
  aoFechar: () => void;
  contrato: Contrato | null;
}) {
  const [medicao, setMedicao] = useState<Medicao | null>(null);
  const envio = useFormularioPainel();
  const tratarErro = useErroPainel();

  useEffect(() => {
    if (aberto) setMedicao(null);
  }, [aberto]);

  const contratado = useMemo(() => {
    const digitos = /(\d+)/.exec(contrato?.download ?? "");
    return digitos ? Number(digitos[1]) : 0;
  }, [contrato]);

  async function medir() {
    if (!contrato) return;
    try {
      const resposta = await envio.mutateAsync({
        formulario: "teste_velocidade",
        dados: { id_contrato: contrato.id },
      });

      setMedicao({
        download: numeroDaResposta(resposta.dados, "download", "download_mbps", "velocidade"),
        upload: numeroDaResposta(resposta.dados, "upload", "upload_mbps"),
        ping: numeroDaResposta(resposta.dados, "ping", "latencia", "latency"),
        mensagem: resposta.mensagem ?? "",
      });
    } catch (erro) {
      tratarErro(erro, "Não foi possível medir agora.");
    }
  }

  const percentual =
    contratado > 0 && medicao ? Math.min((medicao.download / contratado) * 100, 100) : 0;

  return (
    <ModalPainel
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Teste de velocidade"
      descricao="Medimos a entrega no seu ponto, direto da nossa rede."
      icone={Gauge}
      largura="max-w-lg"
    >
      <div className="space-y-4 pt-4">
        {contrato && (
          <NotaModal>
            {contrato.apelido} · plano contratado {contrato.download || "—"} de download
          </NotaModal>
        )}

        {medicao ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-border p-4 text-center">
                <ArrowDown className="mx-auto size-4 text-brand" />
                <p className="mt-1 font-display text-xl font-extrabold text-foreground">
                  {medicao.download.toFixed(0)}
                </p>
                <p className="font-body text-[11px] text-muted-foreground">Mbps download</p>
              </div>
              <div className="rounded-xl border border-border p-4 text-center">
                <ArrowUp className="mx-auto size-4 text-emerald-600" />
                <p className="mt-1 font-display text-xl font-extrabold text-foreground">
                  {medicao.upload.toFixed(0)}
                </p>
                <p className="font-body text-[11px] text-muted-foreground">Mbps upload</p>
              </div>
              <div className="rounded-xl border border-border p-4 text-center">
                <Activity className="mx-auto size-4 text-amber-600" />
                <p className="mt-1 font-display text-xl font-extrabold text-foreground">
                  {medicao.ping.toFixed(0)}
                </p>
                <p className="font-body text-[11px] text-muted-foreground">ms de ping</p>
              </div>
            </div>

            {percentual > 0 && (
              <div>
                <div className="h-2 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-brand transition-all"
                    style={{ width: `${percentual}%` }}
                  />
                </div>
                <p className="mt-1 font-body text-xs text-muted-foreground">
                  {percentual.toFixed(0)}% da velocidade contratada.
                </p>
              </div>
            )}

            {medicao.mensagem && <NotaModal>{medicao.mensagem}</NotaModal>}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={aoFechar}>
                Fechar
              </Button>
              <Button
                type="button"
                variant="brand"
                disabled={envio.isPending}
                onClick={() => void medir()}
              >
                Medir de novo
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-4 py-6">
            <div
              className={cn(
                "grid size-20 place-items-center rounded-full bg-brand/10 text-brand",
                envio.isPending && "animate-pulse",
              )}
            >
              <Gauge className={cn("size-9", envio.isPending && "animate-spin")} />
            </div>
            <p className="text-center font-body text-sm text-muted-foreground">
              {envio.isPending
                ? "Medindo a entrega no seu ponto..."
                : "O teste mede o que a nossa rede entrega até o seu equipamento."}
            </p>
            <Button
              type="button"
              variant="brand"
              disabled={envio.isPending || !contrato}
              onClick={() => void medir()}
            >
              <Gauge className="size-4" />
              {envio.isPending ? "Medindo..." : "Iniciar teste"}
            </Button>
          </div>
        )}
      </div>
    </ModalPainel>
  );
}
