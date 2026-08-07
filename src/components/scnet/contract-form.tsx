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

  const field =
    "w-full rounded-lg border border-border bg-muted/40 px-4 py-3 font-body text-foreground placeholder:text-muted-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/30";
  const label = "font-ui text-sm font-semibold text-brand-deep";

  function submit(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 3) {
      toast.error("Escreve teu nome completo pra gente te chamar direito 🙂");
      return;
    }
    if (!isValidPhone(phone)) {
      toast.error("Confere o telefone: DDD + 8 ou 9 dígitos.");
      return;
    }
    if (!intent) {
      toast.error("Escolha uma opção: Quero contratar ou Já sou cliente.");
      return;
    }

    const trimmedName = name.trim();
    const whatsapp = `${ddi}${phone.replace(/\D/g, "")}`;

    trackLeadEvent();
    void submitContractInBackground({
      name: trimmedName,
      ddi,
      phone,
      intent,
      plan: selectedPlan ?? undefined,
    });

    const handoff = {
      nome: trimmedName,
      whatsapp,
      intencao: intent,
      ...(selectedPlan ? { plano: selectedPlan.name, preco: selectedPlan.price } : {}),
    };
    writeContractHandoffCookie(handoff);

    void navigate({ to: "/contratacao", search: handoff });
  }

  return (
    <form
      id="contrate"
      onSubmit={submit}
      className="w-full scroll-mt-28 rounded-2xl border border-primary-foreground/20 bg-primary-foreground/10 p-5 shadow-2xl backdrop-blur-md sm:p-6"
    >
      {selectedPlan && (
        <div className="mb-4 rounded-xl border border-zap/40 bg-zap/15 px-4 py-3 font-ui text-sm font-semibold text-primary-foreground">
          Plano desejado: <span className="text-zap">{selectedPlan.name}</span> — R${" "}
          {selectedPlan.price}/mês
        </div>
      )}
      <p className="font-display text-xl font-extrabold text-primary-foreground">Contrate agora</p>
      <div className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <label className={label} htmlFor="nome-contrate">
            Nome
          </label>
          <input
            id="nome-contrate"
            className={field}
            value={name}
            onChange={(e) => setName(capitalizeName(e.target.value))}
            placeholder="Maria Silva"
            autoComplete="name"
          />
        </div>
        <div className="space-y-1.5">
          <label className={label} htmlFor="tel-contrate">
            Telefone / WhatsApp
          </label>
          <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
            <input
              aria-label="DDI"
              className={field + " text-center"}
              value={ddi}
              onChange={(e) => setDdi("+" + e.target.value.replace(/\D/g, "").slice(0, 3))}
            />
            <input
              id="tel-contrate"
              className={field}
              value={phone}
              inputMode="tel"
              onChange={(e) => setPhone(maskPhone(e.target.value))}
              placeholder="(49) 99999-9999"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <span className={label}>O que você precisa?</span>
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
                onClick={() => setIntent(value)}
                className={cn(
                  "rounded-md border px-3 py-2 font-ui text-xs font-medium transition",
                  intent === value
                    ? "border-primary-foreground/60 bg-primary-foreground/15 text-primary-foreground"
                    : "border-primary-foreground/20 bg-primary-foreground/5 text-primary-foreground/70 hover:border-primary-foreground/40 hover:bg-primary-foreground/10",
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
      <p className="mt-3 text-center font-body text-sm text-primary-foreground/80">
        Venha para a conexão n°1 da região
      </p>
    </form>
  );
}
