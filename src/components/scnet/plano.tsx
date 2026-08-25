/**
 * Peças visuais do plano compartilhadas pela home e pelo formulário de
 * contratação: preço (com a promoção das primeiras faturas), composição em
 * itens com ícone de check e os logos dos agregados.
 */

import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { precoVigente, textoPosDesconto, type Plan } from "@/lib/plans";
import { HASH_FORMULARIO } from "@/lib/links";

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

/**
 * Mostrado no lugar dos cards quando a consulta ao banco não trouxe plano
 * nenhum. Sem lista de reserva, a saída do cliente é deixar o contato — e o
 * motivo real fica no log do servidor.
 *
 * O `destino` existe porque este bloco aparece em duas páginas. Na home, o
 * formulário está logo abaixo e o fragmento sozinho basta: rola até ele sem
 * recarregar, preservando as UTMs e o `codigo_oferta` da URL. Na
 * `/contratacao` não há seção nenhuma para ancorar, e quem chama passa o
 * endereço completo.
 */
export function PlanosIndisponiveis({
  className,
  destino = HASH_FORMULARIO,
}: {
  className?: string;
  destino?: string;
}) {
  return (
    <div
      className={cn("rounded-3xl border border-border bg-card p-8 text-center sm:p-10", className)}
    >
      <p className="font-ui text-lg font-semibold text-brand-deep">
        Não foi possível carregar os planos agora
      </p>
      <p className="mx-auto mt-2 max-w-md font-body text-sm text-muted-foreground">
        É coisa rápida. Deixe seu nome e telefone no formulário que um consultor passa os planos e
        as condições na hora.
      </p>
      <Button variant="zap" size="xl" className="mt-6" asChild>
        <a href={destino}>
          Falar com um consultor
          <ArrowRight className="size-5" />
        </a>
      </Button>
    </div>
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
