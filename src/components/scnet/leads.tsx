/**
 * As seções da landing page de tráfego pago (`/leads`).
 *
 * ## O que muda em relação à home, e por quê
 *
 * Quem chega aqui clicou num anúncio (Meta, Google, TikTok) e está no celular
 * em três de cada quatro casos. A página existe para UMA coisa — o formulário —
 * e cada decisão abaixo tira do caminho o que compete com ele:
 *
 * - **Sem menu.** Todo link que sai da página é um lead que foi embora. O
 *   cabeçalho tem a logo e um botão para o formulário, só.
 * - **Formulário na primeira tela.** No celular ele vem logo depois da
 *   chamada, antes de qualquer seção. Quem já decidiu não precisa rolar.
 * - **Preço na chamada.** "A partir de R$ 109,90" na primeira frase corta
 *   quem não tem intenção e segura quem tem — sai do banco, não do código.
 * - **Barra fixa no celular.** Some quando o formulário está na tela; fora
 *   dele, o botão está sempre a um toque.
 * - **Cada seção responde uma objeção.** Prova social (é confiável?), planos
 *   (quanto custa?), como funciona (dá trabalho?), depoimentos (funciona?),
 *   dúvidas (fidelidade, instalação, cobertura) — e todas terminam no
 *   formulário.
 *
 * Os componentes visuais (Blobs, Reveal, PlanoCard, ContractForm, Depoimentos)
 * são os mesmos da home: a página é uma recombinação, não um site à parte.
 */

import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Headset,
  MapPin,
  MessageCircle,
  Router,
  ShieldCheck,
  Star,
  Users,
  Wifi,
  Wrench,
  Zap,
} from "lucide-react";
import logoBranca from "@/assets/logo-scnet-branca.webp";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useCountUp } from "@/hooks/use-reveal";
import { eventoDeClique } from "@/lib/datalayer";
import { ANCORA_FORMULARIO, HASH_FORMULARIO } from "@/lib/links";
import type { Plan } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { Blobs, Reveal, SectionTitle } from "./shared";
import { Carrossel } from "./carrossel";
import { PlanosIndisponiveis } from "./plano";
import { PlanoCard } from "./sections";
import type { SelectedPlan } from "./contract-form";

/** Botão que leva ao formulário, com o evento de clique já anotado. */
function CtaFormulario({
  botao,
  local,
  children,
  className,
  size = "xl",
}: {
  botao: string;
  local: string;
  children: ReactNode;
  className?: string;
  size?: "lg" | "xl" | "hero";
}) {
  return (
    <Button variant="zap" size={size} className={className} asChild>
      <a
        href={HASH_FORMULARIO}
        onClick={() => eventoDeClique(botao, { local, destino: HASH_FORMULARIO })}
      >
        {children}
      </a>
    </Button>
  );
}

/* ---------------- Cabeçalho ---------------- */

/**
 * Cabeçalho sem navegação: a logo e o botão do formulário. Fica com a cor da
 * marca desde o início — sobre o hero (também da marca) ele se funde, e ao
 * rolar continua visível sem trocar de estado.
 */
export function HeaderLeads() {
  const [scrolled, setScrolled] = useState(false);

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
        scrolled ? "gradient-brand shadow-lg" : "bg-transparent",
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:py-4">
        <a href="#top" aria-label="SCNET — topo da página" className="shrink-0">
          <img src={logoBranca} alt="SCNET" className="h-8 w-auto object-contain sm:h-10" />
        </a>
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-1.5 rounded-full bg-primary-foreground/15 px-3 py-1.5 font-ui text-xs font-semibold text-primary-foreground sm:inline-flex">
            <Star className="size-3.5 fill-zap text-zap" /> 4.9/5 no Google
          </span>
          <CtaFormulario botao="contratar_cabecalho" local="leads_cabecalho" size="lg">
            Quero contratar
          </CtaFormulario>
        </div>
      </div>
    </header>
  );
}

/* ---------------- Hero ---------------- */

const promessas = [
  "Roteador Wi-Fi incluso, instalado pela nossa equipe",
  "Instalação grátis na maioria dos planos*",
  "Suporte de gente da sua cidade, sem robô travado",
];

/**
 * A primeira tela.
 *
 * No celular a ordem é chamada → formulário → argumentos: o formulário entra na
 * primeira dobra, e o parágrafo, as promessas e os números vêm logo abaixo,
 * para quem ainda precisa ser convencido. Em telas largas a chamada e os
 * argumentos ficam à esquerda e o formulário à direita, ocupando as duas
 * linhas da grade — é o mesmo HTML, só a grade muda.
 */
export function HeroLeads({
  precoMinimo,
  children,
}: {
  precoMinimo: string | null;
  children: ReactNode;
}) {
  return (
    <section
      id="top"
      className="gradient-brand relative overflow-x-clip pb-12 pt-20 sm:pt-24 lg:pb-20 lg:pt-32"
    >
      <Blobs />
      <div className="relative mx-auto grid max-w-7xl gap-6 px-4 lg:grid-cols-[minmax(0,1fr)_480px] lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-6">
        <div className="text-left lg:col-start-1 lg:row-start-1">
          <Reveal>
            <span className="font-ui inline-flex items-center gap-2 rounded-full bg-zap px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-zap-ink sm:px-4 sm:py-1.5 sm:text-xs">
              <ShieldCheck className="size-3.5 shrink-0 sm:size-4" />
              Internet nota 4.9/5 no Google!
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-4 font-display text-[2rem] font-extrabold leading-[1.08] tracking-tight text-primary-foreground sm:text-5xl lg:text-[3.4rem]">
              Wi-Fi rápido e estável na casa toda
              {precoMinimo && (
                <span className="mt-2 block text-zap">a partir de R$&nbsp;{precoMinimo}/mês</span>
              )}
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-3 max-w-xl font-body text-base text-primary-foreground/90 sm:text-lg">
              Deixe seu nome e WhatsApp: um consultor confirma a cobertura no seu endereço e agenda
              a instalação.
            </p>
          </Reveal>
        </div>

        {/* O formulário não entra no Reveal: precisa estar na tela no instante
            em que a página abre, e não meio segundo depois. */}
        <div className="w-full lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:justify-self-end">
          {children}
        </div>

        <div className="text-left lg:col-start-1 lg:row-start-2">
          <Reveal delay={120}>
            <ul className="space-y-2.5">
              {promessas.map((texto) => (
                <li
                  key={texto}
                  className="flex items-start gap-2.5 font-ui text-sm font-semibold text-primary-foreground sm:text-base"
                >
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-zap" />
                  <span>{texto}</span>
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={200} className="mt-6">
            <ProvaSocialInline />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/** Três números que respondem "posso confiar?" antes de a pessoa rolar. */
function ProvaSocialInline() {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3">
      <Numero
        icon={<MapPin className="size-4" />}
        target={20}
        prefix="+"
        suffix=" anos"
        text="na região"
      />
      <Numero
        icon={<Users className="size-4" />}
        target={30}
        prefix="+"
        suffix=" mil"
        text="clientes"
      />
      <Numero
        icon={<Star className="size-4" />}
        target={4.9}
        decimals={1}
        suffix="/5"
        text="no Google"
      />
    </div>
  );
}

function Numero({
  icon,
  target,
  decimals = 0,
  prefix = "",
  suffix = "",
  text,
}: {
  icon: ReactNode;
  target: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  text: string;
}) {
  const { ref, display } = useCountUp(target, decimals);
  return (
    <div className="rounded-2xl border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-3 text-primary-foreground backdrop-blur-sm">
      <div className="flex items-center gap-1.5 text-zap">{icon}</div>
      <p className="mt-1 whitespace-nowrap font-display text-base font-extrabold leading-tight sm:text-xl">
        <span ref={ref}>
          {prefix}
          {display}
        </span>
        {suffix}
      </p>
      <p className="font-body text-[11px] text-primary-foreground/80 sm:text-xs">{text}</p>
    </div>
  );
}

/* ---------------- Diferenciais ---------------- */

const diferenciais = [
  { Icon: Zap, title: "Até 1 GIGA", text: "Streaming, jogo e home office ao mesmo tempo." },
  { Icon: Wifi, title: "Wi-Fi 7 Mesh", text: "Sinal forte em cada cômodo da casa." },
  { Icon: Wrench, title: "Suporte que resolve", text: "Time técnico próprio, da sua cidade." },
  { Icon: Router, title: "Roteador incluso", text: "Instalado e configurado pela equipe." },
];

export function DiferenciaisLeads() {
  return (
    <section className="bg-background py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4">
        <Reveal className="text-center">
          <SectionTitle className="text-brand-deep">
            Por que a galera daqui escolhe a SCNET
          </SectionTitle>
        </Reveal>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {diferenciais.map((d, i) => (
            <Reveal key={d.title} delay={i * 80}>
              <div className="h-full rounded-2xl border border-border bg-card p-4 transition-all duration-300 hover:-translate-y-1 hover:border-brand sm:p-6">
                <div className="grid size-10 place-items-center rounded-xl bg-brand/10 text-brand sm:size-12">
                  <d.Icon className="size-5 sm:size-6" />
                </div>
                <h3 className="mt-3 font-ui text-base font-bold text-brand-deep sm:text-lg">
                  {d.title}
                </h3>
                <p className="mt-1 font-body text-xs text-muted-foreground sm:text-sm">{d.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- Planos ---------------- */

/**
 * A grade da home, com o mesmo card. O botão do card aponta para o
 * formulário, que aqui fica ACIMA — a página rola de volta com o plano já
 * pinado no cartão ("Plano desejado: Infinity").
 */
export function PlanosLeads({
  plans,
  onSelectPlan,
}: {
  plans: Plan[];
  onSelectPlan: (plan: SelectedPlan) => void;
}) {
  return (
    <section id="planos" className="bg-muted py-12 sm:py-16">
      <div className="mx-auto max-w-7xl px-4">
        <Reveal className="text-center">
          <SectionTitle className="text-brand-deep">
            Escolha o plano e garanta a instalação
          </SectionTitle>
          <p className="mx-auto mt-3 max-w-2xl font-body text-base text-muted-foreground sm:text-lg">
            Fibra própria, roteador incluso e app Skeelo de bônus. Escolheu, a gente cuida do resto.
          </p>
        </Reveal>

        <Reveal className="mt-6">
          {plans.length ? (
            <Carrossel
              label="Planos de internet"
              fundo="from-muted"
              slideClassName="basis-full sm:basis-1/2 lg:basis-1/3"
              slides={plans.map((p) => (
                <PlanoCard key={p.id_plano} plan={p} onSelect={onSelectPlan} />
              ))}
            />
          ) : (
            <PlanosIndisponiveis className="mx-auto max-w-2xl" />
          )}
        </Reveal>

        {plans.length > 0 && (
          <p className="mx-auto mt-6 max-w-3xl text-center font-body text-xs text-muted-foreground">
            *Instalação gratuita para os planos 450, 710 e Infinity. Plano Infinity Duo: instalação
            R$ 100,00 (taxa única). Fidelidade de 12 meses (CPF) e 24 meses (PJ). Condições sujeitas
            a análise de crédito e viabilidade técnica.
          </p>
        )}

        <Reveal className="mt-8 flex flex-col items-center gap-3 rounded-3xl bg-card p-6 text-center shadow-sm sm:p-8">
          <p className="font-ui text-base font-semibold text-brand-deep sm:text-lg">
            Não sabe qual plano é o seu? Deixe seu contato que um consultor indica o ideal pra sua
            rotina.
          </p>
          <CtaFormulario botao="ajuda_plano" local="leads_planos">
            Quero ajuda para escolher
            <ArrowRight className="size-5" />
          </CtaFormulario>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- Como funciona ---------------- */

const passos = [
  {
    Icon: ClipboardList,
    title: "Deixe nome e WhatsApp",
    text: "Leva menos de 1 minuto. Sem cadastro, sem senha.",
  },
  {
    Icon: MessageCircle,
    title: "Consultor confirma a cobertura",
    text: "Resposta no WhatsApp em poucos minutos, em horário comercial.",
  },
  {
    Icon: CalendarCheck,
    title: "Instalação agendada",
    text: "Escolha o dia. A equipe instala e deixa o Wi-Fi configurado.",
  },
];

export function ComoFuncionaLeads() {
  return (
    <section className="gradient-brand relative overflow-hidden py-12 sm:py-16">
      <Blobs />
      <div className="relative mx-auto max-w-7xl px-4">
        <Reveal className="text-center">
          <SectionTitle className="text-primary-foreground">
            Contratar é rápido e simples. Sério.
          </SectionTitle>
        </Reveal>
        <ol className="mt-8 grid gap-3 sm:gap-5 lg:grid-cols-3">
          {passos.map((p, i) => (
            <Reveal key={p.title} as="li" delay={i * 100}>
              <div className="flex h-full items-start gap-4 rounded-2xl border border-primary-foreground/20 bg-primary-foreground/10 p-4 backdrop-blur-md sm:p-6">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-zap font-display text-lg font-extrabold text-zap-ink">
                  {i + 1}
                </span>
                <div>
                  <h3 className="flex items-center gap-2 font-ui text-base font-bold text-primary-foreground sm:text-lg">
                    <p.Icon className="size-5 text-zap" /> {p.title}
                  </h3>
                  <p className="mt-1 font-body text-sm text-primary-foreground/85">{p.text}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </ol>
        <Reveal className="mt-8 text-center">
          <CtaFormulario botao="contratar_como_funciona" local="leads_como_funciona" size="hero">
            Quero contratar agora
            <ArrowRight className="size-5" />
          </CtaFormulario>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- Dúvidas ---------------- */

/** As objeções que mais seguram um lead de anúncio, uma resposta curta cada. */
const duvidas: Array<[string, string]> = [
  [
    "Como sei se vocês atendem no meu endereço?",
    "Deixe seu nome e WhatsApp no formulário. O consultor confirma a cobertura do seu endereço na hora e já passa as condições.",
  ],
  [
    "Tem custo de instalação?",
    "Na maioria dos planos a instalação é grátis, sujeita a análise de crédito. Só o Infinity Duo tem uma taxa única — está descrito no card do plano.",
  ],
  [
    "Tem fidelidade?",
    "Sim: 12 meses para CPF e 24 meses para empresa (PJ). É o que garante a instalação gratuita e o roteador incluso.",
  ],
  [
    "Em quanto tempo instala?",
    "Depende da cidade e da agenda da equipe. No WhatsApp o consultor mostra as datas disponíveis e você escolhe a melhor.",
  ],
  [
    "Se der problema, quem resolve?",
    "Time técnico próprio, da sua cidade. Nada de fila de call center genérico.",
  ],
];

export function DuvidasLeads() {
  return (
    <section id="duvidas" className="bg-background py-12 sm:py-16">
      <div className="mx-auto max-w-3xl px-4">
        <Reveal className="text-center">
          <SectionTitle className="text-brand-deep">
            Perguntas rápidas, respostas diretas
          </SectionTitle>
        </Reveal>
        <Reveal delay={100}>
          <Accordion type="single" collapsible className="mt-6 w-full">
            {duvidas.map(([q, a]) => (
              <AccordionItem key={q} value={q} className="border-b border-border">
                <AccordionTrigger className="text-left font-ui text-base font-semibold text-brand-deep hover:text-brand">
                  {q}
                </AccordionTrigger>
                <AccordionContent className="font-body text-muted-foreground">{a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- CTA final ---------------- */

export function CtaFinalLeads({ precoMinimo }: { precoMinimo: string | null }) {
  return (
    <section className="gradient-brand relative overflow-hidden py-14 sm:py-20">
      <Blobs />
      <div className="relative mx-auto max-w-3xl px-4 text-center">
        <Reveal>
          <SectionTitle className="text-primary-foreground">
            Chegou a sua vez de ter Wi-Fi que pega na casa toda
          </SectionTitle>
          <p className="mt-4 font-body text-base text-primary-foreground/90 sm:text-lg">
            {precoMinimo ? `Planos a partir de R$ ${precoMinimo}/mês. ` : ""}
            Deixe seu contato e um consultor te chama no WhatsApp.
          </p>
        </Reveal>
        <Reveal delay={120} className="mt-7">
          <CtaFormulario
            botao="contratar_final"
            local="leads_cta_final"
            size="hero"
            className="w-full sm:w-auto"
          >
            Quero contratar agora
            <ArrowRight className="size-5" />
          </CtaFormulario>
        </Reveal>
        <Reveal delay={200} className="mt-6 flex flex-wrap justify-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary-foreground/15 px-4 py-2 font-ui text-xs font-semibold text-primary-foreground sm:text-sm">
            <Headset className="size-4 text-zap" /> Resposta no WhatsApp em 5 minutos
          </span>
          <span className="inline-flex items-center gap-2 rounded-full bg-primary-foreground/15 px-4 py-2 font-ui text-xs font-semibold text-primary-foreground sm:text-sm">
            <Star className="size-4 fill-zap text-zap" /> Nota 4.9/5 no Google
          </span>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- Rodapé ---------------- */

/** Rodapé enxuto: identidade e contato, sem menu que tire a pessoa da página. */
export function FooterLeads() {
  return (
    <footer className="bg-brand-deep py-10 text-primary-foreground">
      <div className="mx-auto flex max-w-7xl flex-col items-start gap-6 px-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <img src={logoBranca} alt="SCNET" className="h-8 w-auto object-contain" />
          <p className="mt-2 max-w-xs font-body text-sm text-primary-foreground/75">
            Fibra óptica no Oeste e Litoral de Santa Catarina há mais de 20 anos.
          </p>
        </div>
        <div className="font-body text-sm text-primary-foreground/80">
          <p>Atendimento: (49) 3664-5600</p>
          <p className="mt-1">comercial@scnet.com.br</p>
        </div>
      </div>
      <p className="mt-8 text-center font-body text-xs text-primary-foreground/60">
        © {new Date().getFullYear()} SCNET. Todos os direitos reservados.
      </p>
    </footer>
  );
}

/* ---------------- Barra fixa (celular) ---------------- */

/**
 * O botão que fica sempre à mão no celular.
 *
 * Some enquanto o formulário está na tela — ali ele só cobriria o próprio
 * botão de enviar — e volta assim que a pessoa rola para as outras seções.
 * Em telas largas não existe: o formulário fica visível ao lado do conteúdo.
 */
export function BarraFixaLeads({ precoMinimo }: { precoMinimo: string | null }) {
  const [formularioVisivel, setFormularioVisivel] = useState(true);

  useEffect(() => {
    const alvo = document.getElementById(ANCORA_FORMULARIO);
    if (!alvo) return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => setFormularioVisivel(e.isIntersecting)),
      { threshold: 0.15 },
    );
    io.observe(alvo);
    return () => io.disconnect();
  }, []);

  return (
    <div
      aria-hidden={formularioVisivel}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.35)] backdrop-blur transition-transform duration-300 lg:hidden",
        formularioVisivel ? "translate-y-full" : "translate-y-0",
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-ui text-xs font-semibold text-muted-foreground">
            Fibra + Wi-Fi incluso
          </p>
          {precoMinimo && (
            <p className="font-display text-base font-extrabold leading-tight text-brand-deep">
              a partir de R$ {precoMinimo}/mês
            </p>
          )}
        </div>
        <CtaFormulario
          botao="contratar_barra_fixa"
          local="leads_barra_fixa"
          size="lg"
          className="shrink-0"
        >
          Quero contratar
          <ArrowRight className="size-4" />
        </CtaFormulario>
      </div>
    </div>
  );
}
