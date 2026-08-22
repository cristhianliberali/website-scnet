/**
 * O catálogo de serviços e a tela em que um deles fica aberto.
 *
 * O painel tem duas maneiras de chegar a um serviço, e as duas saem daqui:
 * a **grade** da visão geral (`GradeServicos`) e a **navegação** que acompanha
 * o serviço aberto. Uma lista só, para as duas nunca discordarem sobre o que
 * existe.
 *
 * A tela aberta não é um modal: o serviço ocupa a página, e os outros ficam à
 * vista — na lateral no desktop, numa faixa que rola acima no celular. É a
 * diferença entre trocar de serviço com um clique e ter que fechar uma caixa
 * para abrir outra.
 */

import type { ReactNode } from "react";
import {
  ArrowLeft,
  FileSpreadsheet,
  Headphones,
  QrCode,
  Receipt,
  ShieldCheck,
  Truck,
  UserCheck,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ServicoPainelId } from "./painel-ui";

export type ServicoPainel = {
  id: ServicoPainelId;
  titulo: string;
  icone: LucideIcon;
  cor: string;
  /**
   * Fora da grade da visão geral. O desbloqueio em confiança só faz sentido
   * para quem está com fatura vencida, e é o banner financeiro que o oferece —
   * mas, uma vez aberto, ele aparece na navegação como qualquer outro.
   */
  oculto?: boolean;
};

export const SERVICOS: ServicoPainel[] = [
  { id: "trocar_plano", titulo: "Trocar de plano", icone: Zap, cor: "bg-brand/10 text-brand" },
  {
    id: "indicacoes",
    titulo: "Minhas indicações",
    icone: Users,
    cor: "bg-emerald-100 text-emerald-700",
  },
  {
    id: "pix_debito",
    titulo: "PIX e débito automático",
    icone: QrCode,
    cor: "bg-orange-100 text-orange-700",
  },
  {
    id: "mudanca_endereco",
    titulo: "Mudança de endereço",
    icone: Truck,
    cor: "bg-violet-100 text-violet-700",
  },
  {
    id: "trocar_titular",
    titulo: "Trocar titular",
    icone: UserCheck,
    cor: "bg-indigo-100 text-indigo-700",
  },
  { id: "segunda_via", titulo: "2ª via de fatura", icone: Receipt, cor: "bg-red-100 text-red-700" },
  {
    id: "notas_fiscais",
    titulo: "Notas fiscais",
    icone: FileSpreadsheet,
    cor: "bg-teal-100 text-teal-700",
  },
  { id: "suporte", titulo: "Suporte técnico", icone: Headphones, cor: "bg-sky-100 text-sky-700" },
  {
    id: "desbloqueio",
    titulo: "Desbloqueio em confiança",
    icone: ShieldCheck,
    cor: "bg-amber-100 text-amber-800",
    oculto: true,
  },
];

export const servicoPorId = (id: ServicoPainelId): ServicoPainel =>
  SERVICOS.find((s) => s.id === id) ?? (SERVICOS[0] as ServicoPainel);

/**
 * A tela de um serviço.
 *
 * O mesmo componente serve os dois formatos: no desktop a navegação é uma
 * coluna à esquerda; abaixo de `lg` ela vira uma faixa horizontal acima do
 * conteúdo, que rola com o dedo. Nos dois casos o serviço aberto continua na
 * lista, marcado — some da lista é o que faz o cliente perder o lugar.
 */
export function TelaServico({
  servico,
  servicosOcultos,
  aoAbrir,
  aoVoltar,
  children,
}: {
  servico: ServicoPainelId;
  /** Desligados no /admin. Somem da navegação como somem da grade. */
  servicosOcultos: readonly ServicoPainelId[];
  aoAbrir: (id: ServicoPainelId) => void;
  aoVoltar: () => void;
  children: ReactNode;
}) {
  const visiveis = SERVICOS.filter(
    (s) => (!s.oculto || s.id === servico) && !servicosOcultos.includes(s.id),
  );

  return (
    <div className="space-y-4">
      <Button type="button" variant="outline" size="sm" onClick={aoVoltar}>
        <ArrowLeft className="size-4" />
        Voltar ao painel
      </Button>

      <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
        {/*
          `order` inverte a posição sem duplicar a lista: a navegação é o
          primeiro filho (e por isso fica acima no celular) e vai para a coluna
          da esquerda a partir de `lg`.
        */}
        {/*
          `min-w-0` não é detalhe: um item de grid tem largura mínima igual ao
          conteúdo, então sem ele a faixa de serviços do celular estica a grade
          inteira até caber os oito botões — e a página ganha uma barra de
          rolagem horizontal em vez de a faixa rolar por dentro.
        */}
        <nav
          aria-label="Serviços"
          className="min-w-0 lg:order-first lg:col-span-3 xl:col-span-3"
          data-testid="navegacao-servicos"
        >
          <p className="mb-2 hidden font-ui text-xs font-bold uppercase tracking-widest text-muted-foreground lg:block">
            Serviços
          </p>

          <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
            {visiveis.map((item) => {
              const Icone = item.icone;
              const atual = item.id === servico;
              return (
                <li key={item.id} className="snap-start">
                  <button
                    type="button"
                    onClick={() => aoAbrir(item.id)}
                    aria-current={atual ? "page" : undefined}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl border p-2.5 text-left transition-colors lg:whitespace-normal",
                      atual
                        ? "border-brand bg-brand/5"
                        : "border-border bg-card hover:border-brand/40",
                    )}
                  >
                    <span
                      className={cn("grid size-8 shrink-0 place-items-center rounded-lg", item.cor)}
                    >
                      <Icone className="size-4" />
                    </span>
                    <span
                      className={cn(
                        "font-ui text-xs font-bold leading-snug",
                        atual ? "text-brand" : "text-foreground",
                      )}
                    >
                      {item.titulo}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 lg:col-span-9 xl:col-span-9">{children}</div>
      </div>
    </div>
  );
}
