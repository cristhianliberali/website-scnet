/**
 * Peças visuais do plano compartilhadas pela home e pelo formulário de
 * contratação: preço (com a promoção das primeiras faturas), composição em
 * itens com ícone de check e os logos dos agregados.
 */

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { precoVigente, textoPosDesconto, type Plan } from "@/lib/plans";

/** Título fixo acima dos logos dos agregados. */
export const TITULO_AGREGADOS = "O que você leva";

/**
 * Preço em destaque. Quando o plano tem `valor_primeiras_faturas`, é ele que
 * aparece no lugar do preço, com o valor padrão logo abaixo — o desconto
 * ganha destaque sem precisar de nenhum selo extra.
 */
export function PrecoPlano({ plan, featured }: { plan: Plan; featured?: boolean }) {
  const posDesconto = textoPosDesconto(
    plan.valor,
    plan.valor_primeiras_faturas,
    plan.quant_meses_desconto,
  );
  return (
    <div>
      <p className="font-display text-3xl font-extrabold tracking-tight">
        <span className="align-super text-lg">R$</span>{" "}
        {precoVigente(plan.valor, plan.valor_primeiras_faturas)}
        <span
          className={cn(
            "font-body text-sm font-medium",
            featured ? "text-primary-foreground/70" : "text-muted-foreground",
          )}
        >
          /mês
        </span>
      </p>
      {posDesconto && (
        <p
          className={cn(
            "mt-1 font-body text-xs",
            featured ? "text-primary-foreground/75" : "text-muted-foreground",
          )}
        >
          {posDesconto}
        </p>
      )}
    </div>
  );
}

/** Logos dos agregados — sempre abaixo do valor, com ~30px de altura. */
export function LogosAgregados({
  logos,
  featured,
  className,
}: {
  logos: string[];
  featured?: boolean;
  className?: string;
}) {
  if (!logos.length) return null;
  return (
    <div className={cn("mt-4", className)}>
      <p
        className={cn(
          "font-ui text-xs font-bold uppercase tracking-wide",
          featured ? "text-zap" : "text-brand",
        )}
      >
        {TITULO_AGREGADOS}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {logos.map((src) => (
          <img
            key={src}
            src={src}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="h-[30px] w-auto max-w-[96px] object-contain"
          />
        ))}
      </div>
    </div>
  );
}

/** Composição do plano: um item por linha, todos com ícone de check. */
export function ItensPlano({
  itens,
  featured,
  className,
}: {
  itens: string[];
  featured?: boolean;
  className?: string;
}) {
  if (!itens.length) return null;
  return (
    <ul className={cn("space-y-2", className)}>
      {itens.map((item) => (
        <li key={item} className="flex items-start gap-2 font-body text-sm">
          <Check
            className={cn("mt-0.5 size-4 shrink-0", featured ? "text-zap" : "text-brand")}
            strokeWidth={3}
            aria-hidden="true"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Selo do plano em destaque — usa `nome_destaque` quando o banco traz um. */
export function SeloDestaque({ plan, className }: { plan: Plan; className?: string }) {
  if (!plan.destaque) return null;
  return (
    <span
      className={cn(
        "absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-zap px-4 py-1 font-ui text-xs font-extrabold tracking-wide text-zap-ink",
        className,
      )}
    >
      {plan.nome_destaque ?? "Mais escolhido"}
    </span>
  );
}
