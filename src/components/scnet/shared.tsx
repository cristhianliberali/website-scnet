import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useReveal } from "@/hooks/use-reveal";
import { cn } from "@/lib/utils";
import type { ItemDeMenu } from "@/lib/links";

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
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      <div className="animate-blob absolute -left-24 top-10 h-72 w-72 rounded-full bg-brand/30 blur-3xl" />
      <div className="animate-blob absolute -right-16 top-1/3 h-80 w-80 rounded-full bg-zap/25 blur-3xl [animation-delay:-6s]" />
      <div className="animate-blob absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-brand-deep/30 blur-3xl [animation-delay:-12s]" />
    </div>
  );
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
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
/**
 * Um item de menu que sabe para onde vai.
 *
 * Três destinos, três comportamentos, um componente — porque o cabeçalho e o
 * rodapé mostram a mesma lista de lugares e não deviam discordar sobre como
 * chegar neles:
 *
 * - **Seção da home** → `<Link to="/" hash="planos">`. O roteador navega e
 *   rola até a seção; de dentro do painel do cliente isso é uma viagem de
 *   página, e continua funcionando.
 * - **Rota interna** → `<Link>`, sem recarregar nada.
 * - **Fora do site** → `<a target="_blank" rel="noopener noreferrer">`. O
 *   `noopener` não é enfeite: sem ele a página aberta ganha uma referência de
 *   volta para esta.
 */
export function LinkDeMenu({
  item,
  className,
  onClick,
  children,
}: {
  item: ItemDeMenu;
  className?: string;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const conteudo = children ?? item.rotulo;
  const titulo = item.titulo ?? item.rotulo;

  if (item.href) {
    return (
      <a
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        onClick={onClick}
        {...(item.titulo ? { "aria-label": titulo } : {})}
      >
        {conteudo}
      </a>
    );
  }

  if (item.hash) {
    return (
      <Link to="/" hash={item.hash} className={className} onClick={onClick}>
        {conteudo}
      </Link>
    );
  }

  return (
    <Link
      to={item.to ?? "/"}
      {...(item.search ? { search: item.search as never } : {})}
      className={className}
      onClick={onClick}
    >
      {conteudo}
    </Link>
  );
}
