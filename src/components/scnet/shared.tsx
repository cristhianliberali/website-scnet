import { type ReactNode } from "react";
import { useReveal } from "@/hooks/use-reveal";
import { cn } from "@/lib/utils";

export const WHATSAPP_NUMBER = "5549999999999";

export function waLink(message: string) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li" | "article";
}) {
  const { ref, visible } = useReveal<HTMLDivElement>();
  return (
    <Tag
      ref={ref as never}
      data-visible={visible}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn("reveal", className)}
    >
      {children}
    </Tag>
  );
}

export function Blobs({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className="animate-blob absolute -left-24 top-10 h-72 w-72 rounded-full bg-brand/30 blur-3xl" />
      <div className="animate-blob absolute -right-16 top-1/3 h-80 w-80 rounded-full bg-zap/25 blur-3xl [animation-delay:-6s]" />
      <div className="animate-blob absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-brand-deep/30 blur-3xl [animation-delay:-12s]" />
    </div>
  );
}

export function SectionTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl md:text-5xl",
        className,
      )}
    >
      {children}
    </h2>
  );
}