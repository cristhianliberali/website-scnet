import {
  Wifi,
  Router,
  Gauge,
  ShieldCheck,
  Zap,
  Wrench,
  Trophy,
  Star,
  Users,
  MapPin,
  Headset,
  MessageCircle,
  Building2,
  ArrowRight,
  Clock,
} from "lucide-react";
import heroImg from "@/assets/planta-baixa-wifi.webp";
import logoBranca from "@/assets/logo-scnet-branca.webp";
import skyLogo from "@/assets/sky.webp";
import paramountLogo from "@/assets/paramount.webp";
import telecineLogo from "@/assets/telecine.webp";
import disneyLogo from "@/assets/disney.webp";
import premiereLogo from "@/assets/premiere.webp";
import nossoFutebolLogo from "@/assets/nosso-futebol.webp";
import skeeloLogo from "@/assets/skeelo.webp";
import scMovelLogo from "@/assets/scmovel.webp";
import { Button } from "@/components/ui/button";
import { planoWebhook, type Plan } from "@/lib/plans";
import { ANCORA_FORMULARIO, HASH_FORMULARIO, MENU_RODAPE, REDES_SOCIAIS } from "@/lib/links";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useCountUp } from "@/hooks/use-reveal";
import { ContractForm, type SelectedPlan } from "./contract-form";
import { eventoDeClique } from "@/lib/datalayer";
import { Blobs, LinkDeMenu, Reveal, SectionTitle } from "./shared";
import { Carrossel } from "./carrossel";
import { ItensPlano, LogosAgregados, PlanosIndisponiveis, PrecoPlano, SeloDestaque } from "./plano";
import { cn } from "@/lib/utils";

/* ---------------- Hero ---------------- */
export function Hero() {
  return (
    // pt-* must clear the fixed header (~60px mobile / ~68px sm / ~104px lg).
    // overflow-x-clip (not overflow-hidden) contains any horizontal bleed
    // without clipping the image's negative bottom margin on phones.
    <section
      id="top"
      className="gradient-brand relative overflow-x-clip pb-14 pt-24 sm:pt-28 lg:pb-28 lg:pt-40"
    >
      <Blobs />
      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 sm:gap-12 lg:grid-cols-2 lg:gap-12">
        {/* Stacked below lg: centre the copy and cap the measure so it doesn't
            stretch edge-to-edge on tablets. Left-aligned once side by side. */}
        <div className="w-[70%] text-left sm:mx-auto sm:w-auto sm:max-w-xl sm:text-center lg:mx-0 lg:max-w-none lg:text-left">
          <Reveal>
            <span className="font-ui inline-flex items-center gap-2 rounded-full bg-zap px-3 py-1 text-[10px] font-bold uppercase leading-tight tracking-wide text-zap-ink sm:px-4 sm:py-1.5 sm:text-xs">
              <ShieldCheck className="size-3 shrink-0 sm:size-4" />
              {/* balance keeps the two wrapped lines even instead of stranding a word */}
              <span className="text-balance">Internet nota 4.9/5 no Google!</span>
            </span>
          </Reveal>
          <Reveal delay={80}>
            <h1 className="mt-4 font-display text-[2rem] font-extrabold leading-[1.08] tracking-tight text-primary-foreground sm:mt-5 sm:text-5xl lg:text-6xl">
              Wi-Fi rápido e estável&nbsp;na casa toda!
            </h1>
          </Reveal>
          <Reveal delay={160}>
            <p className="mx-auto mt-4 max-w-lg font-body text-base text-primary-foreground/90 sm:text-lg lg:mx-0 lg:max-w-xl">
              Internet estável e atendimento humano com gente da sua cidade.
            </p>
          </Reveal>
          <Reveal delay={240} className="mt-7 sm:mt-8">
            <Button asChild variant="zap" size="hero" className="w-full shadow-lg sm:w-auto">
              <a
                href="#planos"
                onClick={() =>
                  eventoDeClique("ver_planos", {
                    texto: "Quero ver os planos",
                    local: "hero",
                    destino: "#planos",
                  })
                }
              >
                Quero ver os planos
                <ArrowRight className="size-5" />
              </a>
            </Button>
          </Reveal>
        </div>

        {/* sm:w-fit shrinks this wrapper to the image so the floating icons
            anchor to the artwork instead of drifting to the viewport edges. */}
        <Reveal delay={200} className="flex justify-center lg:block">
          {/* lg:w-full — at lg the image fills its grid column, so a fixed
              max-width would overflow the narrower column at 1024px. */}
          <div className="relative z-10 w-full sm:w-fit lg:w-full">
            <div className="absolute left-1/2 top-1/2 -z-0 h-[100%] w-[100%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-zap/30 blur-3xl" />
            {/* Full-bleed on phones: 100% of the padded cell + the 2rem of
                container padding, pulled back out by -mx-4, spans exactly the
                viewport. Using 100vw here instead overflows by the padding and
                scrolls the whole page sideways. */}
            <img
              src={heroImg}
              alt="Planta baixa de uma casa com sinal de Wi-Fi forte em todos os cômodos"
              width={1080}
              height={1080}
              className="animate-float-slow relative z-10 -mx-4 mb-[-96px] w-[calc(100%+2rem)] max-w-none drop-shadow-2xl sm:mx-0 sm:mb-0 sm:w-auto sm:max-w-md lg:w-full lg:max-w-none"
            />
            {[
              { Icon: Wifi, cls: "-left-3 top-6 sm:-left-5 lg:left-2", delay: "0s" },
              {
                Icon: Router,
                cls: "-right-3 top-20 sm:-right-5 lg:right-4 lg:top-24",
                delay: "-2s",
              },
              {
                Icon: Gauge,
                cls: "-left-3 bottom-14 sm:-left-5 lg:left-6 lg:bottom-16",
                delay: "-4s",
              },
              {
                Icon: ShieldCheck,
                cls: "-right-2 bottom-4 sm:-right-4 lg:right-10 lg:bottom-6",
                delay: "-3s",
              },
            ].map(({ Icon, cls, delay }, i) => (
              <div
                key={i}
                style={{ animationDelay: delay }}
                className={`animate-float absolute ${cls} grid size-10 place-items-center rounded-2xl border border-primary-foreground/25 bg-primary-foreground/15 text-zap backdrop-blur-md sm:size-12 lg:size-14`}
              >
                <Icon className="size-5 sm:size-6 lg:size-7" />
              </div>
            ))}
          </div>
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
      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
        {icon}
      </div>
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
    <section className="bg-[#f3f7fc] py-12">
      <Reveal className="mx-auto grid max-w-7xl gap-8 px-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<MapPin className="size-5" />}
          target={20}
          prefix="+"
          suffix=" anos"
          text="Conectando pessoas e histórias"
        />
        <Stat
          icon={<Users className="size-5" />}
          target={30}
          prefix="+"
          suffix=" mil"
          text="Clientes satisfeitos"
        />
        <Stat
          icon={<Star className="size-5" />}
          target={4.9}
          decimals={1}
          suffix="/5 ⭐"
          text="Nas avaliações do Google"
        />
        <Stat
          icon={<Headset className="size-5" />}
          target={100}
          suffix="% local"
          text="Suporte e equipe técnica com gente da sua cidade"
        />
      </Reveal>
    </section>
  );
}

/* ---------------- Diferenciais ---------------- */
const diffs = [
  {
    Icon: Zap,
    title: "Ultra velocidade",
    text: "Planos até 1 GIGA pra quem não abre mão de carregar tudo na hora.",
  },
  { Icon: Wifi, title: "Wi-Fi 7 Mesh", text: "Sinal forte e rápido em cada cômodo da casa." },
  {
    Icon: Wrench,
    title: "Suporte rápido, sério!",
    text: "Chamou, a gente escuta e resolve. Sem enrolação, sem robô travado.",
  },
  {
    Icon: Trophy,
    title: "+ 20 anos",
    text: "A internet mais bem avaliada do Oeste e Litoral catarinense.",
  },
];

export function Diferenciais() {
  return (
    <section className="gradient-brand relative overflow-hidden py-20">
      <Blobs />
      <div className="relative mx-auto max-w-7xl px-4">
        <Reveal>
          <SectionTitle className="text-center text-primary-foreground">
            Porque somos a internet +bem avaliada da região!
          </SectionTitle>
        </Reveal>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {diffs.map((d, i) => (
            <Reveal key={d.title} delay={i * 90}>
              <div className="group h-full rounded-2xl border border-primary-foreground/20 bg-primary-foreground/10 p-6 backdrop-blur-md transition-all duration-300 hover:-translate-y-2 hover:rotate-1 hover:scale-[1.03] hover:bg-primary-foreground/20">
                <div className="grid size-12 place-items-center rounded-xl bg-zap text-zap-ink transition-transform group-hover:scale-110">
                  <d.Icon className="size-6" />
                </div>
                <h3 className="mt-4 font-ui text-lg font-bold text-primary-foreground">
                  {d.title}
                </h3>
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

function PlanoCard({ plan, onSelect }: { plan: Plan; onSelect: (plan: SelectedPlan) => void }) {
  return (
    <div
      className={cn(
        "relative flex h-full flex-col rounded-3xl p-6 transition-all duration-300 hover:-translate-y-3",
        plan.destaque
          ? "gradient-brand border-2 border-zap text-primary-foreground shadow-[0_20px_60px_-15px_color-mix(in_oklab,var(--color-zap)_55%,transparent)]"
          : "border border-border bg-card text-card-foreground hover:shadow-[0_24px_60px_-20px_color-mix(in_oklab,var(--color-brand)_60%,transparent)]",
      )}
    >
      <SeloDestaque plan={plan} className="animate-pulse-glow" />
      <h3 className={cn("font-ui text-2xl font-bold", plan.destaque ? "text-zap" : "text-brand")}>
        {plan.nome}
      </h3>
      <div className="mt-3">
        <PrecoPlano plan={plan} featured={plan.destaque} />
      </div>
      <LogosAgregados logos={plan.logos} featured={plan.destaque} />
      {plan.descricao && (
        <p
          className={cn(
            "mt-4 font-body text-sm",
            plan.destaque ? "text-primary-foreground/90" : "text-muted-foreground",
          )}
        >
          {plan.descricao}
        </p>
      )}
      <ItensPlano itens={plan.itens} featured={plan.destaque} className="mt-5" />
      {/* empurra o botão para a base — os cards do slide ficam alinhados */}
      <div className="grow" />
      <Button
        variant={plan.destaque ? "zap" : "brand"}
        size={plan.destaque ? "xl" : "lg"}
        className="mt-6 w-full"
        asChild
      >
        <a
          href="#contrate"
          onClick={() => {
            onSelect(planoWebhook(plan));
            // O plano escolhido viaja no evento: é o que permite ver no
            // relatório qual grade converte, e não só quantos clicaram.
            eventoDeClique("escolher_plano", {
              texto: "Quero este plano",
              local: "grade_de_planos",
              plano: plan.nome,
              destaque: plan.destaque,
            });
          }}
        >
          Quero este plano
        </a>
      </Button>
    </div>
  );
}

export function Planos({
  plans,
  onSelectPlan,
}: {
  plans: Plan[];
  onSelectPlan: (plan: SelectedPlan) => void;
}) {
  return (
    <section id="planos" className="bg-background py-20">
      <div className="mx-auto max-w-7xl px-4">
        <Reveal className="text-center">
          <SectionTitle className="text-brand-deep">
            Escolha seu novo plano de internet
          </SectionTitle>
          <p className="mx-auto mt-4 max-w-2xl font-body text-lg text-muted-foreground">
            Fibra própria, roteador incluso e app Skeelo de bônus. Rápido de assinar, mais rápido
            ainda de usar.
          </p>
        </Reveal>

        {/* Um Reveal só, envolvendo o carrossel: cards fora da área visível do
            slide ficariam presos no estado invisível se cada um tivesse o seu. */}
        <Reveal className="mt-10">
          {plans.length ? (
            <Carrossel
              label="Planos de internet"
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
          <p className="mx-auto mt-8 max-w-3xl text-center font-body text-xs text-muted-foreground">
            *Instalação gratuita para os planos 450, 710 e Infinity. Plano Infinity Duo: instalação
            R$ 100,00 (taxa única). Fidelidade de 12 meses (CPF) e 24 meses (PJ). Condições podem
            variar — confirme com um consultor.
          </p>
        )}

        <Reveal className="mt-10 rounded-3xl bg-muted p-8 text-center">
          <p className="font-ui text-lg font-semibold text-brand-deep">
            Não sabe qual é o plano ideal? Nossa equipe irá entender sua necessidade e indicar o
            plano perfeito para sua rotina!
          </p>
          <Button variant="zap" size="xl" className="mt-5" asChild>
            <a
              href={HASH_FORMULARIO}
              onClick={() =>
                eventoDeClique("ajuda_plano", {
                  texto: "Quero ajuda para escolher",
                  local: "planos",
                  destino: HASH_FORMULARIO,
                })
              }
            >
              Quero ajuda para escolher
              <ArrowRight className="size-5" />
            </a>
          </Button>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- Benefícios ---------------- */
const perks = [
  { name: "Sky+", desc: "Streaming com canais ao vivo e sob demanda.", logo: skyLogo },
  { name: "Paramount+", desc: "Séries, filmes e originais pra maratonar.", logo: paramountLogo },
  { name: "Telecine", desc: "Cinema em casa, lançamento atrás de lançamento.", logo: telecineLogo },
  { name: "Disney+", desc: "Do infantil ao blockbuster, tudo num lugar só.", logo: disneyLogo },
  { name: "Premiere", desc: "Seu time ao vivo, rodada após rodada.", logo: premiereLogo },
  {
    name: "Nosso Futebol",
    desc: "Mais jogos do Brasileirão pra não perder nada.",
    logo: nossoFutebolLogo,
  },
  { name: "App Skeelo", desc: "Livros e audiolivros liberados na assinatura.", logo: skeeloLogo },
  { name: "SC Móvel", desc: "Internet móvel com 5G nacional.", logo: scMovelLogo },
];

export function Beneficios() {
  return (
    <section className="relative overflow-hidden bg-muted py-20">
      <div className="relative mx-auto max-w-7xl px-4">
        <Reveal className="text-center">
          <SectionTitle className="text-brand-deep">
            Sua assinatura pode ter mais do que só internet
          </SectionTitle>
        </Reveal>
        <div className="mt-12 grid grid-cols-2 gap-5 lg:grid-cols-4">
          {perks.map((p, i) => (
            <Reveal key={p.name} delay={(i % 4) * 70}>
              <div className="group h-full rounded-2xl border border-border bg-card p-5 transition-all duration-300 hover:-translate-y-2 hover:border-brand hover:shadow-[0_18px_40px_-18px_color-mix(in_oklab,var(--color-brand)_70%,transparent)]">
                <div className="flex h-24 items-center justify-center overflow-hidden">
                  {p.logo ? (
                    <img
                      src={p.logo}
                      alt={p.name}
                      className="max-h-20 w-auto max-w-full object-contain"
                    />
                  ) : (
                    <span className="text-center font-display text-base font-extrabold text-brand">
                      {p.name}
                    </span>
                  )}
                </div>
                <p className="mt-3 font-body text-sm text-muted-foreground">{p.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-8 flex justify-center">
          <span className="font-ui inline-flex items-center gap-2 rounded-full bg-zap px-5 py-2 text-sm font-bold text-zap-ink">
            <Wifi className="size-4" /> Quer mais pontos de Wi-Fi? Adquira por apenas R$ 29,90/mês
          </span>
        </Reveal>
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
        <Reveal className="max-w-[522px]">
          <SectionTitle className="text-primary-foreground">
            Seu negócio não pode ficar fora do ar
          </SectionTitle>
          <p className="mt-5 font-body text-lg text-primary-foreground/90">
            Comércio, escritório, indústria ou condomínio — conexão estável pra vender, atender e
            manter tudo operando, com suporte prioritário quando precisar.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <Button variant="zap" size="hero" asChild>
            <a
              href={HASH_FORMULARIO}
              onClick={() =>
                eventoDeClique("empresas", {
                  texto: "Quero um plano pra empresa",
                  local: "empresas",
                  destino: HASH_FORMULARIO,
                })
              }
            >
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
  {
    name: "Juliana M.",
    city: "Chapecó",
    text: "Trocamos faz seis meses e não trava mais nada. Home office e Netflix ao mesmo tempo, tranquilo.",
  },
  {
    name: "Rafael S.",
    city: "Itapema",
    text: "Chamei o suporte num sábado e resolveram no mesmo dia. Atendimento de gente que fala como a gente.",
  },
  {
    name: "Camila P.",
    city: "São Miguel do Oeste",
    text: "Instalação rápida e o Wi-Fi finalmente pega no quarto dos fundos. Valeu cada real.",
  },
  {
    name: "Diego A.",
    city: "Camboriú",
    text: "Jogo online sem lag e as aulas da minha filha sem cair. É isso que eu queria.",
  },
];

export function Depoimentos() {
  return (
    <section id="depoimentos" className="bg-muted py-20">
      <div className="mx-auto max-w-7xl px-4">
        <Reveal className="text-center">
          <SectionTitle className="text-brand-deep">Quem testou, não troca</SectionTitle>
        </Reveal>
        {/* Mesmo carrossel dos planos: no celular vira slide (o scroll manual
            anterior quebrava o card), e a partir de lg os quatro cabem juntos —
            aí ele fica sem pontos, como uma grade. Um Reveal só envolvendo
            tudo, senão os cards fora da área visível ficariam invisíveis. */}
        <Reveal className="mt-8">
          <Carrossel
            label="Depoimentos de clientes"
            fundo="from-muted"
            slideClassName="basis-full sm:basis-1/2 lg:basis-1/4"
            slides={testimonials.map((t) => (
              <div
                key={t.name}
                className="h-full rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_20px_50px_-20px_color-mix(in_oklab,var(--color-brand)_70%,transparent)]"
              >
                <div className="flex items-center gap-3">
                  <div className="grid size-11 shrink-0 place-items-center rounded-full gradient-brand font-display font-extrabold text-primary-foreground">
                    {t.name[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-ui font-semibold text-card-foreground">{t.name}</p>
                    <p className="truncate font-body text-xs text-muted-foreground">
                      {t.city} · Avaliação Google
                    </p>
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
            ))}
          />
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- FAQ ---------------- */
const faqs: Array<[string, string]> = [
  [
    "Como funcionam os planos sem controle de velocidade?",
    "Nos planos Infinity, sem controle de velocidade, você aproveita o máximo que seus aparelhos suportam, chegando a até 1 giga.",
  ],
  [
    "Como sei se vocês atendem no meu endereço?",
    "É rápido: faça a verificação de cobertura aqui mesmo nesta página, na seção de viabilidade.",
  ],
  [
    "Tem custo de instalação?",
    "Depende do plano, alguns têm instalação gratuita — é só conferir na descrição de cada plano. Essa condição está sujeita a análise de crédito.",
  ],
  [
    "Posso adicionar mais pontos de Wi-Fi ao meu plano?",
    "Pode sim! Você pode contratar um plano que já vem com mais de um roteador, ou adicionar roteadores extras a qualquer plano, com um valor a mais na mensalidade.",
  ],
  [
    "Se der problema, quem resolve?",
    "Time técnico próprio, local. Nada de fila de call center genérico.",
  ],
];

export function Faq() {
  return (
    <section id="duvidas" className="bg-background py-20">
      <div className="mx-auto max-w-3xl px-4">
        <Reveal className="text-center">
          <SectionTitle className="text-brand-deep">Dúvidas frequentes</SectionTitle>
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
export function CtaFinal({
  selectedPlan,
  codigoOferta,
  areaClienteAtiva = true,
}: {
  selectedPlan: SelectedPlan | null;
  /** Código de campanha da URL, repassado adiante para /contratacao. */
  codigoOferta?: string | undefined;
  /** Vem do /admin: decide para onde vai quem marca "Já sou cliente". */
  areaClienteAtiva?: boolean;
}) {
  return (
    /* A âncora vive na seção inteira, e não no formulário: quem chega de um CTA
       precisa ver também a chamada ao lado, que é o que explica o formulário.
       `scroll-mt` desconta o cabeçalho fixo, que senão cobriria o topo. */
    <section
      id={ANCORA_FORMULARIO}
      className="gradient-brand relative scroll-mt-16 overflow-hidden py-24 lg:scroll-mt-28"
    >
      <Blobs />
      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 lg:grid-cols-[1fr_580px]">
        <Reveal>
          <SectionTitle className="text-primary-foreground">
            Cuidamos do Wi-Fi, você aproveita o momento!&nbsp;
          </SectionTitle>
          <p className="mt-5 max-w-xl font-body text-lg text-primary-foreground/90">
            + 20 anos conectando o Oeste e Litoral Catarinense. Chegou a sua vez de viver a melhor
            experiência conectado!
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <div className="flex items-center gap-2 rounded-full bg-primary-foreground/15 px-4 py-2 text-primary-foreground backdrop-blur-sm">
              <Star className="size-5 fill-zap text-zap" />
              <span className="font-ui text-sm font-semibold">Nota 4.9/5 no Google!</span>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-primary-foreground/15 px-4 py-2 text-primary-foreground backdrop-blur-sm">
              <Clock className="size-5 text-zap" />
              <span className="font-ui text-sm font-semibold">
                Tempo de espera no telefone: 1 minuto
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-primary-foreground/15 px-4 py-2 text-primary-foreground backdrop-blur-sm">
              <MessageCircle className="size-5 text-zap" />
              <span className="font-ui text-sm font-semibold">
                Tempo de resposta no WhatsApp: 5 minutos
              </span>
            </div>
          </div>
        </Reveal>
        <Reveal delay={120} className="w-full lg:justify-self-end">
          <ContractForm
            selectedPlan={selectedPlan}
            codigoOferta={codigoOferta}
            areaClienteAtiva={areaClienteAtiva}
          />
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- Footer + CTA flutuante ---------------- */

/**
 * O rodapé.
 *
 * Os destinos vêm de `lib/links.ts` — os mesmos do cabeçalho, e pelo mesmo
 * motivo: metade deles apontava para `#top`, que de qualquer página que não
 * fosse a home levava a lugar nenhum. O que não tem endereço configurado
 * (trabalhe conosco, contratos, app, redes) simplesmente não aparece.
 */
export function Footer() {
  return (
    <footer className="bg-brand-deep py-14 text-primary-foreground">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 md:grid-cols-3">
        <div>
          <img src={logoBranca} alt="SCNET" className="h-9 w-auto object-contain" />
          <p className="mt-3 max-w-xs font-body text-sm text-primary-foreground/75">
            Fibra óptica no Oeste e Litoral de Santa Catarina há mais de 20 anos.
          </p>
        </div>
        <nav className="grid grid-cols-2 gap-2 font-ui text-sm">
          {MENU_RODAPE.map((item) => (
            <LinkDeMenu
              key={item.rotulo}
              item={item}
              className="text-primary-foreground/80 transition hover:text-zap"
            />
          ))}
        </nav>
        <div className="font-body text-sm text-primary-foreground/80">
          <p>Atendimento: 0800 000 0000</p>
          <p className="mt-1">contato@scnet.com.br</p>
          {REDES_SOCIAIS.length > 0 && (
            <div className="mt-4 flex gap-3">
              {REDES_SOCIAIS.map((item) => (
                <LinkDeMenu
                  key={item.rotulo}
                  item={item}
                  className="grid size-10 place-items-center rounded-full bg-primary-foreground/10 transition hover:bg-zap hover:text-zap-ink"
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="mt-10 text-center font-body text-xs text-primary-foreground/60">
        © {new Date().getFullYear()} SCNET. Todos os direitos reservados.
      </p>
    </footer>
  );
}

/**
 * O CTA que acompanha a rolagem.
 *
 * Era o balão do WhatsApp; agora leva ao formulário, como todo CTA da página.
 * O lead entra por um caminho só — o formulário —, em vez de metade dele
 * chegar como conversa solta no aparelho de alguém, sem plano escolhido, sem
 * atribuição e sem entrar no CRM.
 */
export function CtaFlutuante() {
  return (
    <a
      href={HASH_FORMULARIO}
      aria-label="Ir para o formulário de contratação"
      onClick={() =>
        eventoDeClique("contratar_flutuante", {
          texto: "Contrate agora",
          local: "botao_flutuante",
          destino: HASH_FORMULARIO,
        })
      }
      className="font-ui fixed bottom-5 right-5 z-50 inline-flex items-center gap-2 rounded-full bg-zap px-5 py-3 text-sm font-bold text-zap-ink shadow-2xl transition-transform hover:scale-105"
    >
      Contrate agora
      <ArrowRight className="size-5" />
    </a>
  );
}
