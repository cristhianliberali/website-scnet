import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Info,
  Loader2,
  MessageCircle,
  Paperclip,
  Sun,
  Sunset,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { planoWebhook, precoVigente, textoPosDesconto, type Plan } from "@/lib/plans";
import { ItensPlano, LogosAgregados, PlanosIndisponiveis, PrecoPlano, SeloDestaque } from "./plano";
import {
  ACCEPTED_TYPES,
  ACCEPT_ATTRIBUTE,
  MAX_FILE_MB,
  MAX_FILE_BYTES,
} from "@/lib/attachment-validation";
import { isPayloadTooLarge, isRateLimited } from "@/lib/http-errors";
import {
  capitalizeName,
  isValidCpf,
  isValidPhone,
  maskCpf,
  maskPhone,
  nationalPhoneDigits,
} from "@/lib/form-utils";
import { LIMITES, limitar } from "@/lib/form-limits";
import {
  agendaDeReserva,
  periodoDoDia,
  type AgendaInstalacao,
  type DiaDisponivel,
  type PeriodoInstalacao,
} from "@/lib/agenda-calculo";
import { consultarAgendaInstalacao } from "@/lib/agenda";
import {
  BANCOS_DEBITO,
  METODOS_PAGAMENTO,
  PAGAMENTO_VAZIO,
  errosPagamento,
  exigeConta,
  maskAgencia,
  maskConta,
  pagamentoWebhook,
  rotuloBanco,
  rotuloMetodo,
  type BancoDebito,
  type DadosPagamento,
} from "@/lib/pagamento";
import { LINK_FORMULARIO } from "@/lib/links";
import { getAttribution } from "@/lib/utm";
import { getRecaptchaToken } from "@/lib/recaptcha";
import { submitContractStep } from "@/lib/submit-contract-step";
import { redirectToWhatsAppSupport, waLink, whatsappSupportLink } from "@/lib/whatsapp";
import { mensagemContratacao, type ResumoContratacao } from "@/lib/mensagem-contratacao";
import {
  dispararEvento,
  eventoDaEtapa,
  eventoDeClique,
  eventoWhatsapp,
  EVENTO,
} from "@/lib/datalayer";
import { AreaClienteDesligada } from "./area-cliente-desligada";
import { cn } from "@/lib/utils";
import type { ContractHandoff } from "@/lib/contract-handoff";

/* ---------------- helpers ---------------- */

// As mesmas regras que o servidor aplica (src/lib/attachment-validation.ts) —
// aqui só para o cliente ver o erro na hora; a validação que vale é a de lá.
const ACCEPT = ACCEPT_ATTRIBUTE;

const onlyDigits = (v: string) => v.replace(/\D/g, "");

function maskCep(v: string) {
  const d = onlyDigits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

const FULL_NAME_RE = /^\p{L}{2,}(?:['’\-\p{L}]*)(?:\s+\p{L}{2,}[\p{L}'’\-]*)+$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function isAdultBirthDate(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(v + "T00:00:00");
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  const age = (now.getTime() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  return age >= 18 && age <= 110;
}

function fileError(file: File | null) {
  if (!file) return "Anexo obrigatório";
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) return "Use PDF, PNG ou JPEG";
  if (file.size > MAX_FILE_BYTES) return `Máximo ${MAX_FILE_MB}MB`;
  return null;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler o arquivo"));
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

function newSessionId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * Quanto tempo o "Buscando horários disponíveis..." fica na tela, no mínimo.
 *
 * A consulta é de verdade, mas volta em milissegundos — sem esta espera o aviso
 * pisca e o cliente não vê que a data foi apurada para a cidade dele.
 */
const ESPERA_AGENDA_MS = 1000;

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/* ---------------- UI atoms ---------------- */

const inputCls = (error?: boolean) =>
  cn(
    "placeholder-fraco w-full rounded-lg border bg-muted/40 px-4 py-3 font-body text-foreground placeholder:text-muted-foreground outline-none transition focus:ring-2",
    error
      ? "border-red-400 focus:border-red-500 focus:ring-red-300/40"
      : "border-border focus:border-brand focus:ring-brand/30",
  );

function Field({
  label,
  error,
  hint,
  className,
  children,
}: {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <span
        className={cn(
          "block font-ui text-sm font-semibold transition",
          error ? "text-red-500" : "text-brand-deep",
        )}
      >
        {label}
      </span>
      {children}
      {hint && !error && <p className="font-body text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="font-body text-xs text-red-500">{error}</p>}
    </div>
  );
}

function Stepper({
  steps,
  current,
  onGo,
}: {
  steps: string[];
  current: number;
  onGo: (i: number) => void;
}) {
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => done && onGo(i)}
              disabled={!done}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition sm:px-3",
                active && "border-brand bg-brand/10",
                done && "border-zap/50 bg-zap/10 hover:border-zap",
                !active && !done && "border-border bg-muted/40 opacity-50",
              )}
            >
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full font-ui text-xs font-extrabold",
                  active && "bg-brand text-primary-foreground",
                  done && "bg-zap text-zap-ink",
                  !active && !done && "bg-border text-muted-foreground",
                )}
              >
                {done ? <Check className="size-4" strokeWidth={3} /> : i + 1}
              </span>
              <span
                className={cn(
                  "truncate font-ui text-xs font-semibold sm:text-sm",
                  active ? "text-brand-deep" : "text-muted-foreground",
                )}
              >
                {label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------- types ---------------- */

type Address = {
  tipo: "casa" | "apartamento" | "";
  cep: string;
  cidade: string;
  bairro: string;
  logradouro: string;
  numero: string;
  complemento: string;
  condominio: string;
};

/** O telefone principal vem da etapa 1 (lead) — aqui só o segundo contato. */
type Person = {
  nome: string;
  cpf: string;
  nascimento: string;
  email: string;
  telefone2: string;
};

type Errors = Record<string, string | undefined>;

type Intent = "quero_contratar" | "ja_sou_cliente";

type Lead = {
  nome: string;
  telefone: string;
  intencao: Intent | "";
};

const INTENTS = [
  ["quero_contratar", "Quero contratar"],
  ["ja_sou_cliente", "Já sou cliente"],
] as const;

const intentLabel = (value: Intent | "") => INTENTS.find(([id]) => id === value)?.[1] ?? "";

const isIntent = (value: string | undefined): value is Intent =>
  value === "quero_contratar" || value === "ja_sou_cliente";

/* ---------------- steps ---------------- */

const STEPS = [
  { id: "planos", label: "Planos" },
  { id: "endereco", label: "Endereço" },
  { id: "cadastro", label: "Cadastro" },
  { id: "anexos_agendamento", label: "Anexos e Agendamento" },
] as const;

const LAST_STEP = STEPS.length - 1;

/* ---------------- wizard ---------------- */

export function ContractWizard({
  plans,
  handoff,
  areaClienteAtiva = true,
}: {
  plans: Plan[];
  handoff: ContractHandoff;
  /** Vem do /admin: com a área desligada, cliente-base vai ao WhatsApp da central. */
  areaClienteAtiva?: boolean;
}) {
  const prefilledPlan = useMemo(
    () => plans.find((p) => p.nome === handoff.plano) ?? null,
    [plans, handoff.plano],
  );

  /** Nome/telefone/intenção que vieram do formulário da home (URL ou cookie). */
  const prefilledLead = useMemo<Lead>(
    () => ({
      nome: handoff.nome ?? "",
      telefone: handoff.whatsapp ? maskPhone(nationalPhoneDigits(handoff.whatsapp)) : "",
      intencao: isIntent(handoff.intencao) ? handoff.intencao : "",
    }),
    [handoff.nome, handoff.whatsapp, handoff.intencao],
  );

  const [lead, setLead] = useState<Lead>(prefilledLead);
  /**
   * Cada campo é pedido só quando não veio preenchido da home; os que vieram
   * ficam ocultos e aparecem apenas como informação acima dos planos.
   */
  const [needs] = useState(() => ({
    nome: prefilledLead.nome.trim().length < 3,
    telefone: !isValidPhone(prefilledLead.telefone),
    intencao: prefilledLead.intencao === "",
  }));
  const needsLead = needs.nome || needs.telefone || needs.intencao;

  /** Só o que veio da home — é isso que vira o bloco informativo. */
  const filledLead: Array<[string, string]> = [
    ...(needs.nome ? [] : ([["Nome", prefilledLead.nome]] as Array<[string, string]>)),
    ...(needs.telefone ? [] : ([["Telefone", prefilledLead.telefone]] as Array<[string, string]>)),
    ...(needs.intencao
      ? []
      : ([["Interesse", intentLabel(prefilledLead.intencao)]] as Array<[string, string]>)),
  ];

  /**
   * Quem já é cliente não tem o que contratar aqui.
   *
   * Dois caminhos chegam neste estado: marcar "Já sou cliente" no bloco de lead
   * (quem caiu direto em /contratacao) e chegar com `?intencao=ja_sou_cliente`
   * na URL. Nos dois, seguir o funil seria pedir um cadastro que já existe.
   */
  const [clienteBase, setClienteBase] = useState(() => prefilledLead.intencao === "ja_sou_cliente");

  const navigate = useNavigate();

  /*
   * A navegação para o login não pode acontecer durante a renderização — daí o
   * efeito. Com a área desligada não há para onde ir: fica a tela da central.
   */
  useEffect(() => {
    if (!clienteBase) return;
    dispararEvento(EVENTO.leadClienteBase, { origem: "contratacao" });
    if (areaClienteAtiva) void navigate({ to: "/cliente" });
  }, [clienteBase, areaClienteAtiva, navigate]);

  const [plan, setPlan] = useState<Plan | null>(prefilledPlan);
  const [step, setStep] = useState(prefilledPlan ? 1 : 0);
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [sessionId] = useState(newSessionId);
  /** Motivo pelo qual o webhook barrou a etapa atual. */
  const [stepBlock, setStepBlock] = useState<string | null>(null);
  /** Etapa barrada: o cliente está sendo levado ao WhatsApp. */
  const [redirecting, setRedirecting] = useState(false);

  const [address, setAddress] = useState<Address>({
    tipo: "",
    cep: "",
    cidade: "",
    bairro: "",
    logradouro: "",
    numero: "",
    complemento: "",
    condominio: "",
  });
  const [cepLoading, setCepLoading] = useState(false);

  const [person, setPerson] = useState<Person>({
    nome: handoff.nome ?? "",
    cpf: "",
    nascimento: "",
    email: "",
    telefone2: "",
  });
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [idFile, setIdFile] = useState<File | null>(null);

  const [date, setDate] = useState("");
  const [period, setPeriod] = useState<PeriodoInstalacao | "">("");
  const [note, setNote] = useState("");
  const [pagamento, setPagamento] = useState<DadosPagamento>(PAGAMENTO_VAZIO);

  /**
   * A agenda que o /admin alimenta, consultada com a cidade do cliente.
   *
   * `null` enquanto ninguém chegou à última etapa — a consulta acontece lá, e
   * não no carregamento da página, porque é lá que a cidade já existe.
   */
  const [agenda, setAgenda] = useState<AgendaInstalacao | null>(null);
  const [agendaCarregando, setAgendaCarregando] = useState(false);
  /** A cidade que gerou a agenda em mãos — trocá-la obriga a consultar de novo. */
  const [cidadeDaAgenda, setCidadeDaAgenda] = useState<string | null>(null);

  const clearError = (k: string) => setErrors((p) => ({ ...p, [k]: undefined }));

  /**
   * Busca os horários da instalação ao chegar na última etapa.
   *
   * Quem responde é o servidor, com o prazo da cidade escolhida (ou o padrão,
   * quando a cidade não está na tabela do /admin). A espera mínima de um
   * segundo é deliberada: a consulta é real, mas resolve rápido demais para o
   * cliente perceber que houve uma; com o aviso na tela, ele entende que a data
   * oferecida foi apurada para o endereço dele, e não é um calendário qualquer.
   *
   * Se a consulta falhar, vale a agenda de reserva — uma contratação pronta não
   * pode morrer na última etapa por causa de uma oscilação de rede.
   */
  useEffect(() => {
    if (step !== LAST_STEP) return;
    const cidade = address.cidade.trim();
    if (cidadeDaAgenda === cidade) return;

    let cancelado = false;
    setAgendaCarregando(true);

    const consulta = consultarAgendaInstalacao({ data: { cidade } }).catch((err) => {
      console.error("Falha ao consultar a agenda de instalação", err);
      return agendaDeReserva(new Date());
    });

    void Promise.all([consulta, new Promise((r) => setTimeout(r, ESPERA_AGENDA_MS))]).then(
      ([resultado]) => {
        if (cancelado) return;
        setAgenda(resultado);
        setCidadeDaAgenda(cidade);
        setAgendaCarregando(false);
      },
    );

    return () => {
      cancelado = true;
    };
  }, [step, address.cidade, cidadeDaAgenda]);

  /**
   * A escolha que a agenda nova não sustenta mais é apagada.
   *
   * Acontece quando o cliente volta, troca a cidade e retorna: a data que ele
   * tinha marcado pode não existir na agenda daquela outra cidade. Deixá-la na
   * tela seria oferecer um horário que o servidor acabou de dizer que não tem.
   */
  useEffect(() => {
    if (!agenda || !date) return;
    if (!agenda.dias.some((d) => d.data === date)) {
      setDate("");
      setPeriod("");
      return;
    }
    if (period && !periodoDoDia(agenda, date, period)) setPeriod("");
  }, [agenda, date, period]);

  /** Os períodos que a data escolhida oferece — vazio antes de escolher a data. */
  const periodosDoDia =
    agenda && date ? (agenda.dias.find((d) => d.data === date)?.periodos ?? []) : [];

  /** "nos 3 primeiros meses, após R$ 139,90" — só quando há promoção. */
  const planoPosDesconto = plan
    ? textoPosDesconto(plan.valor, plan.valor_primeiras_faturas, plan.quant_meses_desconto)
    : null;

  /**
   * O destino do "Continuar no WhatsApp": a conversa abre já com o resumo de
   * tudo o que a pessoa preencheu.
   *
   * É um `href` pronto, e não algo montado dentro do clique, porque o botão é
   * um link de verdade: sai do formulário sem passar por `window.open`, que o
   * navegador bloquearia se viesse depois de um await.
   */
  const linkWhatsApp = useMemo(() => {
    const resumo: ResumoContratacao = {
      lead: { nome: lead.nome, telefone: lead.telefone },
      plano: plan
        ? {
            nome: plan.nome,
            preco: precoVigente(plan.valor, plan.valor_primeiras_faturas),
            posDesconto: planoPosDesconto,
          }
        : null,
      endereco: address,
      cadastro: person,
      agendamento: { data: date, periodo: period, observacao: note },
      pagamento: {
        metodo: rotuloMetodo(pagamento.metodo),
        banco: exigeConta(pagamento.metodo) ? rotuloBanco(pagamento.banco) : "",
        agencia: exigeConta(pagamento.metodo) ? pagamento.agencia : "",
        conta: exigeConta(pagamento.metodo) ? pagamento.conta : "",
      },
      // Só a menção: o arquivo em si não cabe num link do WhatsApp.
      anexos: [
        ...(proofFile ? ["o comprovante de residência"] : []),
        ...(idFile ? ["o documento com foto"] : []),
      ],
    };
    return waLink(mensagemContratacao(resumo));
  }, [
    lead,
    plan,
    planoPosDesconto,
    address,
    person,
    date,
    period,
    note,
    pagamento,
    proofFile,
    idFile,
  ]);

  /* ----- CEP lookup ----- */
  async function lookupCep(value: string) {
    const d = onlyDigits(value);
    if (d.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const json = (await res.json()) as {
        erro?: boolean;
        localidade?: string;
        bairro?: string;
        logradouro?: string;
      };
      if (json.erro) {
        setErrors((p) => ({ ...p, cep: "CEP não encontrado" }));
        return;
      }
      setAddress((prev) => ({
        ...prev,
        cidade: json.localidade || prev.cidade,
        bairro: json.bairro || prev.bairro,
        logradouro: json.logradouro || prev.logradouro,
      }));
      setErrors((p) => ({
        ...p,
        cep: undefined,
        cidade: undefined,
        bairro: undefined,
        logradouro: undefined,
      }));
    } catch {
      // silencioso — o cliente pode preencher manualmente
    } finally {
      setCepLoading(false);
    }
  }

  /* ----- validation ----- */
  function validate(target: number): boolean {
    const e: Errors = {};
    if (target === 0) {
      if (needs.nome && lead.nome.trim().length < 3) e["lead_nome"] = "Digite seu nome completo";
      if (needs.telefone && !isValidPhone(lead.telefone))
        e["lead_telefone"] = "DDD + 8 ou 9 dígitos";
      if (needs.intencao && !lead.intencao) e["lead_intencao"] = "Escolha uma opção";
      if (!plan) {
        setErrors(e);
        toast.error(
          Object.keys(e).length
            ? "Preencha seus dados e escolha um plano para continuar."
            : "Escolha um plano para continuar.",
        );
        return false;
      }
    }
    if (target === 1) {
      if (!address.tipo) e["tipo"] = "Selecione casa ou apartamento";
      if (onlyDigits(address.cep).length !== 8) e["cep"] = "CEP inválido";
      if (!address.cidade.trim()) e["cidade"] = "Informe a cidade";
      if (!address.bairro.trim()) e["bairro"] = "Informe o bairro";
      if (!address.logradouro.trim()) e["logradouro"] = "Informe o logradouro";
      if (!address.numero.trim()) e["numero"] = "Informe o número";
      if (!address.complemento.trim()) e["complemento"] = "Informe o complemento";
      if (address.tipo === "apartamento" && !address.condominio.trim())
        e["condominio"] = "Informe o nome do condomínio";
    }
    if (target === 2) {
      if (!FULL_NAME_RE.test(person.nome.trim())) e["nome"] = "Digite nome e sobrenome";
      if (!isValidCpf(person.cpf)) e["cpf"] = "CPF inválido";
      if (!isAdultBirthDate(person.nascimento)) e["nascimento"] = "Data inválida (18+)";
      if (!EMAIL_RE.test(person.email.trim())) e["email"] = "E-mail inválido";
      // Campo opcional: em branco segue em frente. Preenchido, vale a mesma
      // regra de sempre — se é para ligar, tem que ser um número que atenda.
      if (person.telefone2.trim()) {
        if (!isValidPhone(person.telefone2)) {
          e["telefone2"] = "DDD + 8 ou 9 dígitos";
        } else if (onlyDigits(person.telefone2) === onlyDigits(lead.telefone)) {
          e["telefone2"] = "Deve ser diferente do telefone principal";
        }
      }
    }
    if (target === 3) {
      const pe = fileError(proofFile);
      const ie = fileError(idFile);
      if (pe) e["proof"] = pe;
      if (ie) e["id"] = ie;
      if (agendaCarregando) {
        e["date"] = "Aguarde a busca dos horários disponíveis";
      } else if (!date) {
        e["date"] = "Escolha uma data disponível";
      } else if (agenda && !agenda.dias.some((d) => d.data === date)) {
        // A agenda mudou (outra cidade, ou o dia virou) e a data escolhida
        // deixou de existir: melhor pedir outra do que agendar o impossível.
        e["date"] = "Essa data não está mais disponível. Escolha outra.";
      }
      if (!period) e["period"] = "Escolha o período";
      else if (date && agenda && !periodoDoDia(agenda, date, period))
        e["period"] = "Esse período não está disponível na data escolhida";
      Object.assign(e, errosPagamento(pagamento));
    }
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error("Confira os campos destacados em vermelho.");
      return false;
    }
    return true;
  }

  /* ----- webhook por etapa ----- */

  /** Mantém o DDI que veio da home quando o número não mudou; senão assume +55. */
  function leadWhatsapp() {
    const digits = onlyDigits(lead.telefone);
    if (!digits) return null;
    if (handoff.whatsapp && onlyDigits(handoff.whatsapp).endsWith(digits)) return handoff.whatsapp;
    return `+55${digits}`;
  }

  /**
   * Dados acumulados até a etapa informada — o webhook recebe o retrato
   * completo. Cada grupo usa o `id` da etapa que o preenche (STEPS); só
   * `origem` foge disso, por ser o lead que veio antes do formulário.
   */
  function buildDados(index: number, chosenPlan: Plan | null) {
    return {
      planos: chosenPlan ? planoWebhook(chosenPlan) : null,
      origem: {
        nome: lead.nome.trim() || null,
        whatsapp: leadWhatsapp(),
        intencao: lead.intencao || null,
      },
      ...(index >= 1
        ? {
            endereco: {
              tipo: address.tipo,
              cep: address.cep,
              cidade: address.cidade,
              bairro: address.bairro,
              logradouro: address.logradouro,
              numero: address.numero,
              complemento: address.complemento,
              condominio: address.condominio,
            },
          }
        : {}),
      ...(index >= 2
        ? {
            cadastro: {
              nome: person.nome.trim(),
              cpf: person.cpf,
              nascimento: person.nascimento,
              email: person.email.trim(),
              // principal informado na etapa 1; aqui só o contato adicional,
              // que é opcional — sem ele o campo vai explicitamente nulo
              telefone: lead.telefone,
              telefone2: person.telefone2.trim() || null,
            },
          }
        : {}),
      ...(index >= 3
        ? {
            anexos_agendamento: {
              data: date,
              periodo: period,
              // A faixa que o cliente LEU na tela ("08h às 12h"), e não a que o
              // fluxo do n8n suporia: com expediente por dia da semana, elas
              // podem ser diferentes num sábado.
              periodo_faixa: periodoDoDia(agenda ?? null, date, period)?.faixa ?? null,
              observacao: note.trim(),
              // O prazo que gerou a data, para o CRM saber por que ela é essa.
              prazo_horas: agenda?.prazoHoras ?? null,
              cidade_prazo: agenda?.cidadeReferencia || null,
            },
            /*
             * A forma de cobrança. Vai como grupo próprio, e não dentro do
             * agendamento, porque é dado de contrato: quem lê no n8n para
             * cadastrar a cobrança não deveria ter de procurá-lo no meio do
             * horário da visita.
             */
            pagamento: pagamentoWebhook(pagamento),
          }
        : {}),
    };
  }

  async function buildAnexos(index: number) {
    if (index < 3) return undefined;
    const picked = [
      { campo: "comprovante_residencia", file: proofFile },
      { campo: "documento_com_foto", file: idFile },
    ].filter((a): a is { campo: string; file: File } => a.file != null);

    return Promise.all(
      picked.map(async ({ campo, file }) => ({
        campo,
        nome: file.name,
        tipo: file.type,
        tamanho: file.size,
        conteudo_base64: await fileToBase64(file),
      })),
    );
  }

  /**
   * Envia a etapa ao webhook e só libera o avanço quando a resposta traz
   * `status: "ok"`. Erro, timeout ou qualquer outro status barra o usuário.
   */
  async function sendStep(index: number, chosenPlan: Plan | null): Promise<boolean> {
    const stepInfo = STEPS[index];
    if (!stepInfo) return false;

    const block = (message: string) => {
      setStepBlock(message);
      toast.error(message);
      // etapa recusada: o cliente é levado ao atendimento no WhatsApp
      setRedirecting(true);
      redirectToWhatsAppSupport();
      return false;
    };

    try {
      const [anexos, recaptchaToken] = await Promise.all([
        buildAnexos(index),
        getRecaptchaToken(`contratacao_${stepInfo.id}`),
      ]);
      const result = await submitContractStep({
        data: {
          etapa: index + 1,
          etapa_id: stepInfo.id,
          etapa_nome: stepInfo.label,
          total_etapas: STEPS.length,
          final: index === LAST_STEP,
          id_sessao: sessionId,
          page: window.location.pathname + window.location.search,
          dados: buildDados(index, chosenPlan),
          ...(anexos && anexos.length ? { anexos } : {}),
          attribution: getAttribution(),
          ...(recaptchaToken ? { recaptchaToken } : {}),
        },
      });
      if (result.ok) {
        setStepBlock(null);
        /*
         * `contratacao_1`, `contratacao_2`... um por etapa CONCLUÍDA.
         *
         * Disparar na conclusão, e não na abertura, é o que faz o funil dizer a
         * verdade: a etapa que foi recusada não conta, e é exatamente aí que a
         * queda aparece no relatório do GTM.
         */
        dispararEvento(eventoDaEtapa(index), {
          etapa: index + 1,
          etapa_id: stepInfo.id,
          etapa_nome: stepInfo.label,
          ...(chosenPlan
            ? {
                plano: chosenPlan.nome,
                preco: precoVigente(chosenPlan.valor, chosenPlan.valor_primeiras_faturas),
              }
            : {}),
        });
        if (index === LAST_STEP) {
          dispararEvento(EVENTO.contratacaoConcluida, {
            ...(chosenPlan
              ? {
                  plano: chosenPlan.nome,
                  preco: precoVigente(chosenPlan.valor, chosenPlan.valor_primeiras_faturas),
                }
              : {}),
          });
        }
        return true;
      }
      return block(
        result.message ||
          "Não foi possível validar esta etapa agora. Tente novamente em instantes.",
      );
    } catch (err) {
      console.error("Contract step submission failed", err);
      // O servidor limita envios por IP; sem esta checagem o 429 apareceria
      // para o cliente como um genérico "falha de conexão".
      if (isRateLimited(err)) {
        return block("Muitas tentativas seguidas. Aguarde alguns minutos ou fale no WhatsApp.");
      }
      if (isPayloadTooLarge(err)) {
        return block(`Anexos muito grandes. Envie arquivos de até ${MAX_FILE_MB}MB cada.`);
      }
      return block("Falha de conexão ao enviar esta etapa. Tente novamente.");
    }
  }

  async function advance(index: number, chosenPlan: Plan | null) {
    if (sending || redirecting) return;
    setSending(true);
    try {
      const ok = await sendStep(index, chosenPlan);
      if (!ok) return;
      setErrors({});
      if (index === LAST_STEP) {
        setDone(true);
      } else {
        setStep(Math.min(index + 1, LAST_STEP));
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSending(false);
    }
  }

  function next() {
    if (!validate(step)) return;
    void advance(step, plan);
  }

  function selectPlan(chosen: Plan) {
    if (sending || redirecting) return;
    setPlan(chosen);
    // Com os campos do lead na tela, o avanço é explícito pelo botão "Continuar".
    if (needsLead) return;
    void advance(0, chosen);
  }

  function back() {
    if (sending || redirecting) return;
    setErrors({});
    setStepBlock(null);
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function finish() {
    if (!validate(LAST_STEP)) return;
    void advance(LAST_STEP, plan);
  }

  /*
   * Cliente da base: a tela de contratação não tem o que oferecer a ele.
   *
   * Com a área de membros no ar, o destino é o login — o efeito faz a navegação
   * porque `navigate` durante a renderização é proibido no React. Desligada,
   * fica a mensagem com o WhatsApp da central.
   */
  if (clienteBase) {
    if (!areaClienteAtiva) {
      return (
        <div className="rounded-3xl border border-border bg-white shadow-xl">
          <AreaClienteDesligada
            mensagem="A área do cliente está em manutenção. Nossa central resolve com você agora mesmo pelo WhatsApp."
            origem="contratacao"
          />
        </div>
      );
    }
    return (
      <div className="rounded-3xl border border-border bg-white p-8 text-center shadow-xl">
        <h2 className="font-display text-2xl font-extrabold text-brand-deep">
          Você já é cliente SCNET
        </h2>
        <p className="mx-auto mt-3 max-w-lg font-body text-muted-foreground">
          Estamos te levando para a área do cliente, onde você resolve segunda via, suporte e
          mudança de plano.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-3xl border border-border bg-white p-8 text-center shadow-xl">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-zap/20">
          <Check className="size-9 text-zap-ink" strokeWidth={3} />
        </span>
        <h2 className="mt-5 font-display text-2xl font-extrabold text-brand-deep sm:text-3xl">
          Contratação enviada!
        </h2>
        <p className="mx-auto mt-3 max-w-lg font-body text-muted-foreground">
          Recebemos seus dados{plan ? ` para o ${plan.nome}` : ""} e a instalação foi pré-agendada
          para{" "}
          <strong className="text-brand-deep">
            {date.split("-").reverse().join("/")} (
            {periodoDoDia(agenda, date, period)?.rotulo.toLowerCase() ??
              (period === "manha" ? "manhã" : "tarde")}
            )
          </strong>
          . A ordem de serviço é confirmada após a assinatura digital do contrato, e nosso time
          segue com você no WhatsApp em instantes.
        </p>
        {/* Quem não quiser esperar a confirmação começa a conversa agora — e
            começa com o resumo, sem ter de repetir nada ao atendente. */}
        <Button
          variant="whats"
          size="xl"
          className="mt-6 w-full sm:w-auto"
          asChild
          onClick={() => {
            eventoDeClique("continuar_whatsapp", {
              texto: "Continuar no WhatsApp",
              local: "contratacao_concluida",
            });
            eventoWhatsapp("contratacao_concluida");
          }}
        >
          <a href={linkWhatsApp} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="size-5" />
            Continuar no WhatsApp
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-border bg-white p-5 shadow-xl sm:p-8">
      {plan && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand/25 bg-brand/10 px-4 py-3">
          <p className="font-ui text-sm font-semibold text-brand-deep">
            Plano escolhido: <span className="text-brand">{plan.nome}</span> — R${" "}
            {precoVigente(plan.valor, plan.valor_primeiras_faturas)}/mês
            {planoPosDesconto && (
              <span className="block font-normal text-brand-deep/70">{planoPosDesconto}</span>
            )}
          </p>
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(0)}
              disabled={sending || redirecting}
              className="font-ui text-xs font-semibold text-brand underline underline-offset-4 disabled:opacity-50"
            >
              Trocar plano
            </button>
          )}
        </div>
      )}

      <Stepper
        steps={STEPS.map((s) => s.label)}
        current={step}
        onGo={(i) => {
          if (!sending && !redirecting) setStep(i);
        }}
      />

      <div className="mt-7">
        {step === 0 && (
          <div className="space-y-7">
            {(needsLead || filledLead.length > 0) && (
              <div className="space-y-4 rounded-2xl border border-border bg-muted/30 p-4 sm:p-5">
                {filledLead.length > 0 && (
                  <div>
                    <p className="font-ui text-sm font-semibold text-brand-deep">Seus dados</p>
                    <dl className="mt-2 grid gap-x-8 gap-y-1 font-body text-sm text-muted-foreground sm:grid-cols-3">
                      {filledLead.map(([rotulo, valor]) => (
                        <div key={rotulo} className="flex gap-1.5">
                          <dt>{rotulo}:</dt>
                          <dd className="truncate font-semibold text-foreground">{valor}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}

                {needsLead && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <p className="font-ui text-sm font-semibold text-brand-deep sm:col-span-2">
                      {filledLead.length > 0
                        ? "Falta só isso pra continuar:"
                        : "Antes de escolher o plano, conte pra gente quem é você:"}
                    </p>

                    {needs.nome && (
                      <Field label="Nome" error={errors["lead_nome"]}>
                        <input
                          className={inputCls(!!errors["lead_nome"])}
                          value={lead.nome}
                          autoComplete="name"
                          maxLength={LIMITES.nome}
                          placeholder="Maria Silva"
                          onChange={(e) => {
                            setLead((p) => ({
                              ...p,
                              nome: limitar(capitalizeName(e.target.value), LIMITES.nome),
                            }));
                            clearError("lead_nome");
                          }}
                        />
                      </Field>
                    )}

                    {needs.telefone && (
                      <Field label="Telefone / WhatsApp" error={errors["lead_telefone"]}>
                        <input
                          className={inputCls(!!errors["lead_telefone"])}
                          value={lead.telefone}
                          inputMode="tel"
                          autoComplete="tel"
                          maxLength={LIMITES.telefone}
                          placeholder="(49) 99999-9999"
                          onChange={(e) => {
                            setLead((p) => ({ ...p, telefone: maskPhone(e.target.value) }));
                            clearError("lead_telefone");
                          }}
                        />
                      </Field>
                    )}

                    {needs.intencao && (
                      <Field
                        label="O que você precisa?"
                        error={errors["lead_intencao"]}
                        className="sm:col-span-2"
                      >
                        <div className="grid max-w-md grid-cols-2 gap-2">
                          {INTENTS.map(([value, text]) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => {
                                setLead((p) => ({ ...p, intencao: value }));
                                clearError("lead_intencao");
                                eventoDeClique(`intencao_${value}`, {
                                  texto: text,
                                  local: "contratacao",
                                });
                                // Já é cliente: sai do funil aqui mesmo, em vez
                                // de preencher endereço e documentos à toa.
                                if (value === "ja_sou_cliente") setClienteBase(true);
                              }}
                              className={cn(
                                "rounded-lg border px-3 py-3 font-ui text-sm font-semibold leading-6 transition",
                                lead.intencao === value
                                  ? "border-brand bg-brand/10 text-brand-deep"
                                  : "border-border bg-white text-muted-foreground hover:border-brand/40",
                              )}
                            >
                              {text}
                            </button>
                          ))}
                        </div>
                      </Field>
                    )}
                  </div>
                )}
              </div>
            )}

            <StepPlanos
              plans={plans}
              selected={plan}
              sending={sending || redirecting}
              onSelect={selectPlan}
            />
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo de instalação" error={errors["tipo"]} className="sm:col-span-2">
              <div className="grid grid-cols-2 gap-2 sm:max-w-sm">
                {(["casa", "apartamento"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setAddress((p) => ({ ...p, tipo: t }));
                      clearError("tipo");
                    }}
                    className={cn(
                      "rounded-lg border px-3 py-2.5 font-ui text-sm font-semibold capitalize transition",
                      address.tipo === t
                        ? "border-brand bg-brand/10 text-brand-deep"
                        : "border-border bg-white text-muted-foreground hover:border-brand/40",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="CEP" error={errors["cep"]}>
              <div className="relative">
                <input
                  className={inputCls(!!errors["cep"])}
                  value={address.cep}
                  inputMode="numeric"
                  maxLength={LIMITES.cep}
                  placeholder="89800-000"
                  onChange={(e) => {
                    const v = maskCep(e.target.value);
                    setAddress((p) => ({ ...p, cep: v }));
                    clearError("cep");
                    if (onlyDigits(v).length === 8) void lookupCep(v);
                  }}
                />
                {cepLoading && (
                  <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-brand" />
                )}
              </div>
            </Field>

            <Field label="Cidade" error={errors["cidade"]}>
              <input
                className={inputCls(!!errors["cidade"])}
                value={address.cidade}
                maxLength={LIMITES.cidade}
                placeholder="Chapecó"
                onChange={(e) => {
                  setAddress((p) => ({ ...p, cidade: limitar(e.target.value, LIMITES.cidade) }));
                  clearError("cidade");
                }}
              />
            </Field>

            <Field label="Bairro" error={errors["bairro"]}>
              <input
                className={inputCls(!!errors["bairro"])}
                value={address.bairro}
                maxLength={LIMITES.bairro}
                placeholder="Centro"
                onChange={(e) => {
                  setAddress((p) => ({ ...p, bairro: limitar(e.target.value, LIMITES.bairro) }));
                  clearError("bairro");
                }}
              />
            </Field>

            <Field label="Logradouro" error={errors["logradouro"]}>
              <input
                className={inputCls(!!errors["logradouro"])}
                value={address.logradouro}
                maxLength={LIMITES.logradouro}
                placeholder="Rua Getúlio Vargas"
                onChange={(e) => {
                  setAddress((p) => ({
                    ...p,
                    logradouro: limitar(e.target.value, LIMITES.logradouro),
                  }));
                  clearError("logradouro");
                }}
              />
            </Field>

            <Field label="Número" error={errors["numero"]}>
              <input
                className={inputCls(!!errors["numero"])}
                value={address.numero}
                inputMode="numeric"
                maxLength={LIMITES.numero}
                placeholder="1234"
                onChange={(e) => {
                  setAddress((p) => ({ ...p, numero: limitar(e.target.value, LIMITES.numero) }));
                  clearError("numero");
                }}
              />
            </Field>

            <Field label="Complemento" error={errors["complemento"]}>
              <input
                className={inputCls(!!errors["complemento"])}
                value={address.complemento}
                maxLength={LIMITES.complemento}
                placeholder="Bloco B, apto 302"
                onChange={(e) => {
                  setAddress((p) => ({
                    ...p,
                    complemento: limitar(e.target.value, LIMITES.complemento),
                  }));
                  clearError("complemento");
                }}
              />
            </Field>

            {address.tipo === "apartamento" && (
              <Field
                label="Nome do condomínio"
                error={errors["condominio"]}
                className="sm:col-span-2"
              >
                <input
                  className={inputCls(!!errors["condominio"])}
                  value={address.condominio}
                  maxLength={LIMITES.condominio}
                  placeholder="Residencial Bela Vista"
                  onChange={(e) => {
                    setAddress((p) => ({
                      ...p,
                      condominio: limitar(e.target.value, LIMITES.condominio),
                    }));
                    clearError("condominio");
                  }}
                />
              </Field>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome completo" error={errors["nome"]} className="sm:col-span-2">
              <input
                className={inputCls(!!errors["nome"])}
                value={person.nome}
                autoComplete="name"
                maxLength={LIMITES.nome}
                placeholder="Maria Silva"
                onChange={(e) => {
                  setPerson((p) => ({
                    ...p,
                    nome: limitar(capitalizeName(e.target.value), LIMITES.nome),
                  }));
                  clearError("nome");
                }}
              />
            </Field>

            <Field label="CPF" error={errors["cpf"]}>
              <input
                className={inputCls(!!errors["cpf"])}
                value={person.cpf}
                inputMode="numeric"
                maxLength={LIMITES.cpf}
                placeholder="000.000.000-00"
                onChange={(e) => {
                  setPerson((p) => ({ ...p, cpf: maskCpf(e.target.value) }));
                  clearError("cpf");
                }}
              />
            </Field>

            <Field label="Data de nascimento" error={errors["nascimento"]}>
              <input
                type="date"
                className={inputCls(!!errors["nascimento"])}
                value={person.nascimento}
                onChange={(e) => {
                  setPerson((p) => ({ ...p, nascimento: e.target.value }));
                  clearError("nascimento");
                }}
              />
            </Field>

            <Field label="E-mail" error={errors["email"]}>
              <input
                type="email"
                className={inputCls(!!errors["email"])}
                value={person.email}
                autoComplete="email"
                maxLength={LIMITES.email}
                placeholder="maria@email.com"
                onChange={(e) => {
                  setPerson((p) => ({ ...p, email: limitar(e.target.value, LIMITES.email) }));
                  clearError("email");
                }}
              />
            </Field>

            <Field
              label="2° telefone para contato (opcional)"
              error={errors["telefone2"]}
              hint={
                lead.telefone
                  ? `Se preencher, use um número diferente de ${lead.telefone}`
                  : "Um número a mais para o caso de não conseguirmos falar no principal"
              }
            >
              <input
                className={inputCls(!!errors["telefone2"])}
                value={person.telefone2}
                inputMode="tel"
                maxLength={LIMITES.telefone}
                placeholder="(49) 3333-3333"
                onChange={(e) => {
                  setPerson((p) => ({ ...p, telefone2: maskPhone(e.target.value) }));
                  clearError("telefone2");
                }}
              />
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-8">
            <div className="space-y-4">
              <h3 className="font-ui text-base font-bold text-brand-deep">Anexos</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <FileField
                  label="Comprovante de residência"
                  hint="Conta de água, luz, contrato de aluguel, etc. (PDF, PNG ou JPEG)"
                  file={proofFile}
                  error={errors["proof"]}
                  onPick={(f) => {
                    setProofFile(f);
                    clearError("proof");
                  }}
                />
                <FileField
                  label="Documento com foto"
                  hint="CNH, RG ou Passaporte (PDF, PNG ou JPEG)"
                  file={idFile}
                  error={errors["id"]}
                  onPick={(f) => {
                    setIdFile(f);
                    clearError("id");
                  }}
                />
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="font-ui text-base font-bold text-brand-deep">Agendamento</h3>

              {agendaCarregando ? (
                <BuscandoHorarios />
              ) : agenda && agenda.dias.length === 0 ? (
                <div
                  role="alert"
                  className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 font-body text-sm text-amber-900"
                >
                  Não encontramos datas livres para instalação{" "}
                  {address.cidade ? `em ${address.cidade}` : "nesta região"} no momento. Finalize
                  pelo{" "}
                  <a
                    href={whatsappSupportLink()}
                    className="font-semibold underline underline-offset-2"
                  >
                    WhatsApp
                  </a>{" "}
                  que nosso time agenda com você.
                </div>
              ) : (
                <>
                  <Field
                    label="Escolha a data da instalação"
                    error={errors["date"]}
                    hint={dicaDaAgenda(agenda, address.cidade)}
                  >
                    <CalendarPicker
                      value={date}
                      dias={agenda?.dias ?? []}
                      onChange={(v) => {
                        setDate(v);
                        // O período de ontem pode não existir no dia novo — um
                        // sábado só de manhã é o caso mais comum.
                        setPeriod((p) => (p && periodoDoDia(agenda, v, p) ? p : ""));
                        clearError("date");
                      }}
                    />
                  </Field>

                  <Field
                    label="Período"
                    error={errors["period"]}
                    hint={date ? undefined : "Escolha a data para ver os períodos disponíveis."}
                  >
                    <div className="grid max-w-md grid-cols-2 gap-3">
                      {periodosDoDia.map(({ id, rotulo, faixa }) => {
                        const Icon = id === "manha" ? Sun : Sunset;
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => {
                              setPeriod(id);
                              clearError("period");
                            }}
                            className={cn(
                              "flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition",
                              period === id
                                ? "border-brand bg-brand/10"
                                : "border-border bg-white hover:border-brand/40",
                            )}
                          >
                            <Icon
                              className={cn(
                                "size-5",
                                period === id ? "text-brand" : "text-muted-foreground",
                              )}
                            />
                            <span>
                              <span className="block font-ui text-sm font-semibold text-brand-deep">
                                {rotulo}
                              </span>
                              <span className="block font-body text-xs text-muted-foreground">
                                {faixa}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                </>
              )}

              <Field
                label="Observação (opcional)"
                hint={`${note.length}/${LIMITES.observacao} caracteres`}
              >
                <textarea
                  rows={3}
                  className={inputCls(false)}
                  value={note}
                  maxLength={LIMITES.observacao}
                  placeholder="Estarei em casa a partir das 10h da manhã"
                  onChange={(e) => setNote(limitar(e.target.value, LIMITES.observacao))}
                />
              </Field>
            </div>

            <StepPagamento
              pagamento={pagamento}
              errors={errors}
              onChange={(parte) => {
                setPagamento((atual) => ({ ...atual, ...parte }));
                for (const chave of Object.keys(parte)) clearError(`pagamento_${chave}`);
              }}
            />

            {/* O aviso fecha a etapa porque é a última coisa que o cliente lê
                antes de finalizar: a data escolhida é um pré-agendamento até a
                assinatura, e prometer o contrário aqui vira reclamação depois. */}
            <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
              <Info className="mt-0.5 size-5 shrink-0 text-amber-600" />
              <p className="font-body text-sm text-amber-900">
                O agendamento da ordem de serviço só será confirmada e garantida após a assinatura
                digital do contrato que será realizada na próxima etapa.
              </p>
            </div>
          </div>
        )}
      </div>

      {stepBlock && (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 font-body text-sm text-red-600"
        >
          <p>{stepBlock}</p>
          {redirecting && (
            <p className="mt-1 text-red-500">
              Estamos te levando para o atendimento no WhatsApp.{" "}
              <a
                href={whatsappSupportLink()}
                className="font-semibold underline underline-offset-2"
              >
                Abrir agora
              </a>
            </p>
          )}
        </div>
      )}

      {/* Na etapa 0 sem plano no banco o "Continuar" nunca passaria da validação:
          melhor não oferecer o botão do que travar o cliente nele. */}
      {(step > 0 || (needsLead && plans.length > 0)) && (
        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          {step > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={back}
              disabled={sending || redirecting}
            >
              <ChevronLeft /> Voltar
            </Button>
          ) : (
            <span className="hidden sm:block" />
          )}
          {step < LAST_STEP ? (
            <Button
              type="button"
              variant="brand"
              size="xl"
              onClick={next}
              disabled={sending || redirecting}
            >
              {sending ? <Loader2 className="animate-spin" /> : null} Continuar <ChevronRight />
            </Button>
          ) : (
            /* A última etapa tem uma saída só: finalizar. O "Continuar no
               WhatsApp" espera a tela de obrigado — oferecê-lo aqui competiria
               com o envio, e quem saísse por ele nunca concluiria. */
            <Button
              type="button"
              variant="zap"
              size="xl"
              onClick={finish}
              disabled={sending || redirecting}
            >
              {sending ? <Loader2 className="animate-spin" /> : <Check />} Finalizar contratação
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- step 1: planos ---------------- */

function StepPlanos({
  plans,
  selected,
  sending,
  onSelect,
}: {
  plans: Plan[];
  selected: Plan | null;
  sending: boolean;
  onSelect: (p: Plan) => void;
}) {
  // Sem plano não há como avançar: em vez de travar o cliente no "Continuar",
  // a etapa oferece a saída pelo atendimento.
  if (!plans.length) return <PlanosIndisponiveis destino={LINK_FORMULARIO} />;

  return (
    <div>
      {/* Grade de 4 colunas no desktop, conforme o layout do formulário. */}
      <div className="grid gap-5 pt-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => {
          const isSelected = selected?.id_plano === p.id_plano;
          return (
            <button
              key={p.id_plano}
              type="button"
              onClick={() => onSelect(p)}
              disabled={sending}
              className={cn(
                "group relative flex h-full flex-col rounded-3xl p-6 text-left transition-all duration-300 hover:-translate-y-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none",
                sending && !isSelected && "opacity-50",
                p.destaque
                  ? "gradient-brand border-2 border-zap text-primary-foreground shadow-[0_20px_60px_-15px_color-mix(in_oklab,var(--color-zap)_55%,transparent)] focus-visible:ring-zap"
                  : "border border-border bg-card text-card-foreground focus-visible:ring-brand",
                isSelected && !p.destaque && "border-brand ring-2 ring-brand/30",
              )}
            >
              <span
                className={cn(
                  "absolute right-4 top-4 grid size-7 place-items-center rounded-full transition",
                  isSelected
                    ? p.destaque
                      ? "bg-zap text-zap-ink opacity-100"
                      : "bg-brand text-primary-foreground opacity-100"
                    : cn(
                        "border-2 opacity-0 group-hover:opacity-100",
                        p.destaque ? "border-zap text-zap" : "border-brand text-brand",
                      ),
                )}
                aria-hidden="true"
              >
                {isSelected && sending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : isSelected ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <Circle className="size-4" />
                )}
              </span>

              <SeloDestaque plan={p} />
              <h3
                className={cn("font-ui text-2xl font-bold", p.destaque ? "text-zap" : "text-brand")}
              >
                {p.nome}
              </h3>
              <div className="mt-3">
                <PrecoPlano plan={p} featured={p.destaque} />
              </div>
              <LogosAgregados logos={p.logos} featured={p.destaque} />
              <ItensPlano itens={p.itens} featured={p.destaque} className="mt-5" />
            </button>
          );
        })}
      </div>
      <p className="mx-auto mt-8 max-w-3xl text-center font-body text-xs text-muted-foreground">
        *Condições sujeitas a análise de crédito e viabilidade técnica. Todos os planos residenciais
        (CPF) possuem fidelidade de 12 meses.
      </p>
    </div>
  );
}

/* ---------------- file field ---------------- */

function FileField({
  label,
  hint,
  file,
  error,
  onPick,
}: {
  label: string;
  hint: string;
  file: File | null;
  error?: string | undefined;
  onPick: (f: File | null) => void;
}) {
  return (
    <Field label={label} error={error} hint={hint}>
      <label
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-lg border border-dashed px-4 py-3 transition",
          error ? "border-red-400 bg-red-50/50" : "border-border bg-muted/40 hover:border-brand",
        )}
      >
        <Paperclip className="size-4 shrink-0 text-brand" />
        <span className="truncate font-body text-sm text-muted-foreground">
          {file ? file.name : "Selecionar arquivo (PDF, PNG, JPEG)"}
        </span>
        <input
          type="file"
          accept={ACCEPT}
          className="sr-only"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </label>
    </Field>
  );
}

/* ---------------- pagamento ---------------- */

/**
 * A forma de cobrança, na etapa em que o cliente já decidiu contratar.
 *
 * A descrição de cada opção fica abaixo do título, discreta, porque ela responde
 * a dúvida que faz a pessoa parar ("como o boleto chega até mim?", "meu banco
 * dá?") sem transformar a escolha num texto para ler.
 *
 * Os campos da conta só existem quando o débito é escolhido: pedir banco,
 * agência e conta a quem vai pagar por Pix é pedir dado bancário sem motivo — e
 * dado bancário sem motivo é o tipo de campo que faz o cliente desistir.
 */
function StepPagamento({
  pagamento,
  errors,
  onChange,
}: {
  pagamento: DadosPagamento;
  errors: Errors;
  onChange: (parte: Partial<DadosPagamento>) => void;
}) {
  const debito = exigeConta(pagamento.metodo);

  return (
    <div className="space-y-4">
      <h3 className="font-ui text-base font-bold text-brand-deep">Método de pagamento</h3>

      <Field label="Como você prefere pagar?" error={errors["pagamento_metodo"]}>
        <div className="grid gap-3 sm:grid-cols-2">
          {METODOS_PAGAMENTO.map(({ id, titulo, descricao }) => (
            <button
              key={id}
              type="button"
              onClick={() => onChange({ metodo: id })}
              className={cn(
                "rounded-xl border px-4 py-3 text-left transition",
                pagamento.metodo === id
                  ? "border-brand bg-brand/10"
                  : "border-border bg-white hover:border-brand/40",
              )}
            >
              <span className="block font-ui text-sm font-semibold text-brand-deep">{titulo}</span>
              <span className="mt-0.5 block font-body text-xs text-muted-foreground">
                {descricao}
              </span>
            </button>
          ))}
        </div>
      </Field>

      {debito && (
        <div className="grid gap-4 rounded-2xl border border-border bg-muted/30 p-4 sm:grid-cols-3 sm:p-5">
          <p className="font-body text-xs text-muted-foreground sm:col-span-3">
            Informe a conta de onde a mensalidade será debitada. Ela precisa estar no nome do
            titular do contrato.
          </p>

          <Field label="Banco" error={errors["pagamento_banco"]}>
            <select
              className={inputCls(!!errors["pagamento_banco"])}
              value={pagamento.banco}
              onChange={(e) => onChange({ banco: e.target.value as BancoDebito })}
            >
              <option value="">Selecione</option>
              {BANCOS_DEBITO.map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Agência" error={errors["pagamento_agencia"]}>
            <input
              className={inputCls(!!errors["pagamento_agencia"])}
              value={pagamento.agencia}
              inputMode="numeric"
              maxLength={LIMITES.agencia}
              placeholder="1234"
              onChange={(e) => onChange({ agencia: maskAgencia(e.target.value) })}
            />
          </Field>

          <Field label="Conta com dígito" error={errors["pagamento_conta"]}>
            <input
              className={inputCls(!!errors["pagamento_conta"])}
              value={pagamento.conta}
              inputMode="text"
              maxLength={LIMITES.conta}
              placeholder="12345-6"
              onChange={(e) => onChange({ conta: maskConta(e.target.value) })}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

/* ---------------- calendar ---------------- */

/** O aviso que fica no lugar da data e do período enquanto a agenda é consultada. */
function BuscandoHorarios() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 rounded-xl border border-brand/30 bg-brand/5 px-4 py-5"
    >
      <Loader2 className="size-5 shrink-0 animate-spin text-brand" />
      <p className="font-body text-sm text-brand-deep">
        Buscando horários disponíveis para instalação da sua internet...
      </p>
    </div>
  );
}

/** "Primeira data disponível em Chapecó: 12/09." — o porquê da data que ele vê. */
function dicaDaAgenda(agenda: AgendaInstalacao | null, cidade: string): string | undefined {
  if (!agenda?.primeiraData) return undefined;
  const [, mes, dia] = agenda.primeiraData.split("-");
  const onde = cidade.trim() ? ` em ${cidade.trim()}` : "";
  return `Primeira data disponível${onde}: ${dia}/${mes}. As datas em cinza não têm equipe livre.`;
}

/**
 * O calendário, agora desenhado a partir da agenda do /admin.
 *
 * Um dia só fica clicável quando o servidor o devolveu — ou seja, quando ele
 * está depois do prazo daquela cidade E tem equipe naquele dia da semana. Os
 * dois meses mostrados começam no mês da primeira data livre, e não no mês
 * atual: com um prazo longo, o mês de hoje seria uma tela inteira de dias
 * apagados.
 */
function CalendarPicker({
  value,
  dias,
  onChange,
}: {
  value: string;
  dias: DiaDisponivel[];
  onChange: (v: string) => void;
}) {
  const disponiveis = useMemo(() => new Set(dias.map((d) => d.data)), [dias]);

  const months = useMemo(() => {
    const primeira = dias[0]?.data;
    const base = primeira
      ? new Date(Number(primeira.slice(0, 4)), Number(primeira.slice(5, 7)) - 1, 1)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    return [base, new Date(base.getFullYear(), base.getMonth() + 1, 1)];
  }, [dias]);

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {months.map((m) => {
        const first = new Date(m.getFullYear(), m.getMonth(), 1);
        const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
        const cells: (Date | null)[] = Array.from({ length: first.getDay() }, () => null);
        for (let d = 1; d <= daysInMonth; d++)
          cells.push(new Date(m.getFullYear(), m.getMonth(), d));
        return (
          <div key={ymd(m)} className="rounded-2xl border border-border bg-muted/20 p-4">
            <p className="text-center font-ui text-sm font-bold text-brand-deep">
              {MONTHS[m.getMonth()]} {m.getFullYear()}
            </p>
            <div className="mt-3 grid grid-cols-7 gap-1 text-center font-ui text-[11px] font-semibold text-muted-foreground">
              {WEEKDAYS.map((w, i) => (
                <span key={i}>{w}</span>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (!d) return <span key={i} />;
                const key = ymd(d);
                const disabled = !disponiveis.has(key);
                const isSelected = value === key;
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={disabled}
                    onClick={() => onChange(key)}
                    className={cn(
                      "aspect-square rounded-lg font-body text-sm transition",
                      disabled && "cursor-not-allowed text-muted-foreground/35",
                      !disabled &&
                        !isSelected &&
                        "text-foreground hover:bg-brand/10 hover:text-brand-deep",
                      isSelected && "bg-brand font-bold text-primary-foreground",
                    )}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
