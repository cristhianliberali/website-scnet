import { useCallback, useEffect, useState, type ReactNode } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Carrossel horizontal com paginação em pontos e traços: o indicador da
 * página atual vira um traço, os demais ficam como pontos.
 */
export function Carrossel({
  slides,
  slideClassName,
  label,
}: {
  slides: ReactNode[];
  /** Largura de cada slide (basis-*) — define quantos aparecem por vez. */
  slideClassName?: string;
  /** Rótulo acessível da região do carrossel. */
  label: string;
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

  return (
    <div role="region" aria-roledescription="carrossel" aria-label={label}>
      {/* O overflow-hidden do Embla corta tudo que passa da borda, então a
          folga vertical precisa acomodar o selo do plano em destaque (12px
          acima do card) somados aos 12px que o hover levanta — daí os 40px de
          py-10, com margem para o brilho da sombra. */}
      <div className="overflow-hidden py-10" ref={emblaRef}>
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

      {snaps.length > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4">
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
