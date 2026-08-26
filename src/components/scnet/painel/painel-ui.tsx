/**
 * As peças que todas as telas do painel usam: formatação, selos de status,
 * o cabeçalho das telas de serviço e os campos de formulário.
 *
 * Tudo aqui é apresentação. Nenhuma peça deste arquivo fala com o webhook —
 * quem faz isso é `use-painel.ts`.
 */

import { useState, type ReactNode } from "react";
import { Check, Copy, Loader2, MessageCircle, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LIMITE } from "@/lib/form-limits";
import { maskPhone } from "@/lib/form-utils";
import { cn } from "@/lib/utils";
import { waLink } from "@/lib/whatsapp";
import type {
  StatusChamado,
  StatusFatura,
  StatusFinanceiro,
  StatusIndicacao,
} from "@/lib/painel-tipos";

/**
 * Qual serviço está aberto. Um por item da grade, mais o desbloqueio, que abre
 * a partir do banner financeiro.
 *
 * O valor viaja na URL (`/cliente/painel?servico=...`), então ele é a chave
 * pública da tela: mudar um nome daqui muda um link que alguém pode ter
 * guardado.
 */
export type ServicoPainelId =
  | "trocar_plano"
  | "indicacoes"
  | "pix_debito"
  | "mudanca_endereco"
  | "trocar_titular"
  | "segunda_via"
  | "notas_fiscais"
  | "suporte"
  | "desbloqueio";

export const SERVICOS_PAINEL: readonly ServicoPainelId[] = [
  "trocar_plano",
  "indicacoes",
  "pix_debito",
  "mudanca_endereco",
  "trocar_titular",
  "segunda_via",
  "notas_fiscais",
  "suporte",
  "desbloqueio",
];

/** O `servico` da URL é texto livre até passar por aqui. */
export function servicoValido(valor: unknown): ServicoPainelId | undefined {
  return typeof valor === "string" && SERVICOS_PAINEL.includes(valor as ServicoPainelId)
    ? (valor as ServicoPainelId)
    : undefined;
}

/* ---------------- selos de status ---------------- */

type Selo = { texto: string; classe: string };

const SELO_FINANCEIRO: Record<StatusFinanceiro, Selo> = {
  em_dia: { texto: "Em dia", classe: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  em_aberto: { texto: "Em aberto", classe: "bg-amber-100 text-amber-900 border-amber-200" },
  vencido: { texto: "Vencido", classe: "bg-red-100 text-red-800 border-red-200" },
};

const SELO_FATURA: Record<StatusFatura, Selo> = {
  pago: { texto: "Paga", classe: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  aberto: { texto: "Em aberto", classe: "bg-amber-100 text-amber-900 border-amber-200" },
  vencido: { texto: "Vencida", classe: "bg-red-100 text-red-800 border-red-200" },
  cancelado: { texto: "Cancelada", classe: "bg-slate-100 text-slate-500 border-slate-200" },
};

const SELO_INDICACAO: Record<StatusIndicacao, Selo> = {
  pendente: { texto: "Aguardando contato", classe: "bg-slate-100 text-slate-700 border-slate-200" },
  em_instalacao: { texto: "Em instalação", classe: "bg-sky-100 text-sky-800 border-sky-200" },
  instalado: { texto: "Instalado", classe: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  cancelado: { texto: "Cancelado", classe: "bg-slate-100 text-slate-500 border-slate-200" },
};

const SELO_CHAMADO: Record<StatusChamado, Selo> = {
  aberto: { texto: "Aberto", classe: "bg-sky-100 text-sky-800 border-sky-200" },
  em_analise: { texto: "Em análise", classe: "bg-amber-100 text-amber-900 border-amber-200" },
  agendado: { texto: "Agendado", classe: "bg-violet-100 text-violet-800 border-violet-200" },
  resolvido: { texto: "Resolvido", classe: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  cancelado: { texto: "Cancelado", classe: "bg-slate-100 text-slate-500 border-slate-200" },
};

/*
 * Não há selo de conexão. O cadastro guarda `status_contrato`, que diz se o
 * contrato está ativo ou bloqueado — e não se o equipamento do cliente está
 * online neste instante. Um "Conectado" verde tirado dali seria uma afirmação
 * que ninguém mediu, e a primeira queda de sinal a desmentiria.
 */
const SELOS = {
  financeiro: SELO_FINANCEIRO,
  fatura: SELO_FATURA,
  indicacao: SELO_INDICACAO,
  chamado: SELO_CHAMADO,
} as const;

export function SeloStatus({
  tipo,
  valor,
  className,
}: {
  tipo: keyof typeof SELOS;
  valor: string;
  className?: string;
}) {
  const mapa = SELOS[tipo] as Record<string, Selo | undefined>;
  const selo = mapa[valor] ?? {
    texto: valor || "—",
    classe: "bg-slate-100 text-slate-700 border-slate-200",
  };
  return (
    <Badge variant="outline" className={cn("font-ui font-semibold", selo.classe, className)}>
      {selo.texto}
    </Badge>
  );
}

/* ---------------- cabeçalho das telas de serviço ---------------- */

/**
 * O topo de um serviço aberto.
 *
 * Antes cada serviço era um `Dialog`. Um formulário de mudança de endereço
 * dentro de uma caixa que rola por dentro, com o resto da página escurecido
 * atrás, é o pior lugar para preencher oito campos no celular — e um modal não
 * tem endereço próprio: não dá para voltar, recarregar nem mandar o link. Aqui
 * o serviço é a página, e quem escolhe qual é a URL.
 *
 * Por isso também não há moldura: nem cartão, nem borda, nem a faixa azul de
 * título. Uma caixa desenhada em volta do conteúdo é o que faz uma página
 * parecer um pop-up preso no meio dela — o serviço é uma seção da página, e se
 * anuncia como as outras, por um título.
 */
export function TopoServico({
  titulo,
  descricao,
  icone: Icone,
  children,
}: {
  titulo: string;
  descricao: string;
  icone: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
          <Icone className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-xl font-extrabold text-brand-deep sm:text-2xl">
            {titulo}
          </h2>
          <p className="mt-0.5 font-body text-sm text-muted-foreground">{descricao}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/** Rodapé de formulário: cancelar à esquerda, ação à direita, empilhado no celular. */
export function AcoesFormulario({
  aoCancelar,
  rotuloConfirmar,
  enviando,
  desabilitado,
  rotuloCancelar = "Cancelar",
}: {
  aoCancelar: () => void;
  rotuloConfirmar: string;
  enviando: boolean;
  desabilitado?: boolean;
  rotuloCancelar?: string;
}) {
  return (
    <div className="mt-6 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={aoCancelar} disabled={enviando}>
        {rotuloCancelar}
      </Button>
      <Button type="submit" variant="brand" disabled={enviando || desabilitado}>
        {enviando && <Loader2 className="size-4 animate-spin" />}
        {rotuloConfirmar}
      </Button>
    </div>
  );
}

/* ---------------- campos ---------------- */

let sequencia = 0;
const proximoId = () => `campo_${++sequencia}`;

export function Campo({
  rotulo,
  children,
  dica,
  className,
  htmlFor,
}: {
  rotulo: string;
  children: ReactNode;
  dica?: string | undefined;
  className?: string | undefined;
  /** Liga o rótulo ao campo: clicar no texto foca, e o leitor de tela o anuncia. */
  htmlFor?: string | undefined;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label
        htmlFor={htmlFor}
        className="font-ui text-xs font-bold uppercase tracking-wide text-muted-foreground"
      >
        {rotulo}
      </Label>
      {children}
      {dica && <p className="font-body text-xs text-muted-foreground">{dica}</p>}
    </div>
  );
}

export function CampoTexto({
  rotulo,
  valor,
  aoMudar,
  dica,
  className,
  ...props
}: {
  rotulo: string;
  valor: string;
  aoMudar: (valor: string) => void;
  dica?: string | undefined;
  className?: string | undefined;
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "className">) {
  const [id] = useState(proximoId);
  return (
    <Campo rotulo={rotulo} dica={dica} className={className} htmlFor={id}>
      <Input id={id} value={valor} onChange={(e) => aoMudar(e.target.value)} {...props} />
    </Campo>
  );
}

/**
 * Telefone com o DDI colado na frente.
 *
 * O `+55` é fixo e não é editável: o cliente digita o que ele fala ao telefone
 * — DDD e número —, e quem monta o formato internacional é a tela. Antes o
 * campo era texto livre, e o que chegava ao banco ia de `49 99999-8888` a
 * `+55 (49) 9 9999-8888`; nenhum dos dois casa com o outro numa busca, e a
 * indicação virava uma linha que ninguém consegue reencontrar.
 *
 * `valor` guarda só os dígitos nacionais (DDD + 8 ou 9). O DDI entra no envio.
 */
export function CampoTelefone({
  rotulo,
  valor,
  aoMudar,
  dica,
  className,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (digitos: string) => void;
  dica?: string | undefined;
  className?: string | undefined;
}) {
  const [id] = useState(proximoId);
  return (
    <Campo rotulo={rotulo} dica={dica} className={className} htmlFor={id}>
      <div className="flex">
        <span className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-secondary px-3 font-ui text-sm font-semibold text-muted-foreground">
          +55
        </span>
        <Input
          id={id}
          value={maskPhone(valor)}
          onChange={(e) => aoMudar(e.target.value.replace(/\D/g, "").slice(0, 11))}
          inputMode="tel"
          autoComplete="tel-national"
          maxLength={LIMITE.telefone}
          placeholder="(49) 99999-8888"
          className="rounded-l-none"
        />
      </div>
    </Campo>
  );
}

export function CampoTextoLongo({
  rotulo,
  valor,
  aoMudar,
  dica,
  className,
  ...props
}: {
  rotulo: string;
  valor: string;
  aoMudar: (valor: string) => void;
  dica?: string | undefined;
  className?: string | undefined;
} & Omit<React.ComponentProps<typeof Textarea>, "value" | "onChange" | "className">) {
  const [id] = useState(proximoId);
  return (
    <Campo rotulo={rotulo} dica={dica} className={className} htmlFor={id}>
      <Textarea id={id} value={valor} onChange={(e) => aoMudar(e.target.value)} {...props} />
    </Campo>
  );
}

/* ---------------- copiar ---------------- */

/**
 * Copia um texto longo (PIX, linha digitável, link de indicação).
 *
 * `navigator.clipboard` não existe fora de https e o navegador pode negar a
 * permissão; nos dois casos o botão avisa em vez de fingir que copiou.
 */
export function BotaoCopiar({
  texto,
  rotulo = "Copiar",
  variant = "outline",
  className,
}: {
  texto: string;
  rotulo?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  className?: string;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      toast.success("Copiado!");
      setTimeout(() => setCopiado(false), 2200);
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto e copie manualmente.");
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size="sm"
      className={className}
      onClick={() => void copiar()}
      disabled={!texto}
    >
      {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
      {copiado ? "Copiado" : rotulo}
    </Button>
  );
}

/**
 * A tela de "deu certo" de um formulário.
 *
 * Mostra a mensagem que o n8n devolveu, não uma frase escrita aqui: quem sabe
 * se o pedido virou protocolo, agendamento ou análise é o fluxo do outro lado.
 * O protocolo só aparece quando vem na resposta.
 */
export function SucessoEnvio({
  titulo,
  mensagem,
  protocolo,
  children,
}: {
  titulo: string;
  mensagem: string;
  protocolo?: string | undefined;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <div className="grid size-14 place-items-center rounded-full bg-emerald-100 text-emerald-700">
        <Check className="size-7" />
      </div>
      <p className="font-display text-lg font-extrabold text-brand-deep">{titulo}</p>
      <p className="max-w-md font-body text-sm text-muted-foreground">{mensagem}</p>
      {protocolo && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-secondary/60 px-4 py-2">
          <span className="font-ui text-xs text-muted-foreground">Protocolo</span>
          <span className="font-display text-sm font-extrabold tracking-wide text-brand">
            {protocolo}
          </span>
          <BotaoCopiar texto={protocolo} rotulo="Copiar" variant="ghost" />
        </div>
      )}
      {children}
    </div>
  );
}

/** Aviso curto dentro de uma tela — o que o cliente precisa saber antes de enviar. */
export function Nota({ children, tom = "info" }: { children: ReactNode; tom?: "info" | "alerta" }) {
  return (
    <p
      className={cn(
        "rounded-lg border px-3 py-2 font-body text-xs",
        tom === "alerta"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-border bg-secondary/60 text-muted-foreground",
      )}
    >
      {children}
    </p>
  );
}

/**
 * A saída para o comercial.
 *
 * Existe porque nem tudo cabe num formulário: o que o painel não resolve
 * sozinho — um plano menor, uma dúvida de fidelidade — precisa de um lugar
 * para ir que não seja "tente de novo".
 */
export function FalarComComercial({ mensagem, texto }: { mensagem: string; texto: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border bg-secondary/40 p-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="font-body text-xs text-muted-foreground">{texto}</p>
      <Button type="button" variant="outline" size="sm" className="shrink-0" asChild>
        <a href={waLink(mensagem)} target="_blank" rel="noopener">
          <MessageCircle className="size-4" />
          Falar com o comercial
        </a>
      </Button>
    </div>
  );
}

/* ---------------- estados ---------------- */

export function EstadoVazio({
  icone: Icone,
  titulo,
  texto,
}: {
  icone: LucideIcon;
  titulo: string;
  texto: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
      <Icone className="size-8 text-muted-foreground/60" />
      <p className="font-display text-sm font-bold text-foreground">{titulo}</p>
      <p className="max-w-sm font-body text-sm text-muted-foreground">{texto}</p>
    </div>
  );
}

export function CartaoPainel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6", className)}>
      {children}
    </div>
  );
}

export function TituloSecao({ children, acao }: { children: ReactNode; acao?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="font-ui text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {children}
      </h2>
      {acao}
    </div>
  );
}

/** Linha de "rótulo: valor" das fichas técnicas. */
export function LinhaDado({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-2 last:border-0">
      <span className="font-body text-xs text-muted-foreground">{rotulo}</span>
      <span className="text-right font-body text-xs font-semibold text-foreground">
        {valor || "—"}
      </span>
    </div>
  );
}
