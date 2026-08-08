import { useState, type FormEvent } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getAttribution } from "@/lib/utm";
import { getRecaptchaToken } from "@/lib/recaptcha";
import { getFacebookCookies, trackLeadEvent } from "@/lib/facebook-pixel";
import { submitLead } from "@/lib/submit-lead";
import { capitalizeName, isValidPhone, maskPhone } from "@/lib/form-utils";
import { writeContractHandoffCookie } from "@/lib/contract-handoff";
import { cn } from "@/lib/utils";

export type SelectedPlan = { name: string; price: string };

type Intent = "quero_contratar" | "ja_sou_cliente";

/** Fires the webhook/CAPI in the background — never blocks navigation to /contratacao. */
async function submitContractInBackground(input: {
  name: string;
  ddi: string;
  phone: string;
  intent: Intent;
  plan?: SelectedPlan | undefined;
}) {
  try {
    const recaptchaToken = await getRecaptchaToken("contract_form_submit");
    const { fbc, fbp } = getFacebookCookies();
    await submitLead({
      data: {
        name: input.name,
        ddi: input.ddi,
        phone: input.phone,
        page: window.location.pathname + window.location.search,
        intent: input.intent,
        plan: input.plan?.name,
        price: input.plan?.price,
        recaptchaToken,
        fbc,
        fbp,
        attribution: getAttribution(),
      },
    });
  } catch (err) {
    console.error("Contract form submission failed", err);
  }
}

export function ContractForm({ selectedPlan }: { selectedPlan: SelectedPlan | null }) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [ddi, setDdi] = useState("+55");
  const [phone, setPhone] = useState("");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [errors, setErrors] = useState<{ name?: boolean; phone?: boolean; intent?: boolean }>({});

  const field = (hasError: boolean) =>
    cn(
      "w-full rounded-lg border bg-muted/40 px-4 py-3 font-body text-foreground placeholder:text-muted-foreground outline-none transition focus:ring-2",
      hasError
        ? "border-red-400 focus:border-red-500 focus:ring-red-300/40"
        : "border-border focus:border-brand focus:ring-brand/30",
    );
  const label = (hasError: boolean) =>
    cn(
      "font-ui text-sm font-semibold transition",
      hasError ? "text-red-500" : "text-brand-deep",
    );

  function submit(e: FormEvent) {
    e.preventDefault();
    const nextErrors = {
      name: name.trim().length < 3,
      phone: !isValidPhone(phone),
      intent: !intent,
    };
    setErrors(nextErrors);

    if (nextErrors.name) {
      toast.error("Escreve teu nome completo pra gente te chamar direito 🙂");
      return;
    }
    if (nextErrors.phone) {
      toast.error("Confere o telefone: DDD + 8 ou 9 dígitos.");
      return;
    }
    if (nextErrors.intent || !intent) {
      toast.error("Escolha uma opção: Quero contratar ou Já sou cliente.");
      return;
    }

    const trimmedName = name.trim();
    const whatsapp = `${ddi}${phone.replace(/\D/g, "")}`;
    const chosenIntent = intent;

    trackLeadEvent();
    void submitContractInBackground({
      name: trimmedName,
      ddi,
      phone,
      intent: chosenIntent,
      plan: selectedPlan ?? undefined,
    });

    const handoff = {
      nome: trimmedName,
      whatsapp,
      intencao: chosenIntent,
      ...(selectedPlan ? { plano: selectedPlan.name, preco: selectedPlan.price } : {}),
    };
    writeContractHandoffCookie(handoff);

    void navigate({ to: "/contratacao", search: handoff });
  }

  return (
    <form
      id="contrate"
      onSubmit={submit}
      className="w-full scroll-mt-28 rounded-2xl border border-border bg-white p-6 shadow-xl sm:p-8"
    >
      {selectedPlan && (
        <div className="mb-4 rounded-xl border border-brand/25 bg-brand/10 px-4 py-3 font-ui text-sm font-semibold text-brand-deep">
          Plano desejado: <span className="text-brand">{selectedPlan.name}</span> — R${" "}
          {selectedPlan.price}/mês
        </div>
      )}
      <p className="font-display text-2xl font-extrabold text-brand-deep">Contrate agora (Leva menos de 2 minutos...)</p>
      <div className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <label className={label(!!errors.name)} htmlFor="nome-contrate">
            Nome
          </label>
          <input
            id="nome-contrate"
            className={field(!!errors.name)}
            value={name}
            onChange={(e) => {
              setName(capitalizeName(e.target.value));
              if (errors.name) setErrors((prev) => ({ ...prev, name: false }));
            }}
            placeholder="Maria Silva"
            autoComplete="name"
          />
        </div>
        <div className="space-y-1.5">
          <label className={label(!!errors.phone)} htmlFor="tel-contrate">
            Telefone / WhatsApp
          </label>
          <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
            <input
              aria-label="DDI"
              className={field(!!errors.phone) + " text-center"}
              value={ddi}
              onChange={(e) => setDdi("+" + e.target.value.replace(/\D/g, "").slice(0, 3))}
            />
            <input
              id="tel-contrate"
              className={field(!!errors.phone)}
              value={phone}
              inputMode="tel"
              onChange={(e) => {
                setPhone(maskPhone(e.target.value));
                if (errors.phone) setErrors((prev) => ({ ...prev, phone: false }));
              }}
              placeholder="(49) 99999-9999"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <span className={label(!!errors.intent)}>O que você precisa?</span>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["quero_contratar", "Quero contratar"],
                ["ja_sou_cliente", "Já sou cliente"],
              ] as const
            ).map(([value, text]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setIntent(value);
                  if (errors.intent) setErrors((prev) => ({ ...prev, intent: false }));
                }}
                className={cn(
                  "rounded-md border px-3 py-2 font-ui text-xs font-medium transition",
                  intent === value
                    ? "border-brand bg-brand/10 text-brand-deep"
                    : errors.intent
                      ? "border-red-300 bg-red-50 text-red-500 hover:border-red-400 hover:text-red-600"
                      : "border-border bg-white text-muted-foreground hover:border-brand/40 hover:text-brand-deep",
                )}
              >
                {text}
              </button>
            ))}
          </div>
        </div>
      </div>
      <Button type="submit" variant="zap" size="xl" className="mt-5 w-full">
        Quero contratar agora
      </Button>
      <p className="mt-3 text-center font-body text-sm text-muted-foreground">
        Mude para a conexão n°1 da região
      </p>
    </form>
  );
}
