import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Circle, Loader2, Paperclip, Sun, Sunset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { plans, type Plan } from "@/lib/plans";
import { capitalizeName, isValidPhone, maskPhone } from "@/lib/form-utils";
import { cn } from "@/lib/utils";
import type { ContractHandoff } from "@/lib/contract-handoff";

/* ---------------- helpers ---------------- */

const ACCEPT = ".pdf,.png,.jpg,.jpeg";
const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg"];
const MAX_FILE_MB = 10;

const onlyDigits = (v: string) => v.replace(/\D/g, "");

function maskCep(v: string) {
  const d = onlyDigits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

function maskCpf(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

function isValidCpf(v: string) {
  const d = onlyDigits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
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
  if (!ACCEPTED_TYPES.includes(file.type)) return "Use PDF, PNG ou JPEG";
  if (file.size > MAX_FILE_MB * 1024 * 1024) return `Máximo ${MAX_FILE_MB}MB`;
  return null;
}

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/* ---------------- UI atoms ---------------- */

const inputCls = (error?: boolean) =>
  cn(
    "w-full rounded-lg border bg-muted/40 px-4 py-3 font-body text-foreground placeholder:text-muted-foreground outline-none transition focus:ring-2",
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
  hint?: string;
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

type Person = {
  nome: string;
  cpf: string;
  nascimento: string;
  email: string;
  telefone: string;
  telefone2: string;
};

type Errors = Record<string, string | undefined>;

/* ---------------- wizard ---------------- */

export function ContractWizard({ handoff }: { handoff: ContractHandoff }) {
  const prefilledPlan = useMemo(
    () => plans.find((p) => p.name === handoff.plano) ?? null,
    [handoff.plano],
  );

  const [plan, setPlan] = useState<Plan | null>(prefilledPlan);
  const [step, setStep] = useState(prefilledPlan ? 1 : 0);
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

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
    telefone: handoff.whatsapp ? maskPhone(onlyDigits(handoff.whatsapp).slice(-11)) : "",
    telefone2: "",
  });
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [idFile, setIdFile] = useState<File | null>(null);

  const [date, setDate] = useState("");
  const [period, setPeriod] = useState<"manha" | "tarde" | "">("");
  const [note, setNote] = useState("");

  const steps = ["Planos", "Endereço", "Cadastro", "Agendamento"];
  const clearError = (k: string) => setErrors((p) => ({ ...p, [k]: undefined }));

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
      setErrors((p) => ({ ...p, cep: undefined, cidade: undefined, bairro: undefined, logradouro: undefined }));
    } catch {
      // silencioso — o cliente pode preencher manualmente
    } finally {
      setCepLoading(false);
    }
  }

  /* ----- validation ----- */
  const personFilled =
    FULL_NAME_RE.test(person.nome.trim()) &&
    isValidCpf(person.cpf) &&
    isAdultBirthDate(person.nascimento) &&
    EMAIL_RE.test(person.email.trim()) &&
    isValidPhone(person.telefone);

  function validate(target: number): boolean {
    const e: Errors = {};
    if (target === 0 && !plan) {
      toast.error("Escolha um plano para continuar.");
      return false;
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
      if (!person.telefone2.trim()) {
        e["telefone2"] = "Informe um segundo telefone";
      } else if (!isValidPhone(person.telefone2)) {
        e["telefone2"] = "DDD + 8 ou 9 dígitos";
      } else if (onlyDigits(person.telefone2) === onlyDigits(person.telefone)) {
        e["telefone2"] = "Deve ser diferente do telefone principal";
      }
      if (personFilled) {
        const pe = fileError(proofFile);
        const ie = fileError(idFile);
        if (pe) e["proof"] = pe;
        if (ie) e["id"] = ie;
      }
    }
    if (target === 3) {
      if (!date) e["date"] = "Escolha uma data disponível";
      if (!period) e["period"] = "Escolha o período";
    }
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error("Confira os campos destacados em vermelho.");
      return false;
    }
    return true;
  }

  function next() {
    if (!validate(step)) return;
    setErrors({});
    setStep((s) => Math.min(s + 1, steps.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function back() {
    setErrors({});
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function finish() {
    if (!validate(3)) return;
    setSending(true);
    try {
      await new Promise((r) => setTimeout(r, 600));
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSending(false);
    }
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
          Recebemos seus dados{plan ? ` para o ${plan.name}` : ""} e a instalação foi solicitada para{" "}
          <strong className="text-brand-deep">
            {date.split("-").reverse().join("/")} ({period === "manha" ? "manhã" : "tarde"})
          </strong>
          . Nosso time confirma tudo no WhatsApp em instantes.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-border bg-white p-5 shadow-xl sm:p-8">
      {plan && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand/25 bg-brand/10 px-4 py-3">
          <p className="font-ui text-sm font-semibold text-brand-deep">
            Plano escolhido: <span className="text-brand">{plan.name}</span> — R$ {plan.price}/mês
          </p>
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(0)}
              className="font-ui text-xs font-semibold text-brand underline underline-offset-4"
            >
              Trocar plano
            </button>
          )}
        </div>
      )}

      <Stepper steps={steps} current={step} onGo={setStep} />

      <div className="mt-7">
        {step === 0 && <StepPlanos selected={plan} onSelect={(p) => { setPlan(p); setStep(1); }} />}

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
                placeholder="Chapecó"
                onChange={(e) => {
                  setAddress((p) => ({ ...p, cidade: e.target.value }));
                  clearError("cidade");
                }}
              />
            </Field>

            <Field label="Bairro" error={errors["bairro"]}>
              <input
                className={inputCls(!!errors["bairro"])}
                value={address.bairro}
                placeholder="Centro"
                onChange={(e) => {
                  setAddress((p) => ({ ...p, bairro: e.target.value }));
                  clearError("bairro");
                }}
              />
            </Field>

            <Field label="Logradouro" error={errors["logradouro"]}>
              <input
                className={inputCls(!!errors["logradouro"])}
                value={address.logradouro}
                placeholder="Rua Getúlio Vargas"
                onChange={(e) => {
                  setAddress((p) => ({ ...p, logradouro: e.target.value }));
                  clearError("logradouro");
                }}
              />
            </Field>

            <Field label="Número" error={errors["numero"]}>
              <input
                className={inputCls(!!errors["numero"])}
                value={address.numero}
                inputMode="numeric"
                placeholder="1234"
                onChange={(e) => {
                  setAddress((p) => ({ ...p, numero: e.target.value }));
                  clearError("numero");
                }}
              />
            </Field>

            <Field label="Complemento (opcional)">
              <input
                className={inputCls(false)}
                value={address.complemento}
                placeholder="Bloco B, apto 302"
                onChange={(e) => setAddress((p) => ({ ...p, complemento: e.target.value }))}
              />
            </Field>

            {address.tipo === "apartamento" && (
              <Field label="Nome do condomínio" error={errors["condominio"]} className="sm:col-span-2">
                <input
                  className={inputCls(!!errors["condominio"])}
                  value={address.condominio}
                  placeholder="Residencial Bela Vista"
                  onChange={(e) => {
                    setAddress((p) => ({ ...p, condominio: e.target.value }));
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
                placeholder="Maria Silva"
                onChange={(e) => {
                  setPerson((p) => ({ ...p, nome: capitalizeName(e.target.value) }));
                  clearError("nome");
                }}
              />
            </Field>

            <Field label="CPF" error={errors["cpf"]}>
              <input
                className={inputCls(!!errors["cpf"])}
                value={person.cpf}
                inputMode="numeric"
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
                placeholder="maria@email.com"
                onChange={(e) => {
                  setPerson((p) => ({ ...p, email: e.target.value }));
                  clearError("email");
                }}
              />
            </Field>

            <Field label="Telefone / WhatsApp principal" error={errors["telefone"]}>
              <input
                className={inputCls(!!errors["telefone"])}
                value={person.telefone}
                inputMode="tel"
                placeholder="(49) 99999-9999"
                onChange={(e) => {
                  setPerson((p) => ({ ...p, telefone: maskPhone(e.target.value) }));
                  clearError("telefone");
                }}
              />
            </Field>

            <Field label="2° telefone para contato" error={errors["telefone2"]} className="sm:col-span-2">
              <input
                className={inputCls(!!errors["telefone2"])}
                value={person.telefone2}
                inputMode="tel"
                placeholder="(49) 3333-3333"
                onChange={(e) => {
                  setPerson((p) => ({ ...p, telefone2: maskPhone(e.target.value) }));
                  clearError("telefone2");
                }}
              />
            </Field>

            {personFilled ? (
              <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
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
            ) : (
              <p className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3 font-body text-sm text-muted-foreground sm:col-span-2">
                Preencha os dados acima para liberar o envio dos documentos.
              </p>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <Field label="Escolha a data da instalação" error={errors["date"]}>
              <CalendarPicker
                value={date}
                onChange={(v) => {
                  setDate(v);
                  clearError("date");
                }}
              />
            </Field>

            <Field label="Período" error={errors["period"]}>
              <div className="grid max-w-md grid-cols-2 gap-3">
                {(
                  [
                    ["manha", "Manhã", "08h às 12h", Sun],
                    ["tarde", "Tarde", "13h às 18h", Sunset],
                  ] as const
                ).map(([value, title, hours, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setPeriod(value);
                      clearError("period");
                    }}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition",
                      period === value
                        ? "border-brand bg-brand/10"
                        : "border-border bg-white hover:border-brand/40",
                    )}
                  >
                    <Icon className={cn("size-5", period === value ? "text-brand" : "text-muted-foreground")} />
                    <span>
                      <span className="block font-ui text-sm font-semibold text-brand-deep">{title}</span>
                      <span className="block font-body text-xs text-muted-foreground">{hours}</span>
                    </span>
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Observação (opcional)">
              <textarea
                rows={3}
                className={inputCls(false)}
                value={note}
                placeholder="Estarei em casa a partir das 10h da manhã"
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
          </div>
        )}
      </div>

      {step > 0 && (
        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="outline" size="lg" onClick={back}>
            <ChevronLeft /> Voltar
          </Button>
          {step < 3 ? (
            <Button type="button" variant="brand" size="xl" onClick={next}>
              Continuar <ChevronRight />
            </Button>
          ) : (
            <Button type="button" variant="zap" size="xl" onClick={() => void finish()} disabled={sending}>
              {sending ? <Loader2 className="animate-spin" /> : <Check />} Finalizar contratação
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------- step 1: planos ---------------- */

function StepPlanos({ selected, onSelect }: { selected: Plan | null; onSelect: (p: Plan) => void }) {
  return (
    <div>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => {
          const isSelected = selected?.name === p.name;
          return (
            <button
              key={p.name}
              type="button"
              onClick={() => onSelect(p)}
              className={cn(
                "group relative flex h-full flex-col rounded-3xl p-6 text-left transition-all duration-300 hover:-translate-y-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                p.featured
                  ? "gradient-brand border-2 border-zap text-primary-foreground shadow-[0_20px_60px_-15px_color-mix(in_oklab,var(--color-zap)_55%,transparent)] focus-visible:ring-zap"
                  : "border border-border bg-card text-card-foreground focus-visible:ring-brand",
                isSelected && !p.featured && "border-brand ring-2 ring-brand/30",
              )}
            >
              <span
                className={cn(
                  "absolute right-4 top-4 grid size-7 place-items-center rounded-full transition",
                  isSelected
                    ? p.featured
                      ? "bg-zap text-zap-ink opacity-100"
                      : "bg-brand text-primary-foreground opacity-100"
                    : cn(
                        "border-2 opacity-0 group-hover:opacity-100",
                        p.featured ? "border-zap text-zap" : "border-brand text-brand",
                      ),
                )}
                aria-hidden="true"
              >
                {isSelected ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
              </span>

              {p.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-zap px-4 py-1 font-ui text-xs font-extrabold tracking-wide text-zap-ink">
                  MAIS ESCOLHIDO
                </span>
              )}
              <h3 className={cn("font-ui text-2xl font-bold", p.featured ? "text-zap" : "text-brand")}>
                {p.name}
              </h3>
              <p className="mt-3 font-display text-3xl font-extrabold tracking-tight">
                <span className="align-super text-lg">R$</span> {p.price}
                <span
                  className={cn(
                    "font-body text-sm font-medium",
                    p.featured ? "text-primary-foreground/70" : "text-muted-foreground",
                  )}
                >
                  /mês
                </span>
              </p>
              <ul className="mt-5 space-y-2">
                {p.features.map((f) => (
                  <li key={f.text} className="font-body text-sm">
                    {f.text}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>
      <p className="mx-auto mt-8 max-w-3xl text-center font-body text-xs text-muted-foreground">
        *Instalação gratuita para os planos 450, 710 e Infinity. Plano Infinity Duo: instalação R$
        100,00 (taxa única). Fidelidade de 12 meses (CPF) e 24 meses (PJ).
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

/* ---------------- calendar ---------------- */

function CalendarPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const minDate = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    return d;
  }, [today]);

  const months = useMemo(() => {
    const a = new Date(today.getFullYear(), today.getMonth(), 1);
    const b = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    return [a, b];
  }, [today]);

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {months.map((m) => {
        const first = new Date(m.getFullYear(), m.getMonth(), 1);
        const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
        const cells: (Date | null)[] = Array.from({ length: first.getDay() }, () => null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(m.getFullYear(), m.getMonth(), d));
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
                const disabled = d < minDate;
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
                      !disabled && !isSelected && "text-foreground hover:bg-brand/10 hover:text-brand-deep",
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
