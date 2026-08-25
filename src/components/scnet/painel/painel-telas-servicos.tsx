/**
 * As telas de serviço: troca de plano, indicações, mudança de endereço, troca
 * de titular e suporte técnico.
 *
 * Um formulário, um evento, uma resposta. Nenhum deles simula o resultado: o
 * protocolo e a data da visita vêm do n8n — se não vierem, a tela mostra só a
 * confirmação de que o pedido foi registrado.
 *
 * Cada uma monta a si mesma quando é escolhida e sai da árvore quando o cliente
 * vai para outra: não há `aberto`, e por isso também não há efeito de "limpar
 * os campos ao abrir" — o estado inicial já é o estado de abertura.
 */

import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
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
import { isValidPhone } from "@/lib/form-utils";
import { textoDaResposta } from "@/lib/painel-normalizar";
import type {
  AdicionalPlano,
  ClientePainel,
  ConfigIndicacaoPainel,
  Contrato,
  Indicacao,
  PlanoDisponivel,
} from "@/lib/painel-tipos";
import { data, moeda, telefone as telefoneFormatado } from "@/lib/painel-formato";
import { cn } from "@/lib/utils";
import {
  AcoesFormulario,
  BotaoCopiar,
  Campo,
  CampoTelefone,
  CampoTexto,
  CampoTextoLongo,
  EstadoVazio,
  FalarComComercial,
  Nota,
  SeloStatus,
  SucessoEnvio,
  TopoServico,
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

export function TelaTrocarPlano({
  aoVoltar,
  contratos,
  planos,
  adicionais,
  contratoInicial,
}: {
  aoVoltar: () => void;
  contratos: Contrato[];
  planos: PlanoDisponivel[];
  adicionais: AdicionalPlano[];
  contratoInicial: string;
}) {
  const [contratoId, setContratoId] = useState(contratoInicial || contratos[0]?.id || "");
  const [escolhido, setEscolhido] = useState("");
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [concluido, setConcluido] = useState<{ mensagem: string; protocolo: string } | null>(null);

  const envio = useFormularioPainel();
  const tratarErro = useErroPainel();

  const contrato = contratos.find((c) => c.id === contratoId);
  const valorAtual = contrato?.valorMensal ?? 0;

  /*
   * A regra de exibição: só plano de valor igual ou maior que o do contrato.
   *
   * Downgrade não é uma caixa de seleção — costuma envolver fidelidade, prazo e
   * um desconto que o comercial pode oferecer para segurar o cliente. Um
   * formulário que reduz a mensalidade em dois cliques atropela essa conversa,
   * então quem quer descer fala com o comercial, pelo botão do rodapé.
   */
  const elegiveis = useMemo(
    () => planos.filter((p) => p.valor >= valorAtual),
    [planos, valorAtual],
  );

  /*
   * O plano escolhido é derivado, não guardado: trocar o contrato muda a lista
   * de elegíveis, e uma seleção presa no estado poderia apontar para um plano
   * que sumiu da tela — e ir junto no envio.
   */
  const planoId = elegiveis.some((p) => p.id === escolhido)
    ? escolhido
    : (elegiveis.find((p) => p.destaque)?.id ?? elegiveis[0]?.id ?? "");

  const plano = elegiveis.find((p) => p.id === planoId);
  const extras = adicionais.filter((a) => escolhidos.includes(a.id));
  const total = (plano?.valor ?? 0) + extras.reduce((soma, a) => soma + a.valor, 0);
  const diferenca = total - valorAtual;

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
          codigo_oferta_mk: plano.codigoOfertaMk,
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
    <TopoServico
      titulo="Trocar de plano"
      descricao="Escolha a velocidade que você quer e confirme a troca."
      icone={Zap}
    >
      {concluido ? (
        <SucessoEnvio
          titulo="Pedido registrado"
          mensagem={concluido.mensagem}
          protocolo={concluido.protocolo || undefined}
        >
          <Button type="button" variant="outline" onClick={aoVoltar}>
            Voltar ao painel
          </Button>
        </SucessoEnvio>
      ) : (
        <form onSubmit={(e) => void submeter(e)} className="space-y-4 pt-4">
          <SeletorContrato contratos={contratos} valor={contratoId} aoMudar={setContratoId} />

          {contrato && (
            <Nota>
              Plano atual: <strong>{contrato.plano || "—"}</strong> por{" "}
              <strong>{moeda(contrato.valorMensal)}</strong> por mês.
            </Nota>
          )}

          {elegiveis.length === 0 && (
            <EstadoVazio
              icone={Zap}
              titulo="Nenhum upgrade disponível para este contrato"
              texto="Você já está no topo do que oferecemos aqui. Para rever o plano ou falar de um plano menor, chame o comercial no botão abaixo."
            />
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {elegiveis.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setEscolhido(p.id)}
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

          {plano && (
            <div className="rounded-xl bg-secondary/60 p-4">
              <div className="flex items-center justify-between">
                <span className="font-ui text-sm font-bold text-foreground">Novo valor mensal</span>
                <span className="font-display text-xl font-extrabold text-brand">
                  {moeda(total)}
                </span>
              </div>
              {contrato && diferenca !== 0 && (
                <p className="mt-1 font-body text-xs text-muted-foreground">
                  {diferenca > 0 ? "Aumento" : "Redução"} de {moeda(Math.abs(diferenca))} em relação
                  ao plano atual.
                </p>
              )}
            </div>
          )}

          <AcoesFormulario
            aoCancelar={aoVoltar}
            rotuloConfirmar="Confirmar troca de plano"
            enviando={envio.isPending}
            desabilitado={!plano}
          />

          <FalarComComercial
            mensagem={
              contrato
                ? `Olá! Sou cliente e tenho dúvidas sobre a troca do meu plano (contrato ${contrato.numero || contrato.id}).`
                : "Olá! Sou cliente e tenho dúvidas sobre a troca do meu plano."
            }
            texto="Quer um plano menor, ou ficou com dúvida sobre fidelidade e prazos? Fale com o comercial — a troca para baixo é analisada caso a caso."
          />
        </form>
      )}
    </TopoServico>
  );
}

/* ---------------- indicações ---------------- */

/**
 * O banner da campanha, no topo do formulário.
 *
 * Duas imagens, uma para cada formato — não é a mesma arte redimensionada: um
 * banner desenhado em 5:1 vira uma tira ilegível no celular. O `<picture>`
 * troca a fonte pela largura da tela, então o navegador baixa **uma** das duas,
 * e não as duas.
 *
 * Sem URL cadastrada no /admin, não há banner: nenhum espaço reservado, nenhum
 * ícone de imagem quebrada. A seção começa direto no formulário, como antes de
 * existir campanha nenhuma.
 */
function BannerIndicacao({ config }: { config: ConfigIndicacaoPainel }) {
  const desktop = config.bannerDesktopUrl;
  const mobile = config.bannerMobileUrl;
  if (!desktop && !mobile) return null;

  const imagem = (
    <picture>
      {desktop && mobile && <source media="(min-width: 640px)" srcSet={desktop} />}
      <img
        src={mobile || desktop}
        alt={config.bannerAlt}
        /*
         * `alt` vazio não é esquecimento: quando ninguém escreveu a descrição, o
         * banner é decoração, e um leitor de tela deve pulá-lo em vez de ler uma
         * URL. Com descrição, ele vira conteúdo e é anunciado.
         */
        {...(config.bannerAlt ? {} : { role: "presentation" })}
        loading="lazy"
        className="w-full rounded-xl border border-border object-cover"
      />
    </picture>
  );

  if (!config.bannerLink) return imagem;

  return (
    <a
      href={config.bannerLink}
      target="_blank"
      rel="noopener"
      className="block transition-opacity hover:opacity-95"
    >
      {imagem}
    </a>
  );
}

export function TelaIndicacoes({
  aoVoltar,
  cliente,
  indicacoes,
  config,
}: {
  aoVoltar: () => void;
  cliente: ClientePainel;
  indicacoes: Indicacao[];
  config: ConfigIndicacaoPainel;
}) {
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [cidade, setCidade] = useState(cliente.endereco.cidade);
  const [observacoes, setObservacoes] = useState("");
  const envio = useFormularioPainel();
  const tratarErro = useErroPainel();

  const concluidas = indicacoes.filter((i) => i.status === "instalado");

  async function submeter(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim()) {
      toast.error("Diga o nome de quem você está indicando.");
      return;
    }
    /*
     * O telefone é o único jeito de chegar ao indicado — sem ele a linha entra
     * no banco já sem serventia. `isValidPhone` cobre DDD + 8 ou 9 dígitos, que
     * é o que existe no Brasil; o DDI vai no envio, não na digitação.
     */
    if (!isValidPhone(telefone)) {
      toast.error("Confira o WhatsApp: precisa ser DDD + 8 ou 9 dígitos.");
      return;
    }
    if (!cidade.trim()) {
      toast.error("Diga em qual cidade seu amigo mora.");
      return;
    }

    try {
      const resposta = await envio.mutateAsync({
        formulario: "indicar_amigo",
        dados: {
          nome_cliente: cliente.nome,
          nome_indicacao: nome.trim(),
          // com DDI, do jeito que `indicacoes_web.telefone_indicacao` guarda
          telefone_indicacao: `55${telefone.replace(/\D/g, "")}`,
          cidade: cidade.trim(),
          observacoes: observacoes.trim(),
          codigo_indicacao: cliente.codigoIndicacao,
          // os nomes antigos, para um fluxo que ainda não foi atualizado
          nome: nome.trim(),
          telefone: `55${telefone.replace(/\D/g, "")}`,
        },
      });

      const protocolo = textoDaResposta(
        resposta.dados,
        "protocolo",
        "protocol",
        "numero_protocolo",
      );
      toast.success(
        resposta.mensagem ?? "Indicação enviada! Vamos entrar em contato com seu amigo.",
        protocolo ? { description: `Protocolo ${protocolo}` } : undefined,
      );
      setNome("");
      setTelefone("");
      setObservacoes("");
    } catch (erro) {
      tratarErro(erro, "Não foi possível enviar a indicação agora.");
    }
  }

  return (
    <TopoServico titulo={config.titulo} descricao={config.descricao} icone={Users}>
      <div className="space-y-5 pt-4">
        <BannerIndicacao config={config} />

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border p-4 text-center">
            <p className="font-display text-2xl font-extrabold text-brand">{indicacoes.length}</p>
            <p className="font-body text-xs text-muted-foreground">indicações feitas</p>
          </div>
          <div className="rounded-xl border border-border p-4 text-center">
            <p className="font-display text-2xl font-extrabold text-emerald-600">
              {concluidas.length}
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
              autoComplete="off"
            />
            <CampoTelefone
              rotulo="WhatsApp do amigo"
              valor={telefone}
              aoMudar={setTelefone}
              dica="DDD + 8 ou 9 dígitos. O +55 já vai junto."
            />
            <CampoTexto
              rotulo="Cidade"
              valor={cidade}
              aoMudar={setCidade}
              placeholder="Ex: Maravilha"
              autoComplete="off"
            />
            <CampoTexto
              rotulo="Observações (opcional)"
              valor={observacoes}
              aoMudar={setObservacoes}
              placeholder="Ex: melhor horário para ligar, bairro, referência"
              autoComplete="off"
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
                  <div className="min-w-0">
                    <p className="font-ui text-sm font-bold text-foreground">{i.nome || "—"}</p>
                    <p className="font-body text-xs text-muted-foreground">
                      {telefoneFormatado(i.telefone)}
                      {i.cidade && ` · ${i.cidade}`}
                      {i.data && ` · ${data(i.data)}`}
                    </p>
                    <p className="font-body text-xs text-muted-foreground">
                      {i.protocolo && `Protocolo ${i.protocolo}`}
                      {i.protocolo && (i.campanha || i.bonus) && " · "}
                      {i.campanha && <strong className="font-semibold">{i.campanha}</strong>}
                      {i.campanha && i.bonus && " · "}
                      {i.bonus}
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
    </TopoServico>
  );
}

/* ---------------- mudança de endereço ---------------- */

export function TelaMudancaEndereco({
  aoVoltar,
  contratos,
  contratoInicial,
}: {
  aoVoltar: () => void;
  contratos: Contrato[];
  contratoInicial: string;
}) {
  const [contratoId, setContratoId] = useState(contratoInicial || contratos[0]?.id || "");
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
    <TopoServico
      titulo="Mudança de endereço"
      descricao="Leve sua internet para o endereço novo. Conferimos a cobertura antes."
      icone={Truck}
    >
      {concluido ? (
        <SucessoEnvio
          titulo="Mudança solicitada"
          mensagem={concluido.mensagem}
          protocolo={concluido.protocolo || undefined}
        >
          <Button type="button" variant="outline" onClick={aoVoltar}>
            Voltar ao painel
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
            <Nota tom={viabilidade.ok ? "info" : "alerta"}>{viabilidade.mensagem}</Nota>
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

          <Nota>
            A data é uma preferência: a confirmação depende da agenda técnica da sua região e chega
            pelo WhatsApp.
          </Nota>

          <AcoesFormulario
            aoCancelar={aoVoltar}
            rotuloConfirmar="Solicitar mudança"
            enviando={envio.isPending}
          />
        </form>
      )}
    </TopoServico>
  );
}

/* ---------------- trocar titular ---------------- */

export function TelaTrocarTitular({
  aoVoltar,
  contratos,
  cliente,
  contratoInicial,
}: {
  aoVoltar: () => void;
  contratos: Contrato[];
  cliente: ClientePainel;
  contratoInicial: string;
}) {
  const [contratoId, setContratoId] = useState(contratoInicial || contratos[0]?.id || "");
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
    <TopoServico
      titulo="Trocar titular do contrato"
      descricao="Passe o contrato para outra pessoa mantendo a instalação."
      icone={UserCheck}
    >
      {concluido ? (
        <SucessoEnvio
          titulo="Transferência solicitada"
          mensagem={concluido.mensagem}
          protocolo={concluido.protocolo || undefined}
        >
          <Button type="button" variant="outline" onClick={aoVoltar}>
            Voltar ao painel
          </Button>
        </SucessoEnvio>
      ) : (
        <form onSubmit={(e) => void submeter(e)} className="space-y-4 pt-4">
          <SeletorContrato contratos={contratos} valor={contratoId} aoMudar={setContratoId} />

          <Nota>
            Titular atual: <strong>{cliente.nome || "—"}</strong>
            {cliente.documento && ` · ${cliente.documento}`}
          </Nota>

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

          <Nota tom="alerta">
            A transferência só é concluída depois da conferência dos documentos pelo nosso time.
          </Nota>

          <AcoesFormulario
            aoCancelar={aoVoltar}
            rotuloConfirmar="Solicitar transferência"
            enviando={envio.isPending}
          />
        </form>
      )}
    </TopoServico>
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

export function TelaSuporte({
  aoVoltar,
  contratos,
  contratoInicial,
}: {
  aoVoltar: () => void;
  contratos: Contrato[];
  contratoInicial: string;
}) {
  const [contratoId, setContratoId] = useState(contratoInicial || contratos[0]?.id || "");
  const [categoria, setCategoria] = useState(CATEGORIAS[0] as string);
  const [assunto, setAssunto] = useState("");
  const [descricao, setDescricao] = useState("");
  const [concluido, setConcluido] = useState<{ mensagem: string; protocolo: string } | null>(null);

  const envio = useFormularioPainel();
  const tratarErro = useErroPainel();

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
    <TopoServico
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
          <Button type="button" variant="outline" onClick={aoVoltar}>
            Voltar ao painel
          </Button>
        </SucessoEnvio>
      ) : (
        <form onSubmit={(e) => void submeter(e)} className="space-y-4 pt-4">
          <SeletorContrato contratos={contratos} valor={contratoId} aoMudar={setContratoId} />

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

          <AcoesFormulario
            aoCancelar={aoVoltar}
            rotuloConfirmar="Abrir chamado"
            enviando={envio.isPending}
          />
        </form>
      )}
    </TopoServico>
  );
}
