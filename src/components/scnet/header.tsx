/**
 * O cabeçalho fixo, presente em todas as páginas.
 *
 * Os destinos vêm de `lib/links.ts`, e não estão escritos aqui: o rodapé mostra
 * os mesmos lugares, e duas listas soltas discordariam na primeira mudança. Lá
 * também está o motivo de cada link de seção ser `/#planos` e não `#planos` —
 * a âncora seca só funcionava na home.
 */

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import logoBranca from "@/assets/logo-scnet-branca.webp";
import { Button } from "@/components/ui/button";
import { LinkDeMenu } from "@/components/scnet/shared";
import { eventoDeClique } from "@/lib/datalayer";
import { MENU_CELULAR, MENU_PRINCIPAL, MENU_SOLUCOES } from "@/lib/links";
import { cn } from "@/lib/utils";

const itemDesktop = "rounded-md px-3 py-2 transition hover:bg-primary-foreground/10";

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled ? "gradient-brand shadow-lg backdrop-blur-md" : "bg-transparent",
      )}
    >
      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 sm:py-4 lg:flex lg:justify-between lg:py-6">
        {/* a logo leva para a home, e não para `#top` — de outra página, `#top` não é lugar nenhum */}
        <Link to="/" className="shrink-0" aria-label="SCNET — página inicial">
          <img src={logoBranca} alt="SCNET" className="h-9 w-auto object-contain sm:h-10 lg:h-14" />
        </Link>

        <nav className="hidden items-center gap-1 font-ui text-sm font-semibold text-primary-foreground/90 lg:flex">
          <LinkDeMenu
            item={MENU_PRINCIPAL[0] as (typeof MENU_PRINCIPAL)[number]}
            className={itemDesktop}
          />

          <div className="group relative">
            <button className="flex items-center gap-1 rounded-md px-3 py-2 transition hover:bg-primary-foreground/10">
              Nossas soluções <ChevronDown className="size-4" />
            </button>
            <div className="invisible absolute left-0 top-full w-56 translate-y-2 rounded-xl border border-border bg-card p-2 opacity-0 shadow-xl transition-all group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
              {MENU_SOLUCOES.map((item) => (
                <LinkDeMenu
                  key={item.rotulo}
                  item={item}
                  className="block rounded-lg px-3 py-2 text-card-foreground transition hover:bg-secondary hover:text-brand"
                />
              ))}
            </div>
          </div>

          {MENU_PRINCIPAL.slice(1).map((item) => (
            <LinkDeMenu key={item.rotulo} item={item} className={itemDesktop} />
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button
            variant="onbrand"
            className="hidden shadow-[0_0_18px_color-mix(in_oklab,var(--color-zap)_45%,transparent)] sm:inline-flex"
            asChild
          >
            <Link
              to="/cliente"
              onClick={() =>
                eventoDeClique("area_do_cliente", {
                  texto: "Área do cliente",
                  local: "cabecalho",
                  destino: "/cliente",
                })
              }
            >
              Área do cliente
            </Link>
          </Button>
          <button
            aria-label="Abrir menu"
            aria-expanded={open}
            className="rounded-md p-2 text-primary-foreground lg:hidden"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="block h-0.5 w-6 bg-current" />
            <span className="mt-1.5 block h-0.5 w-6 bg-current" />
            <span className="mt-1.5 block h-0.5 w-6 bg-current" />
          </button>
        </div>
      </div>

      {open && (
        <div className="gradient-brand border-t border-primary-foreground/15 px-4 pb-4 font-ui text-primary-foreground lg:hidden">
          {MENU_CELULAR.map((item) => (
            <LinkDeMenu
              key={item.rotulo}
              item={item}
              onClick={() => setOpen(false)}
              className="block border-b border-primary-foreground/10 py-3 text-sm font-semibold"
            />
          ))}
        </div>
      )}
    </header>
  );
}
