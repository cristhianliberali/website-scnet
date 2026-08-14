import { useCallback, useEffect, useState, type ReactNode } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Carrossel horizontal com paginação em pontos e traços: o indicador da
 * página atual vira um traço, os demais ficam como pontos.
 *
 * Cuida para que sombra, hover e selos dos cards não sejam cortados nas bordas
 * — ver os comentários do viewport e dos véus laterais.
 */
export function Carrossel({
  slides,
  slideClassName,
  label,
  fundo = "from-background",
}: {
  slides: ReactNode[];
  /** Largura de cada slide (basis-*) — define quantos aparecem por vez. */
  slideClassName?: string;
  /** Rótulo acessível da região do carrossel. */
  label: string;
  /**
   * Cor de fundo da seção, no formato `from-*`, usada pelos véus das bordas.
   * Precisa bater com o fundo de quem usa o carrossel.
   */
  fundo?: string;
}) {
  const [emblaRef, embla] = useEmblaCarousel({
    align: "start",
    containScroll: "trimSnaps",
  });
  const [snaps, setSnaps] = useState<number[]>([]);
  const [selected, setSelected] = useState(0);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  useEffect(() => {
    if (!embla) return;
    const update = () => {
      setSnaps(embla.scrollSnapList());
      setSelected(embla.selectedScrollSnap());
      setCanPrev(embla.canScrollPrev());
      setCanNext(embla.canScrollNext());
    };
    update();
    embla.on("select", update).on("reInit", update);
    return () => {
      embla.off("select", update).off("reInit", update);
    };
  }, [embla]);

  const scrollTo = useCallback((index: number) => embla?.scrollTo(index), [embla]);

  const arrow =
    "grid size-11 place-items-center rounded-full border border-border bg-card text-brand transition hover:border-brand hover:bg-brand hover:text-primary-foreground disabled:pointer-events-none disabled:opacity-40";

  /**
   * Véus laterais: na horizontal o recorte é inevitável (é ele que esconde os
   * slides de fora) e cortar a sombra a seco deixa uma linha vertical visível.
   * Estas duas faixas de 16px vão da cor do fundo até transparente, dissolvendo
   * a borda no lugar do corte seco. `-inset-y-8` cobre também a sombra que
   * escapa acima e abaixo do viewport, que é recortada no mesmo x.
   */
  const veu = "pointer-events-none absolute -inset-y-8 w-4 to-transparent";

  return (
    <div role="region" aria-roledescription="carrossel" aria-label={label}>
      <div className="relative">
        {/* overflow-x-clip (e não overflow-hidden) recorta só na horizontal,
            que é o que o carrossel precisa: no eixo vertical nada é cortado,
            então o selo do card em destaque, o hover que levanta o card e a
            cauda da sombra aparecem inteiros. O padding vertical é só respiro;
            o px-4 com -mx-4 afasta o recorte lateral da borda dos cards sem
            mexer na largura dos slides (16px é o limite: é o padding da seção,
            e passar disso faria a página rolar de lado no celular). */}
        <div className="-mx-4 overflow-x-clip px-4 pb-6 pt-8" ref={emblaRef}>
          <div className="-ml-5 flex touch-pan-y">
            {slides.map((slide, i) => (
              <div
                key={i}
                className={cn("min-w-0 shrink-0 grow-0 pl-5", slideClassName ?? "basis-full")}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} de ${slides.length}`}
              >
                {slide}
              </div>
            ))}
          </div>
        </div>
        <span aria-hidden className={cn(veu, "-left-4 bg-linear-to-r", fundo)} />
        <span aria-hidden className={cn(veu, "-right-4 bg-linear-to-l", fundo)} />
      </div>

      {snaps.length > 1 && (
        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            type="button"
            aria-label="Planos anteriores"
            className={cn(arrow, "hidden sm:grid")}
            disabled={!canPrev}
            onClick={() => embla?.scrollPrev()}
          >
            <ChevronLeft className="size-5" />
          </button>

          <div className="flex items-center gap-2">
            {snaps.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Ir para o slide ${i + 1}`}
                aria-current={i === selected}
                onClick={() => scrollTo(i)}
                className={cn(
                  "h-2.5 rounded-full transition-all duration-300",
                  i === selected ? "w-8 bg-brand" : "w-2.5 bg-brand/25 hover:bg-brand/50",
                )}
              />
            ))}
          </div>

          <button
            type="button"
            aria-label="Próximos planos"
            className={cn(arrow, "hidden sm:grid")}
            disabled={!canNext}
            onClick={() => embla?.scrollNext()}
          >
            <ChevronRight className="size-5" />
          </button>
        </div>
      )}
    </div>
  );
}
