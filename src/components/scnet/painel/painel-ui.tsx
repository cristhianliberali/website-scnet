/**
 * As peças que todas as telas do painel usam: formatação, selos de status,
 * a moldura dos modais e os campos de formulário.
 *
 * Tudo aqui é apresentação. Nenhuma peça deste arquivo fala com o webhook —
 * quem faz isso é `use-painel.ts`.
 */

import { useState, type ReactNode } from "react";
import { Check, Copy, Loader2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { data, moeda } from "@/lib/painel-formato";
import { cn } from "@/lib/utils";
import type {
  StatusChamado,
  StatusConexao,
  StatusFatura,
  StatusFinanceiro,
  StatusIndicacao,
} from "@/lib/painel-tipos";

/**
 * Qual modal está aberto. Um por serviço da grade, mais os que abrem a partir
 * do banner financeiro e dos cards de contrato.
 */
export type ModalPainelId =
  | "trocar_plano"
  | "indicacoes"
  | "pix_debito"
  | "mudanca_endereco"
  | "trocar_titular"
  | "segunda_via"
  | "notas_fiscais"
  | "suporte"
  | "desbloqueio"
  | "teste_velocidade";

/* ---------------- selos de status ---------------- */

type Selo = { texto: string; classe: string };

const SELO_FINANCEIRO: Record<StatusFinanceiro, Selo> = {
  em_dia: { texto: "Em dia", classe: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  em_aberto: { texto: "Em aberto", classe: "bg-amber-100 text-amber-900 border-amber-200" },
  vencido: { texto: "Vencido", classe: "bg-red-100 text-red-800 border-red-200" },
};

const SELO_CONEXAO: Record<StatusConexao, Selo> = {
  online: { texto: "Conectado", classe: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  alerta: { texto: "Instável", classe: "bg-amber-100 text-amber-900 border-amber-200" },
  offline: { texto: "Sem sinal", classe: "bg-red-100 text-red-800 border-red-200" },
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

const SELOS = {
  financeiro: SELO_FINANCEIRO,
  conexao: SELO_CONEXAO,
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

/* ---------------- moldura dos modais ---------------- */

export function ModalPainel({
  aberto,
  aoFechar,
  titulo,
  descricao,
  icone: Icone,
  children,
  largura = "max-w-2xl",
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao: string;
  icone: LucideIcon;
  children: ReactNode;
  largura?: string;
}) {
  return (
    <Dialog open={aberto} onOpenChange={(estado) => !estado && aoFechar()}>
      <DialogContent className={cn("max-h-[92vh] overflow-y-auto p-0 sm:rounded-2xl", largura)}>
        <DialogHeader className="gradient-brand space-y-1 rounded-t-2xl px-6 py-5 text-left">
          <DialogTitle className="flex items-center gap-2 font-display text-lg font-extrabold text-primary-foreground">
            <Icone className="size-5 shrink-0" />
            {titulo}
          </DialogTitle>
          <DialogDescription className="font-body text-sm text-primary-foreground/85">
            {descricao}
          </DialogDescription>
        </DialogHeader>
        <div className="px-6 pb-6">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

/** Rodapé de modal: cancelar à esquerda, ação à direita, empilhado no celular. */
export function AcoesModal({
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
}: {
  rotulo: string;
  children: ReactNode;
  dica?: string | undefined;
  className?: string | undefined;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="font-ui text-xs font-bold uppercase tracking-wide text-muted-foreground">
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
    <Campo rotulo={rotulo} dica={dica} className={className}>
      <Input id={id} value={valor} onChange={(e) => aoMudar(e.target.value)} {...props} />
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
  return (
    <Campo rotulo={rotulo} dica={dica} className={className}>
      <Textarea value={valor} onChange={(e) => aoMudar(e.target.value)} {...props} />
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

/** Aviso curto dentro de um modal — o que o cliente precisa saber antes de enviar. */
export function NotaModal({
  children,
  tom = "info",
}: {
  children: ReactNode;
  tom?: "info" | "alerta";
}) {
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
