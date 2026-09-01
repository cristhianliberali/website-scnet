/**
 * As telas do dinheiro: segunda via, notas fiscais, PIX/débito automático e
 * desbloqueio em confiança.
 *
 * Todos seguem a mesma regra: o que aparece depois do envio é o que o n8n
 * devolveu. A segunda via não inventa um PIX, o desbloqueio não se declara
 * concedido — se o fluxo do outro lado não mandou, a tela não mostra.
 */

import { useMemo, useState, type FormEvent } from "react";
import {
  Building2,
  FileSpreadsheet,
  Download,
  Power,
  QrCode,
  Receipt,
  Search,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useErroPainel, useFormularioPainel } from "@/hooks/use-painel";
import { LIMITES } from "@/lib/form-limits";
import { textoDaResposta } from "@/lib/painel-normalizar";
import type { Fatura, NotaFiscal } from "@/lib/painel-tipos";
import { data, faturaEmAberto, moeda } from "@/lib/painel-formato";
import { cn } from "@/lib/utils";
import {
  AcoesFormulario,
  BotaoCopiar,
  Campo,
  CampoTexto,
  EstadoVazio,
  Nota,
  SeloStatus,
  SucessoEnvio,
  TopoServico,
} from "./painel-ui";

/* ---------------- 2ª via de fatura ---------------- */

type DadosPagamento = { pix: string; linhaDigitavel: string; urlBoleto: string; mensagem: string };

export function TelaSegundaVia({ aoVoltar, faturas }: { aoVoltar: () => void; faturas: Fatura[] }) {
  const [filtro, setFiltro] = useState<"todas" | "pendentes" | "pagas">("pendentes");
  // a primeira pendente já vem escolhida: é dela que o cliente veio atrás
  const [selecionada, setSelecionada] = useState<string>(
    () => faturas.find(faturaEmAberto)?.id ?? faturas[0]?.id ?? "",
  );
  const [pagamento, setPagamento] = useState<DadosPagamento | null>(null);

  const envio = useFormularioPainel();
  const tratarErro = useErroPainel();

  const visiveis = useMemo(() => {
    if (filtro === "pendentes") return faturas.filter(faturaEmAberto);
    if (filtro === "pagas") return faturas.filter((f) => f.status === "pago");
    return faturas;
  }, [faturas, filtro]);

  const fatura = faturas.find((f) => f.id === selecionada) ?? null;

  async function gerar(alvo: Fatura) {
    try {
      const resposta = await envio.mutateAsync({
        formulario: "segunda_via",
        dados: {
          id_fatura: alvo.id,
          id_contrato: alvo.idContrato,
          referencia: alvo.referencia,
          vencimento: alvo.vencimento,
          valor: alvo.valor,
        },
      });

      setPagamento({
        pix: textoDaResposta(resposta.dados, "pix_copia_e_cola", "pix", "brcode", "qrcode_pix"),
        linhaDigitavel: textoDaResposta(
          resposta.dados,
          "linha_digitavel",
          "codigo_barras",
          "barcode",
        ),
        urlBoleto: textoDaResposta(
          resposta.dados,
          "url_boleto",
          "link_boleto",
          "boleto_url",
          "pdf",
        ),
        mensagem: resposta.mensagem ?? "",
      });
    } catch (erro) {
      tratarErro(erro, "Não foi possível gerar a segunda via agora.");
    }
  }

  // o que o n8n mandou agora vale mais que o que veio no carregamento da página
  const pix = pagamento?.pix || fatura?.pixCopiaECola || "";
  const linha = pagamento?.linhaDigitavel || fatura?.linhaDigitavel || "";
  const boleto = pagamento?.urlBoleto || fatura?.urlBoleto || "";

  return (
    <TopoServico
      titulo="2ª via de fatura"
      descricao="Escolha a fatura e gere o PIX ou a linha digitável para pagar."
      icone={Receipt}
    >
      {faturas.length === 0 ? (
        <EstadoVazio
          icone={Receipt}
          titulo="Nenhuma fatura encontrada"
          texto="Não há faturas no seu cadastro. Se você acha que isso está errado, fale com o atendimento."
        />
      ) : (
        <div className="space-y-4 pt-4">
          <Tabs value={filtro} onValueChange={(v) => setFiltro(v as typeof filtro)}>
            <TabsList className="w-full">
              <TabsTrigger value="pendentes" className="flex-1">
                Em aberto
              </TabsTrigger>
              <TabsTrigger value="pagas" className="flex-1">
                Pagas
              </TabsTrigger>
              <TabsTrigger value="todas" className="flex-1">
                Todas
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {visiveis.length === 0 ? (
            <EstadoVazio
              icone={Receipt}
              titulo="Nada por aqui"
              texto="Nenhuma fatura neste filtro."
            />
          ) : (
            <div className="space-y-2">
              {visiveis.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setSelecionada(f.id);
                    setPagamento(null);
                  }}
                  className={cn(
                    "flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-left transition-colors",
                    selecionada === f.id
                      ? "border-brand bg-brand/5"
                      : "border-border hover:border-brand/40",
                  )}
                >
                  <div>
                    <p className="font-ui text-sm font-bold text-foreground">
                      {f.referencia || "Fatura"}
                    </p>
                    <p className="font-body text-xs text-muted-foreground">
                      Vence em {data(f.vencimento)}
                      {f.pagoEm && ` · pago em ${data(f.pagoEm)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-right">
                      <span className="block font-display text-sm font-extrabold">
                        {moeda(f.valor)}
                      </span>
                      {/* só aparece quando juros e multa entraram */}
                      {f.valorOriginal > 0 && f.valorOriginal !== f.valor && (
                        <span className="block font-body text-[11px] text-muted-foreground line-through">
                          {moeda(f.valorOriginal)}
                        </span>
                      )}
                    </span>
                    <SeloStatus tipo="fatura" valor={f.status} />
                  </div>
                </button>
              ))}
            </div>
          )}

          {fatura && faturaEmAberto(fatura) && (
            <div className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-ui text-sm font-bold text-foreground">
                    Pagar {fatura.referencia || "a fatura"} — {moeda(fatura.valor)}
                  </p>
                  {fatura.valorOriginal > 0 && fatura.valorOriginal !== fatura.valor && (
                    <p className="font-body text-xs text-muted-foreground">
                      {moeda(fatura.valorOriginal)} de valor original +{" "}
                      {moeda(fatura.valor - fatura.valorOriginal)} de juros e multa até hoje.
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="brand"
                  disabled={envio.isPending}
                  onClick={() => void gerar(fatura)}
                >
                  <QrCode className="size-4" />
                  {envio.isPending ? "Gerando..." : "Gerar PIX e boleto"}
                </Button>
              </div>

              {pagamento?.mensagem && (
                <div className="mt-3">
                  <Nota>{pagamento.mensagem}</Nota>
                </div>
              )}

              {pix && (
                <div className="mt-4 space-y-1.5">
                  <p className="font-ui text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    PIX copia e cola
                  </p>
                  <p className="break-all rounded-lg bg-secondary/60 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                    {pix}
                  </p>
                  <BotaoCopiar texto={pix} rotulo="Copiar código PIX" />
                </div>
              )}

              {linha && (
                <div className="mt-4 space-y-1.5">
                  <p className="font-ui text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Linha digitável
                  </p>
                  <p className="break-all rounded-lg bg-secondary/60 p-3 font-mono text-[11px] leading-relaxed text-foreground">
                    {linha}
                  </p>
                  <BotaoCopiar texto={linha} rotulo="Copiar linha digitável" />
                </div>
              )}

              {boleto && (
                <Button type="button" size="sm" variant="outline" className="mt-4" asChild>
                  <a href={boleto} target="_blank" rel="noopener">
                    <Download className="size-4" />
                    Baixar boleto em PDF
                  </a>
                </Button>
              )}

              {!pix && !linha && !boleto && !envio.isPending && (
                <p className="mt-3 font-body text-xs text-muted-foreground">
                  Clique em <strong>Gerar PIX e boleto</strong> para receber o código de pagamento
                  desta fatura.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </TopoServico>
  );
}

/* ---------------- notas fiscais ---------------- */

export function TelaNotasFiscais({
  aoVoltar,
  notas,
}: {
  aoVoltar: () => void;
  notas: NotaFiscal[];
}) {
  const [busca, setBusca] = useState("");
  const envio = useFormularioPainel();
  const tratarErro = useErroPainel();

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return notas;
    return notas.filter((n) =>
      [n.numero, n.referencia, n.numeroContrato, n.serie].join(" ").toLowerCase().includes(termo),
    );
  }, [notas, busca]);

  async function pedirNota(nota: NotaFiscal) {
    try {
      const resposta = await envio.mutateAsync({
        formulario: "nota_fiscal",
        dados: {
          id_nota: nota.id,
          numero: nota.numero,
          referencia: nota.referencia,
          numero_contrato: nota.numeroContrato,
        },
      });

      const url = textoDaResposta(resposta.dados, "url_danfe", "url", "link_nota", "pdf");
      if (url) {
        window.open(url, "_blank", "noopener");
        return;
      }
      toast.success(resposta.mensagem ?? "Pedido enviado. A nota será enviada para você.");
    } catch (erro) {
      tratarErro(erro, "Não foi possível abrir a nota agora.");
    }
  }

  return (
    <TopoServico
      titulo="Minhas notas fiscais"
      descricao="As notas emitidas para os seus contratos."
      icone={FileSpreadsheet}
    >
      <div className="space-y-4 pt-4">
        {notas.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Filtrar por mês, número da nota ou contrato"
              maxLength={LIMITES.busca}
              className="pl-9"
            />
          </div>
        )}

        {visiveis.length === 0 ? (
          <EstadoVazio
            icone={FileSpreadsheet}
            titulo={notas.length === 0 ? "Nenhuma nota emitida" : "Nada encontrado"}
            texto={
              notas.length === 0
                ? "Assim que uma nota fiscal for emitida para os seus contratos, ela aparece aqui."
                : "Nenhuma nota corresponde ao que você digitou."
            }
          />
        ) : (
          <div className="space-y-2">
            {visiveis.map((nota) => (
              <div
                key={nota.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="font-ui text-sm font-bold text-foreground">
                    NF {nota.numero || "—"}
                    {nota.serie && ` · série ${nota.serie}`}
                  </p>
                  <p className="font-body text-xs text-muted-foreground">
                    {nota.referencia && `${nota.referencia} · `}
                    emitida em {data(nota.emitidaEm)}
                    {nota.numeroContrato && ` · contrato ${nota.numeroContrato}`}
                  </p>
                  {nota.chaveVerificacao && (
                    <p className="mt-0.5 break-all font-mono text-[10px] text-muted-foreground/80">
                      {nota.chaveVerificacao}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-sm font-extrabold">{moeda(nota.valor)}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={envio.isPending}
                    onClick={() => void pedirNota(nota)}
                  >
                    <Download className="size-4" />
                    Abrir
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </TopoServico>
  );
}

/* ---------------- PIX automático e débito em conta ---------------- */

const BANCOS = [
  { codigo: "001", nome: "Banco do Brasil" },
  { codigo: "033", nome: "Santander" },
  { codigo: "104", nome: "Caixa Econômica Federal" },
  { codigo: "237", nome: "Bradesco" },
  { codigo: "341", nome: "Itaú Unibanco" },
  { codigo: "748", nome: "Sicredi" },
  { codigo: "756", nome: "Sicoob" },
  { codigo: "077", nome: "Banco Inter" },
  { codigo: "260", nome: "Nu Pagamentos (Nubank)" },
];

export function TelaPixDebito({ aoVoltar }: { aoVoltar: () => void }) {
  const [aba, setAba] = useState<"pix" | "debito">("pix");
  const [tipoChave, setTipoChave] = useState("cpf");
  const [chave, setChave] = useState("");
  const [banco, setBanco] = useState("");
  const [agencia, setAgencia] = useState("");
  const [conta, setConta] = useState("");
  const [tipoConta, setTipoConta] = useState("corrente");
  const [documentoTitular, setDocumentoTitular] = useState("");
  const [concluido, setConcluido] = useState<{ titulo: string; mensagem: string } | null>(null);

  const envio = useFormularioPainel();
  const tratarErro = useErroPainel();

  async function submeter(e: FormEvent) {
    e.preventDefault();

    const pix = aba === "pix";
    if (pix && !chave.trim()) {
      toast.error("Informe a chave PIX que será debitada.");
      return;
    }
    if (!pix && (!banco || !agencia.trim() || !conta.trim())) {
      toast.error("Preencha banco, agência e conta.");
      return;
    }

    try {
      const resposta = await envio.mutateAsync({
        formulario: pix ? "pix_automatico" : "debito_automatico",
        dados: pix
          ? { tipo_chave: tipoChave, chave: chave.trim() }
          : {
              banco,
              banco_nome: BANCOS.find((b) => b.codigo === banco)?.nome ?? "",
              agencia: agencia.trim(),
              conta: conta.trim(),
              tipo_conta: tipoConta,
              documento_titular: documentoTitular.trim(),
            },
      });

      setConcluido({
        titulo: pix ? "PIX automático solicitado" : "Débito em conta solicitado",
        mensagem:
          resposta.mensagem ??
          "Recebemos seu pedido. A cobrança automática começa a valer na próxima fatura.",
      });
    } catch (erro) {
      tratarErro(erro, "Não foi possível registrar o pedido agora.");
    }
  }

  return (
    <TopoServico
      titulo="PIX automático e débito em conta"
      descricao="Deixe a fatura ser paga sozinha todo mês, sem precisar lembrar."
      icone={QrCode}
    >
      {concluido ? (
        <SucessoEnvio titulo={concluido.titulo} mensagem={concluido.mensagem}>
          <Button type="button" variant="outline" onClick={aoVoltar}>
            Voltar ao painel
          </Button>
        </SucessoEnvio>
      ) : (
        <form onSubmit={(e) => void submeter(e)} className="space-y-4 pt-4">
          <Tabs value={aba} onValueChange={(v) => setAba(v as typeof aba)}>
            <TabsList className="w-full">
              <TabsTrigger value="pix" className="flex-1">
                <QrCode className="size-4" />
                PIX automático
              </TabsTrigger>
              <TabsTrigger value="debito" className="flex-1">
                <Building2 className="size-4" />
                Débito em conta
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pix" className="space-y-4 pt-4">
              <Campo rotulo="Tipo de chave">
                <Select value={tipoChave} onValueChange={setTipoChave}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cpf">CPF / CNPJ</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="telefone">Telefone</SelectItem>
                    <SelectItem value="aleatoria">Chave aleatória</SelectItem>
                  </SelectContent>
                </Select>
              </Campo>

              <CampoTexto
                rotulo="Chave PIX"
                valor={chave}
                aoMudar={setChave}
                placeholder="Informe a chave que será debitada"
                maxLength={LIMITES.chavePix}
                dica="A chave precisa ser de uma conta do titular do contrato."
              />
            </TabsContent>

            <TabsContent value="debito" className="space-y-4 pt-4">
              <Campo rotulo="Banco">
                <Select value={banco} onValueChange={setBanco}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha o banco" />
                  </SelectTrigger>
                  <SelectContent>
                    {BANCOS.map((b) => (
                      <SelectItem key={b.codigo} value={b.codigo}>
                        {b.codigo} — {b.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Campo>

              <div className="grid gap-4 sm:grid-cols-2">
                <CampoTexto
                  rotulo="Agência"
                  valor={agencia}
                  aoMudar={setAgencia}
                  placeholder="0000"
                  inputMode="numeric"
                  maxLength={LIMITES.agencia}
                />
                <CampoTexto
                  rotulo="Conta com dígito"
                  valor={conta}
                  aoMudar={setConta}
                  placeholder="00000-0"
                  maxLength={LIMITES.conta}
                />
              </div>

              <Campo rotulo="Tipo de conta">
                <Select value={tipoConta} onValueChange={setTipoConta}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="corrente">Conta corrente</SelectItem>
                    <SelectItem value="poupanca">Conta poupança</SelectItem>
                  </SelectContent>
                </Select>
              </Campo>

              <CampoTexto
                rotulo="CPF ou CNPJ do titular da conta"
                valor={documentoTitular}
                aoMudar={setDocumentoTitular}
                placeholder="000.000.000-00"
                maxLength={LIMITES.documento}
              />
            </TabsContent>
          </Tabs>

          <Nota>
            O débito passa a valer a partir da próxima fatura em aberto. As faturas já emitidas
            seguem para pagamento normal.
          </Nota>

          <AcoesFormulario
            aoCancelar={aoVoltar}
            rotuloConfirmar="Ativar cobrança automática"
            enviando={envio.isPending}
          />
        </form>
      )}
    </TopoServico>
  );
}

/* ---------------- desbloqueio em confiança ---------------- */

export function TelaDesbloqueio({
  aoVoltar,
  faturas,
}: {
  aoVoltar: () => void;
  faturas: Fatura[];
}) {
  const [concluido, setConcluido] = useState<{ mensagem: string; prazo: string } | null>(null);
  const envio = useFormularioPainel();
  const tratarErro = useErroPainel();

  const vencidas = faturas.filter((f) => f.status === "vencido");
  const total = vencidas.reduce((soma, f) => soma + f.valor, 0);

  async function confirmar() {
    try {
      const resposta = await envio.mutateAsync({
        formulario: "desbloqueio_confianca",
        dados: {
          faturas: vencidas.map((f) => f.id),
          valor_total: total,
        },
      });

      setConcluido({
        mensagem:
          resposta.mensagem ?? "Conexão liberada. Regularize as faturas para não bloquear de novo.",
        prazo: textoDaResposta(resposta.dados, "prazo", "liberado_ate", "valido_ate"),
      });
    } catch (erro) {
      tratarErro(erro, "Não foi possível liberar agora.");
    }
  }

  return (
    <TopoServico
      titulo="Desbloqueio em confiança"
      descricao="Libere a conexão agora e regularize as faturas em seguida."
      icone={ShieldCheck}
    >
      {concluido ? (
        <SucessoEnvio titulo="Conexão liberada" mensagem={concluido.mensagem}>
          {concluido.prazo && (
            <p className="font-body text-xs text-muted-foreground">
              Válido até {data(concluido.prazo)}.
            </p>
          )}
          <Button type="button" variant="outline" onClick={aoVoltar}>
            Voltar ao painel
          </Button>
        </SucessoEnvio>
      ) : (
        <div className="space-y-4 pt-4">
          <div className="rounded-xl border border-border p-4">
            <p className="font-ui text-sm font-bold text-foreground">
              {vencidas.length} fatura{vencidas.length === 1 ? "" : "s"} vencida
              {vencidas.length === 1 ? "" : "s"} — {moeda(total)}
            </p>
            <div className="mt-2 space-y-1">
              {vencidas.map((f) => (
                <p key={f.id} className="font-body text-xs text-muted-foreground">
                  {f.referencia || "Fatura"} · venceu em {data(f.vencimento)} · {moeda(f.valor)}
                </p>
              ))}
            </div>
          </div>

          <Nota tom="alerta">
            O desbloqueio em confiança é liberado uma vez por período e depende da análise do
            provedor. A conexão volta a ser bloqueada se as faturas não forem pagas dentro do prazo.
          </Nota>

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={aoVoltar} disabled={envio.isPending}>
              Agora não
            </Button>
            <Button
              type="button"
              variant="brand"
              disabled={envio.isPending}
              onClick={() => void confirmar()}
            >
              <Power className="size-4" />
              {envio.isPending ? "Liberando..." : "Liberar minha conexão"}
            </Button>
          </div>
        </div>
      )}
    </TopoServico>
  );
}
