import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getAttribution } from "@/lib/utm";
import { getRecaptchaToken } from "@/lib/recaptcha";
import { getFacebookCookies, trackLeadEvent } from "@/lib/facebook-pixel";
import { RECAPTCHA_ACTION_LEAD, submitLead } from "@/lib/submit-lead";
import { capitalizeName, isValidPhone, maskPhone } from "@/lib/form-utils";
import { isRateLimited } from "@/lib/http-errors";
import { cn } from "@/lib/utils";
import { waLink } from "@/lib/whatsapp";

/**
 * Sends the lead to the webhook/CRM + Facebook CAPI without blocking the
 * WhatsApp redirect — a slow or failing backend should never stop someone
 * from reaching out.
 */
async function submitLeadInBackground(name: string, ddi: string, phone: string) {
  try {
    // Mesma fonte que o servidor confere — ver RECAPTCHA_ACTION_LEAD.
    const recaptchaToken = await getRecaptchaToken(RECAPTCHA_ACTION_LEAD);
    const { fbc, fbp } = getFacebookCookies();
    await submitLead({
      data: {
        name,
        ddi,
        phone,
        page: window.location.pathname + window.location.search,
        recaptchaToken,
        fbc,
        fbp,
        attribution: getAttribution(),
      },
    });
  } catch (err) {
    // Envio em segundo plano: o cliente já foi levado ao WhatsApp, então aqui
    // só registramos. O 429 vem do limite por IP do servidor.
    console.error(isRateLimited(err) ? "Lead rate limited" : "Lead submission failed", err);
  }
}

export function LeadForm({ variant = "hero" }: { variant?: "hero" | "light" }) {
  const [name, setName] = useState("");
  const [ddi, setDdi] = useState("+55");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<{ name?: boolean; phone?: boolean }>({});

  const onBrand = variant === "hero";

  function submit(e: FormEvent) {
    e.preventDefault();
    const nextErrors = {
      name: name.trim().length < 3,
      phone: !isValidPhone(phone),
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
    toast.success("Show! Estamos te levando pro WhatsApp da SCNET.");
    trackLeadEvent();
    void submitLeadInBackground(name.trim(), ddi, phone);
    window.open(
      waLink(
        `Oi! Sou ${name.trim()} (${ddi} ${phone}). Quero contratar a internet da SCNET e saber a cobertura no meu endereço.`,
      ),
      "_blank",
      "noopener",
    );
  }

  const label = (hasError: boolean) =>
    cn(
      "font-ui text-sm font-semibold transition",
      hasError ? "text-red-500" : onBrand ? "text-primary-foreground/90" : "text-foreground/80",
    );
  const field = (hasError: boolean) =>
    cn(
      "placeholder-fraco w-full rounded-lg border px-4 py-3 font-body outline-none transition focus:ring-2",
      onBrand
        ? cn(
            "bg-primary-foreground/10 placeholder:text-primary-foreground",
            hasError
              ? "border-red-400 text-primary-foreground focus:border-red-500 focus:ring-red-300/40"
              : "border-primary-foreground/25 text-primary-foreground focus:border-zap focus:ring-zap/40",
          )
        : cn(
            "bg-background placeholder:text-muted-foreground",
            hasError
              ? "border-red-400 text-foreground focus:border-red-500 focus:ring-red-300/40"
              : "border-border text-foreground focus:border-brand focus:ring-brand/25",
          ),
    );

  return (
    <form
      onSubmit={submit}
      className={
        onBrand
          ? "w-full rounded-2xl border border-primary-foreground/20 bg-primary-foreground/10 p-5 shadow-2xl backdrop-blur-md sm:p-6"
          : "w-full rounded-2xl border border-border bg-card p-5 shadow-xl sm:p-6"
      }
    >
      <p
        className={
          onBrand
            ? "font-display text-xl font-extrabold text-primary-foreground"
            : "font-display text-xl font-extrabold text-brand-deep"
        }
      >
        Contrate agora
      </p>
      <div className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <label className={label(!!errors.name)} htmlFor={`nome-${variant}`}>
            Nome
          </label>
          <input
            id={`nome-${variant}`}
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
          <label className={label(!!errors.phone)} htmlFor={`tel-${variant}`}>
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
              id={`tel-${variant}`}
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
      </div>
      <Button type="submit" variant="zap" size="xl" className="mt-5 w-full">
        Quero contratar agora
      </Button>
      <p
        className={
          onBrand
            ? "mt-3 text-center font-body text-sm text-primary-foreground/80"
            : "mt-3 text-center font-body text-sm text-muted-foreground"
        }
      >
        Venha para a conexão n°1 da região
      </p>
    </form>
  );
}
