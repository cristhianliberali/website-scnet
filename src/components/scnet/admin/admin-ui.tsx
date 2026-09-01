/**
 * As peças da tela do /admin.
 *
 * O painel do cliente é uma vitrine: cor, ícone, um clique por tarefa. Este
 * aqui é uma ferramenta de trabalho — quem está do outro lado abre a tela para
 * mexer em vinte campos e sair. Por isso o visual é mais seco: campo com
 * rótulo, tabela com linha, e nada que dispute atenção com o dado.
 */

import { useState, type ReactNode } from "react";
import { Loader2, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

let sequencia = 0;
const proximoId = () => `admin_${++sequencia}`;

/* ---------------- caixas ---------------- */

export function Cartao({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5", className)}>
      {children}
    </div>
  );
}

export function TituloBloco({ children, acao }: { children: ReactNode; acao?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-display text-base font-extrabold text-brand-deep">{children}</h2>
      {acao}
    </div>
  );
}

export function Vazio({ texto }: { texto: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center font-body text-sm text-muted-foreground">
      {texto}
    </p>
  );
}

/** Número grande do topo — quantos planos, quantas solicitações em aberto. */
export function Indicador({
  rotulo,
  valor,
  icone: Icone,
}: {
  rotulo: string;
  valor: number;
  icone: LucideIcon;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
        <Icone className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block font-display text-xl font-extrabold leading-none text-foreground">
          {valor}
        </span>
        <span className="block font-body text-xs text-muted-foreground">{rotulo}</span>
      </span>
    </div>
  );
}

/* ---------------- campos ---------------- */

export function CampoAdmin({
  rotulo,
  children,
  dica,
  className,
  htmlFor,
}: {
  rotulo: string;
  children: ReactNode;
  dica?: ReactNode | undefined;
  className?: string | undefined;
  /** Liga o rótulo ao campo: clicar no texto foca o campo, e o leitor de tela o anuncia. */
  htmlFor?: string | undefined;
}) {
  return (
    <div className={cn("space-y-1", className)}>
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

export function TextoAdmin({
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
  dica?: ReactNode | undefined;
  className?: string | undefined;
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "className">) {
  const [id] = useState(proximoId);
  return (
    <CampoAdmin rotulo={rotulo} dica={dica} className={className} htmlFor={id}>
      <Input id={id} value={valor} onChange={(e) => aoMudar(e.target.value)} {...props} />
    </CampoAdmin>
  );
}

export function TextoLongoAdmin({
  rotulo,
  valor,
  aoMudar,
  dica,
  className,
  rows = 3,
  ...props
}: {
  rotulo: string;
  valor: string;
  aoMudar: (valor: string) => void;
  dica?: ReactNode | undefined;
  className?: string | undefined;
  rows?: number;
} & Omit<React.ComponentProps<typeof Textarea>, "value" | "onChange" | "className" | "rows">) {
  const [id] = useState(proximoId);
  return (
    <CampoAdmin rotulo={rotulo} dica={dica} className={className} htmlFor={id}>
      <Textarea
        id={id}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        rows={rows}
        {...props}
      />
    </CampoAdmin>
  );
}

export function SelecaoAdmin<T extends string>({
  rotulo,
  valor,
  opcoes,
  aoMudar,
  dica,
  className,
}: {
  rotulo: string;
  valor: T;
  /** `["", "Sem bônus"]` também vale: o vazio precisa de um rótulo próprio. */
  opcoes: readonly (readonly [T, string])[];
  aoMudar: (valor: T) => void;
  dica?: ReactNode | undefined;
  className?: string | undefined;
}) {
  /*
   * O Select do Radix não aceita `value=""` — string vazia é o que ele usa para
   * "nada escolhido". O traço faz o papel do vazio na interface e é convertido
   * de volta na saída.
   */
  const VAZIO = "__vazio__";
  const [id] = useState(proximoId);
  return (
    <CampoAdmin rotulo={rotulo} dica={dica} className={className} htmlFor={id}>
      <Select
        value={valor === ("" as T) ? VAZIO : valor}
        onValueChange={(v) => aoMudar((v === VAZIO ? "" : v) as T)}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {opcoes.map(([v, rotuloOpcao]) => (
            <SelectItem key={v || VAZIO} value={v || VAZIO}>
              {rotuloOpcao}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </CampoAdmin>
  );
}

export function MarcaAdmin({
  rotulo,
  marcado,
  aoMudar,
  dica,
}: {
  rotulo: string;
  marcado: boolean;
  aoMudar: (valor: boolean) => void;
  dica?: string | undefined;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
      <Checkbox checked={marcado} onCheckedChange={(v) => aoMudar(v === true)} />
      <span className="min-w-0">
        <span className="block font-ui text-sm font-bold text-foreground">{rotulo}</span>
        {dica && <span className="block font-body text-xs text-muted-foreground">{dica}</span>}
      </span>
    </label>
  );
}

/* ---------------- ações ---------------- */

export function BotaoSalvar({
  salvando,
  rotulo = "Salvar",
}: {
  salvando: boolean;
  rotulo?: string;
}) {
  return (
    <Button type="submit" variant="brand" size="sm" disabled={salvando}>
      {salvando && <Loader2 className="size-4 animate-spin" />}
      {rotulo}
    </Button>
  );
}

/**
 * Botão que pede confirmação no próprio botão.
 *
 * Um `confirm()` do navegador some no celular e um modal para "tem certeza?"
 * é peso demais. O primeiro clique troca o rótulo; o segundo executa. Sair do
 * botão desarma — quem clicou por engano não precisa fazer nada.
 */
export function BotaoPerigo({
  rotulo,
  confirmacao = "Confirmar?",
  aoConfirmar,
  desabilitado,
}: {
  rotulo: string;
  confirmacao?: string;
  aoConfirmar: () => void;
  desabilitado?: boolean;
}) {
  const [armado, setArmado] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={desabilitado}
      onMouseLeave={() => setArmado(false)}
      onBlur={() => setArmado(false)}
      className={cn(armado && "border-red-300 bg-red-50 text-red-700 hover:bg-red-100")}
      onClick={() => {
        if (!armado) {
          setArmado(true);
          return;
        }
        setArmado(false);
        aoConfirmar();
      }}
    >
      {armado ? confirmacao : rotulo}
    </Button>
  );
}

/** Selo de status, no mesmo espírito do painel do cliente. */
export function SeloAdmin({ texto, tom }: { texto: string; tom: "aberto" | "ok" | "off" }) {
  const classe =
    tom === "ok"
      ? "border-emerald-200 bg-emerald-100 text-emerald-800"
      : tom === "off"
        ? "border-slate-200 bg-slate-100 text-slate-600"
        : "border-amber-200 bg-amber-100 text-amber-900";
  return (
    <span
      className={cn(
        "inline-block whitespace-nowrap rounded-full border px-2 py-0.5 font-ui text-[11px] font-bold",
        classe,
      )}
    >
      {texto}
    </span>
  );
}

/**
 * Uma linha que abre.
 *
 * A lista mostra o essencial; o formulário inteiro só aparece quando alguém
 * decide mexer naquela linha. É o que permite ter trinta planos na tela sem
 * trinta formulários montados junto.
 */
export function LinhaExpansivel({
  resumo,
  aberto,
  aoAlternar,
  children,
}: {
  resumo: ReactNode;
  aberto: boolean;
  aoAlternar: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("rounded-xl border", aberto ? "border-brand/50 bg-brand/5" : "border-border")}
    >
      <button
        type="button"
        onClick={aoAlternar}
        className="flex w-full cursor-pointer items-center justify-between gap-3 p-3 text-left"
      >
        {resumo}
      </button>
      {aberto && <div className="border-t border-border/60 p-3 sm:p-4">{children}</div>}
    </div>
  );
}
