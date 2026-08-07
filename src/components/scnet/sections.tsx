import {
  Wifi,
  Router,
  Gauge,
  ShieldCheck,
  Zap,
  Signal,
  Wrench,
  Trophy,
  Star,
  Users,
  MapPin,
  Headset,
  Check,
  MessageCircle,
  Building2,
  ArrowRight,
} from "lucide-react";
import heroImg from "@/assets/casa-wifi-hero.png";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useCountUp } from "@/hooks/use-reveal";
import { LeadForm } from "./lead-form";
import { Blobs, Reveal, SectionTitle, waLink } from "./shared";

/* ---------------- Hero ---------------- */
export function Hero() {
  return (
    <section id="top" className="gradient-brand relative overflow-hidden pb-20 pt-28 lg:pb-28 lg:pt-36">
      <Blobs />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 lg:grid-cols-2">
        <div>
          <Reveal>
            <span className="font-ui inline-flex items-center gap-2 rounded-full bg-zap px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-zap-ink">
              <Zap className="size-4" /> Fibra óptica no Oeste e Litoral de SC
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-5 font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-primary-foreground sm:text-5xl lg:text-6xl">
              Wi-Fi rápido e estável que <span className="text-zap">pega na casa toda!</span>
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mt-5 max-w-xl font-body text-lg text-primary-foreground/90">
              Internet estável e atendimento humano com gente da sua cidade.
            </p>
          </Reveal>
          <Reveal delay={240} className="mt-8 max-w-md">
            <LeadForm />
          </Reveal>
        </div>

        <Reveal delay={200} className="relative">
          <div className="absolute left-1/2 top-1/2 -z-0 h-[70%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-zap/30 blur-3xl" />
          <img
            src={heroImg}
            alt="Casa conectada com Wi-Fi de fibra óptica da SCNET"
            width={1024}
            height={1024}
            className="animate-float-slow relative mx-auto w-full max-w-lg drop-shadow-2xl"
          />
          {[
            { Icon: Wifi, cls: "left-2 top-6", delay: "0s" },
            { Icon: Router, cls: "right-4 top-24", delay: "-2s" },
            { Icon: Gauge, cls: "left-6 bottom-16", delay: "-4s" },
            { Icon: ShieldCheck, cls: "right-10 bottom-6", delay: "-3s" },
          ].map(({ Icon, cls, delay }, i) => (
            <div
              key={i}
              style={{ animationDelay: delay }}
              className={`animate-float absolute ${cls} grid size-14 place-items-center rounded-2xl border border-primary-foreground/25 bg-primary-foreground/15 text-zap backdrop-blur-md`}
            >
              <Icon className="size-7" />
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- Prova social ---------------- */
function Stat({
  icon,
  target,
  decimals = 0,
  prefix = "",
  suffix = "",
  text,
}: {
  icon: React.ReactNode;
  target: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  text: string;
}) {
  const { ref, display } = useCountUp(target, decimals);
  return (
    <div className="flex items-start gap-3">
      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">{icon}</div>
      <div className="min-w-0">
        <p className="font-display text-2xl font-extrabold text-brand-deep">
          <span ref={ref}>
            {prefix}
            {display}
          </span>
          {suffix}
        </p>
        <p className="font-body text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}

export function SocialBar() {
  return (
    <section className="bg-background py-12">
      <Reveal className="mx-auto grid max-w-7xl gap-8 px-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat icon={<MapPin className="size-5" />} target={20} prefix="+" suffix=" anos" text="Conectando o Oeste e Litoral catarinense" />
        <Stat icon={<Users className="size-5" />} target={30} prefix="+" suffix=" mil" text="Clientes online todos os dias" />
        <Stat icon={<Star className="size-5" />} target={4.9} decimals={1} suffix="/5 ⭐" text="Nas avaliações do Google" />
        <Stat icon={<Headset className="size-5" />} target={100} suffix="% local" text="Suporte e equipe técnica com gente da sua cidade" />
      </Reveal>
    </section>
  );
}

/* ---------------- Promessa ---------------- */
export function Promise_() {
  return (
    <section className="relative overflow-hidden bg-muted py-20">
      <div className="relative mx-auto max-w-4xl px-4 text-center">
        <Reveal>
          <SectionTitle className="text-brand-deep">Chega de esperar a página carregar...</SectionTitle>
        </Reveal>
        <Reveal delay={100}>
          <p className="mx-auto mt-5 max-w-2xl font-body text-lg text-muted-foreground">
            Streaming travando, reunião caindo, jogo com lag — a SCNET existe pra resolver isso.
            Infraestrutura própria, tecnologia fibra óptica de ponta e uma equipe que te atende na hora!
          </p>
        </Reveal>
        <Reveal delay={180}>
          <Button variant="zap" size="hero" className="mt-8" asChild>
            <a href="#planos">Quero dar um up na minha conexão</a>
          </Button>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- Diferenciais ---------------- */
const diffs = [
  { Icon: Zap, title: "Ultra velocidade", text: "Planos até 1 GIGA pra quem não abre mão de carregar tudo na hora." },
  { Icon: Wifi, title: "Wi-Fi 7 Mesh", text: "Sinal forte e rápido em cada cômodo da casa." },
  { Icon: Wrench, title: "Suporte rápido, sério!", text: "Chamou, a gente escuta e resolve. Sem enrolação, sem robô travado." },
  { Icon: Trophy, title: "+ 20 anos", text: "A internet mais bem avaliada do Oeste e Litoral catarinense." },
];

export function Diferenciais() {
  return (
    <section className="gradient-brand relative overflow-hidden py-20">
      <Blobs />
      <div className="relative mx-auto max-w-7xl px-4">
        <Reveal>
          <SectionTitle className="text-center text-primary-foreground">
            Por que a galera daqui escolhe a <span className="text-zap">SCNET</span>
          </SectionTitle>
        </Reveal>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {diffs.map((d, i) => (
            <Reveal key={d.title} delay={i * 90}>
              <div className="group h-full rounded-2xl border border-primary-foreground/20 bg-primary-foreground/10 p-6 backdrop-blur-md transition-all duration-300 hover:-translate-y-2 hover:rotate-1 hover:scale-[1.03] hover:bg-primary-foreground/20">
                <div className="grid size-12 place-items-center rounded-xl bg-zap text-zap-ink transition-transform group-hover:scale-110">
                  <d.Icon className="size-6" />
                </div>
                <h3 className="mt-4 font-ui text-lg font-bold text-primary-foreground">{d.title}</h3>
                <p className="mt-2 font-body text-sm text-primary-foreground/85">{d.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- Planos ---------------- */
const plans = [
  {
    name: "Plano 450",
    price: "109,90",
    desc: "Pra quem quer resolver o dia a dia sem drama: redes sociais, séries e trabalho leve, tudo rodando liso.",
    cta: "Quero este plano",
  },
  {
    name: "Plano 710",
    price: "129,90",
    desc: "Casa com mais gente conectada ao mesmo tempo? Esse aguenta o tranco — aula online, chamada de vídeo e streaming juntos, sem travar.",
    cta: "Quero este plano",
  },
  {
    name: "Plano Infinity",
    price: "139,90",
    desc: "Várias telas, jogo online, home office e streaming em 4K rodando ao mesmo tempo, sem susto.",
    cta: "Quero este plano",
    featured: true,
  },
  {
    name: "Plano Infinity Duo",
    price: "159,90",
    desc: "Ideal para ambientes amplos e vários dispositivos conectados — 2 roteadores garantindo Wi-Fi em todo canto.",
    cta: "Quero este plano",
  },
];

const included = ["Fibra própria", "Roteador incluso", "App Skeelo", "Instalação grátis*"];

export function Planos() {
  return (
    <section id="planos" className="bg-background py-20">
      <div className="mx-auto max-w-7xl px-4">
        <Reveal className="text-center">
          <SectionTitle className="text-brand-deep">Escolhe teu plano e já garante o teu Wi-Fi</SectionTitle>
          <p className="mx-auto mt-4 max-w-2xl font-body text-lg text-muted-foreground">
            Fibra própria, roteador incluso e app Skeelo de bônus. Rápido de assinar, mais rápido ainda de usar.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((p, i) => (
            <Reveal key={p.name} delay={i * 90}>
              <div
                className={[
                  "relative flex h-full flex-col rounded-3xl p-6 transition-all duration-300 hover:-translate-y-3",
                  p.featured
                    ? "gradient-brand border-2 border-zap text-primary-foreground shadow-[0_20px_60px_-15px_color-mix(in_oklab,var(--color-zap)_55%,transparent)] lg:scale-[1.04]"
                    : "border border-border bg-card text-card-foreground hover:shadow-[0_24px_60px_-20px_color-mix(in_oklab,var(--color-brand)_60%,transparent)]",
                ].join(" ")}
              >
                {p.featured && (
                  <span className="animate-pulse-glow absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-zap px-4 py-1 font-ui text-xs font-extrabold tracking-wide text-zap-ink">
                    MAIS ESCOLHIDO
                  </span>
                )}
                <h3 className={`font-ui text-2xl font-bold ${p.featured ? "text-zap" : "text-brand"}`}>{p.name}</h3>
                <p className="mt-3 font-display text-3xl font-extrabold tracking-tight">
                  <span className="align-super text-lg">R$</span> {p.price}
                  <span className={`font-body text-sm font-medium ${p.featured ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    /mês
                  </span>
                </p>
                <p className={`mt-4 font-body text-sm ${p.featured ? "text-primary-foreground/90" : "text-muted-foreground"}`}>
                  {p.desc}
                </p>
                <ul className="mt-5 space-y-2">
                  {included.map((f) => (
                    <li key={f} className="flex items-center gap-2 font-body text-sm">
                      <Check className={`size-4 shrink-0 ${p.featured ? "text-zap" : "text-brand"}`} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  variant={p.featured ? "zap" : "brand"}
                  size={p.featured ? "xl" : "lg"}
                  className="mt-6 w-full"
                  asChild
                >
                  <a target="_blank" rel="noopener" href={waLink(`Oi! Quero saber mais sobre o ${p.name} da SCNET.`)}>
                    {p.cta}
                  </a>
                </Button>
              </div>
            </Reveal>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-3xl text-center font-body text-xs text-muted-foreground">
          *Instalação gratuita mediante análise de crédito. Fidelidade de 12 meses (CPF) e 24 meses (PJ).
          Condições podem variar — confirme com um consultor.
        </p>

        <Reveal className="mt-10 rounded-3xl bg-muted p-8 text-center">
          <p className="font-ui text-lg font-semibold text-brand-deep">
            Não sabe qual plano é o seu? Manda um oi no WhatsApp que a gente resolve rapidinho.
          </p>
          <Button variant="whats" size="xl" className="mt-5" asChild>
            <a target="_blank" rel="noopener" href={waLink("Oi! Me ajuda a escolher o melhor plano da SCNET?")}>
              <MessageCircle /> Chamar no WhatsApp
            </a>
          </Button>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- Benefícios ---------------- */
const perks = [
  { name: "Sky+", desc: "Streaming com canais ao vivo e sob demanda." },
  { name: "Paramount+", desc: "Séries, filmes e originais pra maratonar." },
  { name: "Telecine", desc: "Cinema em casa, lançamento atrás de lançamento." },
  { name: "Disney+", desc: "Do infantil ao blockbuster, tudo num lugar só." },
  { name: "Premiere", desc: "Seu time ao vivo, rodada após rodada." },
  { name: "Nosso Futebol", desc: "Mais jogos do Brasileirão pra não perder nada." },
  { name: "App Skeelo", desc: "Livros e audiolivros liberados na assinatura." },
  { name: "Wi-Fi 7", desc: "Mais dispositivos conectados, mais alcance, mais velocidade." },
  { name: "Rede Mesh", desc: "Sinal forte e rápido em qualquer cômodo da casa!" },
  { name: "SC Móvel", desc: "Internet móvel com 5G nacional." },
];

export function Beneficios() {
  return (
    <section className="relative overflow-hidden bg-muted py-20">
      <div className="relative mx-auto max-w-7xl px-4">
        <Reveal className="text-center">
          <SectionTitle className="text-brand-deep">Sua assinatura pode ter mais do que só internet</SectionTitle>
        </Reveal>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          {perks.map((p, i) => (
            <Reveal key={p.name} delay={(i % 5) * 70}>
              <div className="group h-full rounded-2xl border border-border bg-card p-5 transition-all duration-300 hover:-translate-y-2 hover:border-brand hover:shadow-[0_18px_40px_-18px_color-mix(in_oklab,var(--color-brand)_70%,transparent)]">
                <div className="grid h-14 place-items-center rounded-xl bg-brand/8 font-display text-lg font-extrabold text-brand transition-colors group-hover:bg-brand group-hover:text-primary-foreground">
                  {p.name}
                </div>
                <p className="mt-3 font-body text-sm text-muted-foreground">{p.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-8 flex justify-center">
          <span className="font-ui inline-flex items-center gap-2 rounded-full bg-zap px-5 py-2 text-sm font-bold text-zap-ink">
            <Wifi className="size-4" /> Quer mais um ponto de Wi-Fi? Só +R$ 29,90/mês
          </span>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- Como contratar ---------------- */
const steps = [
  "Escolha seu plano no site (ou peça ajuda no WhatsApp)",
  "Informe seus dados e assine o contrato digitalmente",
  "Escolha o dia de instalação da sua nova internet — a gente vai até você",
  "Pronto. Sua casa agora está conectada com a melhor internet da região!",
];

export function ComoContratar() {
  return (
    <section className="bg-background py-20">
      <div className="mx-auto max-w-7xl px-4">
        <Reveal className="text-center">
          <SectionTitle className="text-brand-deep">Contratar é rápido e simples. Sério.</SectionTitle>
        </Reveal>
        <div className="relative mt-14 grid gap-8 lg:grid-cols-4">
          <div className="absolute left-0 right-0 top-7 hidden h-1 rounded-full bg-linear-to-r from-brand-deep to-zap lg:block" />
          {steps.map((s, i) => (
            <Reveal key={s} delay={i * 120} className="relative">
              <div className="group flex flex-col items-center text-center">
                <div className="grid size-14 place-items-center rounded-full gradient-brand font-display text-xl font-extrabold text-primary-foreground ring-4 ring-background transition-transform duration-300 group-hover:scale-110">
                  {i + 1}
                </div>
                <p className="mt-4 max-w-xs font-body text-sm text-muted-foreground">{s}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <div className="mt-12 text-center">
          <Button variant="zap" size="hero" asChild>
            <a target="_blank" rel="noopener" href={waLink("Oi! Quero contratar a SCNET agora.")}>
              Quero contratar agora <ArrowRight />
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Empresas ---------------- */
export function Empresas() {
  return (
    <section id="empresas" className="gradient-brand relative overflow-hidden py-20">
      <Blobs />
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <Reveal>
          <SectionTitle className="text-primary-foreground">Seu negócio não pode ficar fora do ar</SectionTitle>
          <p className="mt-5 max-w-2xl font-body text-lg text-primary-foreground/90">
            Comércio, escritório, indústria ou condomínio — conexão estável pra vender, atender e manter
            tudo operando, com suporte prioritário quando precisar.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <Button variant="zap" size="hero" asChild>
            <a target="_blank" rel="noopener" href={waLink("Oi! Quero um plano SCNET para minha empresa/condomínio.")}>
              <Building2 /> Quero um plano pra empresa
            </a>
          </Button>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- Depoimentos ---------------- */
const testimonials = [
  { name: "Juliana M.", city: "Chapecó", text: "Trocamos faz seis meses e não trava mais nada. Home office e Netflix ao mesmo tempo, tranquilo." },
  { name: "Rafael S.", city: "Itapema", text: "Chamei o suporte num sábado e resolveram no mesmo dia. Atendimento de gente que fala como a gente." },
  { name: "Camila P.", city: "São Miguel do Oeste", text: "Instalação rápida e o Wi-Fi finalmente pega no quarto dos fundos. Valeu cada real." },
  { name: "Diego A.", city: "Balneário Piçarras", text: "Jogo online sem lag e as aulas da minha filha sem cair. É isso que eu queria." },
];

export function Depoimentos() {
  return (
    <section id="depoimentos" className="bg-muted py-20">
      <div className="mx-auto max-w-7xl px-4">
        <Reveal className="text-center">
          <SectionTitle className="text-brand-deep">Quem testou, não troca</SectionTitle>
        </Reveal>
        <div className="mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4 lg:grid lg:grid-cols-4 lg:overflow-visible">
          {testimonials.map((t, i) => (
            <Reveal key={t.name} delay={i * 90} className="min-w-[85%] snap-center sm:min-w-[45%] lg:min-w-0">
              <div className="h-full rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_20px_50px_-20px_color-mix(in_oklab,var(--color-brand)_70%,transparent)]">
                <div className="flex items-center gap-3">
                  <div className="grid size-11 shrink-0 place-items-center rounded-full gradient-brand font-display font-extrabold text-primary-foreground">
                    {t.name[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-ui font-semibold text-card-foreground">{t.name}</p>
                    <p className="truncate font-body text-xs text-muted-foreground">{t.city} · Avaliação Google</p>
                  </div>
                </div>
                <div className="mt-4 flex gap-1">
                  {[0, 1, 2, 3, 4].map((s) => (
                    <Star
                      key={s}
                      style={{ animationDelay: `${s * 120}ms` }}
                      className="animate-float size-4 fill-zap text-zap"
                    />
                  ))}
                </div>
                <p className="mt-3 font-body text-sm text-muted-foreground">“{t.text}”</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- FAQ ---------------- */
const faqs: Array<[string, string]> = [
  ["Como verificar se atendem em meu endereço?", "Só digitar seu endereço lá em cima que a gente te fala na hora."],
  ["Tenho contrato com outro provedor, dá pra trocar?", "Dá sim, e a gente ajuda a organizar isso sem dor de cabeça — garantindo seu upgrade de conexão."],
  ["Tem custo de instalação?", "Geralmente é grátis, sujeito a análise de crédito. No Infinity Duo tem uma taxa — um consultor te fala certinho."],
  ["Qual a diferença entre os planos?", "Velocidade e cobertura de Wi-Fi pela casa. Na dúvida, chama no WhatsApp que a gente indica o ideal pra tua rotina."],
  ["Se der problema, quem resolve?", "Time técnico próprio, local. Nada de fila de call center genérico."],
];

export function Faq() {
  return (
    <section id="duvidas" className="bg-background py-20">
      <div className="mx-auto max-w-3xl px-4">
        <Reveal className="text-center">
          <SectionTitle className="text-brand-deep">Perguntas rápidas, respostas diretas</SectionTitle>
        </Reveal>
        <Reveal delay={100}>
          <Accordion type="single" collapsible className="mt-10 w-full">
            {faqs.map(([q, a]) => (
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
export function CtaFinal() {
  return (
    <section className="gradient-brand relative overflow-hidden py-20">
      <Blobs />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 lg:grid-cols-2">
        <Reveal>
          <div className="mb-4 flex gap-1">
            {[0, 1, 2, 3, 4].map((s) => (
              <Star key={s} className="size-6 fill-zap text-zap" />
            ))}
          </div>
          <SectionTitle className="text-primary-foreground">
            Mude agora para a internet mais rápida e mais bem avaliada da região!{" "}
            <span className="text-zap">Nota 4.9/5 no Google</span>
          </SectionTitle>
          <p className="mt-5 max-w-xl font-body text-lg text-primary-foreground/90">
            + 20 anos conectando o Oeste e Litoral Catarinense. Chegou a sua vez!
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button variant="zap" size="xl" asChild>
              <a href="#planos">Contratar online</a>
            </Button>
            <Button variant="whats" size="xl" asChild>
              <a target="_blank" rel="noopener" href={waLink("Oi! Quero contratar a SCNET pelo WhatsApp.")}>
                <MessageCircle /> Contratar no WhatsApp
              </a>
            </Button>
          </div>
        </Reveal>
        <Reveal delay={120} className="max-w-md justify-self-end">
          <LeadForm variant="light" />
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- Footer + WhatsApp flutuante ---------------- */
const footerLinks: Array<[string, string]> = [
  ["Planos", "#planos"],
  ["Empresas", "#empresas"],
  ["Trabalhe conosco", "#top"],
  ["FAQ", "#duvidas"],
  ["Contratos e Regulamentos", "#top"],
  ["Área do cliente", "#top"],
  ["App SCNET", "#top"],
  ["Segunda via fatura", "#top"],
];

export function Footer() {
  return (
    <footer className="bg-brand-deep py-14 text-primary-foreground">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 md:grid-cols-3">
        <div>
          <p className="font-display text-2xl font-extrabold">
            SC<span className="text-zap">NET</span>
          </p>
          <p className="mt-3 max-w-xs font-body text-sm text-primary-foreground/75">
            Fibra óptica no Oeste e Litoral de Santa Catarina há mais de 20 anos.
          </p>
        </div>
        <nav className="grid grid-cols-2 gap-2 font-ui text-sm">
          {footerLinks.map(([l, h]) => (
            <a key={l} href={h} className="text-primary-foreground/80 transition hover:text-zap">
              {l}
            </a>
          ))}
        </nav>
        <div className="font-body text-sm text-primary-foreground/80">
          <p>Atendimento: 0800 000 0000</p>
          <p className="mt-1">contato@scnet.com.br</p>
          <div className="mt-4 flex gap-3">
            {["Instagram", "Facebook", "YouTube"].map((s) => (
              <a
                key={s}
                href="#top"
                aria-label={s}
                className="grid size-10 place-items-center rounded-full bg-primary-foreground/10 transition hover:bg-zap hover:text-zap-ink"
              >
                {s[0]}
              </a>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-10 text-center font-body text-xs text-primary-foreground/60">
        © {new Date().getFullYear()} SCNET. Todos os direitos reservados.
      </p>
    </footer>
  );
}

export function WhatsFloat() {
  return (
    <a
      href={waLink("Oi! Quero falar com a SCNET.")}
      target="_blank"
      rel="noopener"
      aria-label="Falar no WhatsApp"
      className="animate-bounce-soft fixed bottom-5 right-5 z-50 grid size-14 place-items-center rounded-full bg-[#25D366] text-[#0b3d1f] shadow-2xl transition-transform hover:scale-110"
    >
      <MessageCircle className="size-7" />
    </a>
  );
}