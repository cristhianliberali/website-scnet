import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import logoBranca from "@/assets/logo-scnet-branca.webp";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const solutions = [
  { label: "Para mim", href: "#planos" },
  { label: "Para minha empresa", href: "#empresas" },
  { label: "Condomínios", href: "#empresas" },
  { label: "Internet rural", href: "#planos" },
];

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
      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-7 lg:flex lg:justify-between">
        <a href="#top" className="shrink-0">
          <img src={logoBranca} alt="SCNET" className="h-12 w-auto object-contain sm:h-14" />
        </a>

        <nav className="hidden items-center gap-1 font-ui text-sm font-semibold text-primary-foreground/90 lg:flex">
          <a
            className="rounded-md px-3 py-2 transition hover:bg-primary-foreground/10"
            href="#planos"
          >
            Planos
          </a>
          <div className="group relative">
            <button className="flex items-center gap-1 rounded-md px-3 py-2 transition hover:bg-primary-foreground/10">
              Nossas soluções <ChevronDown className="size-4" />
            </button>
            <div className="invisible absolute left-0 top-full w-56 translate-y-2 rounded-xl border border-border bg-card p-2 opacity-0 shadow-xl transition-all group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
              {solutions.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  className="block rounded-lg px-3 py-2 text-card-foreground transition hover:bg-secondary hover:text-brand"
                >
                  {s.label}
                </a>
              ))}
            </div>
          </div>
          <a
            className="rounded-md px-3 py-2 transition hover:bg-primary-foreground/10"
            href="#depoimentos"
          >
            Depoimentos
          </a>
          <a
            className="rounded-md px-3 py-2 transition hover:bg-primary-foreground/10"
            href="#duvidas"
          >
            Dúvidas
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <Button
            variant="onbrand"
            className="hidden shadow-[0_0_18px_color-mix(in_oklab,var(--color-zap)_45%,transparent)] sm:inline-flex"
            asChild
          >
            <a href="#top">Área do cliente</a>
          </Button>
          <button
            aria-label="Abrir menu"
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
          {[
            { label: "Planos", href: "#planos" },
            ...solutions,
            { label: "Depoimentos", href: "#depoimentos" },
            { label: "Dúvidas", href: "#duvidas" },
            { label: "Área do cliente", href: "#top" },
          ].map((l) => (
            <a
              key={l.label}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block border-b border-primary-foreground/10 py-3 text-sm font-semibold"
            >
              {l.label}
            </a>
          ))}
        </div>
      )}
    </header>
  );
}
