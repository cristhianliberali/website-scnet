import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getAttribution } from "@/lib/utm";
import { getRecaptchaToken } from "@/lib/recaptcha";
import { getFacebookCookies, trackLeadEvent } from "@/lib/facebook-pixel";
import { submitLead } from "@/lib/submit-lead";
import { waLink } from "./shared";

function capitalize(v: string) {
  return v
    .replace(/[^A-Za-zÀ-ÿ\s']/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/(^|\s)([a-zà-ÿ])/g, (_m, s, c: string) => s + c.toUpperCase());
}

/**
 * Sends the lead to the webhook/CRM + Facebook CAPI without blocking the
 * WhatsApp redirect — a slow or failing backend should never stop someone
 * from reaching out.
 */
async function submitLeadInBackground(name: string, ddi: string, phone: string) {
  try {
    const recaptchaToken = await getRecaptchaToken("lead_submit");
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
    console.error("Lead submission failed", err);
  }
}

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function LeadForm({ variant = "hero" }: { variant?: "hero" | "light" }) {
  const [name, setName] = useState("");
  const [ddi, setDdi] = useState("+55");
  const [phone, setPhone] = useState("");

  const onBrand = variant === "hero";

  function submit(e: FormEvent) {
    e.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (name.trim().length < 3) {
      toast.error("Escreve teu nome completo pra gente te chamar direito 🙂");
      return;
    }
    if (!/^\d{2}9?\d{8}$/.test(digits)) {
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

  const label = onBrand
    ? "font-ui text-sm font-semibold text-primary-foreground/90"
    : "font-ui text-sm font-semibold text-foreground/80";
  const field = onBrand
    ? "w-full rounded-lg border border-primary-foreground/25 bg-primary-foreground/10 px-4 py-3 font-body text-primary-foreground placeholder:text-primary-foreground/50 outline-none backdrop-blur transition focus:border-zap focus:ring-2 focus:ring-zap/40"
    : "w-full rounded-lg border border-border bg-background px-4 py-3 font-body text-foreground outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25";

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
          <label className={label} htmlFor={`nome-${variant}`}>
            Nome
          </label>
          <input
            id={`nome-${variant}`}
            className={field}
            value={name}
            onChange={(e) => setName(capitalize(e.target.value))}
            placeholder="Maria Silva"
            autoComplete="name"
          />
        </div>
        <div className="space-y-1.5">
          <label className={label} htmlFor={`tel-${variant}`}>
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
              id={`tel-${variant}`}
              className={field}
              value={phone}
              inputMode="tel"
              onChange={(e) => setPhone(maskPhone(e.target.value))}
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
