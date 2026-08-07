import { createServerFn } from "@tanstack/react-start";
import { createHash } from "node:crypto";
import { z } from "zod";

const leadInputSchema = z.object({
  name: z.string().min(1),
  ddi: z.string().min(1),
  phone: z.string().min(1),
  page: z.string(),
  recaptchaToken: z.string().optional(),
  fbc: z.string().optional(),
  fbp: z.string().optional(),
  attribution: z.record(z.string().optional()).optional(),
});

type LeadInput = z.infer<typeof leadInputSchema>;

type RecaptchaResult = { success: boolean; score?: number; action?: string } | null;

async function verifyRecaptcha(token: string | undefined): Promise<RecaptchaResult> {
  const secret = process.env["RECAPTCHA_SECRET_KEY"];
  if (!secret || !token) return null;
  try {
    const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token }),
    });
    return (await res.json()) as RecaptchaResult;
  } catch (err) {
    console.error("reCAPTCHA verification failed", err);
    return null;
  }
}

function sha256(value: string) {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

async function sendWebhook(payload: unknown) {
  const url = process.env["WEBHOOK_URL"];
  if (!url) return;
  const token = process.env["WEBHOOK_TOKEN"];
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.error(`Lead webhook responded ${res.status}`);
  } catch (err) {
    console.error("Lead webhook request failed", err);
  }
}

async function sendFacebookCapiEvent(input: LeadInput) {
  const pixelId = import.meta.env["VITE_FACEBOOK_PIXEL_ID"] as string | undefined;
  const accessToken = process.env["FACEBOOK_CAPI_ACCESS_TOKEN"];
  if (!pixelId || !accessToken) return;

  const digits = `${input.ddi}${input.phone}`.replace(/\D/g, "");
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${pixelId}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        access_token: accessToken,
        data: [
          {
            event_name: "Lead",
            event_time: Math.floor(Date.now() / 1000),
            action_source: "website",
            event_source_url: input.page,
            user_data: {
              ph: digits ? [sha256(digits)] : undefined,
              fbc: input.fbc,
              fbp: input.fbp,
            },
          },
        ],
      }),
    });
    if (!res.ok) console.error(`Facebook CAPI responded ${res.status}`);
  } catch (err) {
    console.error("Facebook CAPI request failed", err);
  }
}

/**
 * Verifies reCAPTCHA (when configured), then forwards the lead to the n8n
 * webhook and Facebook Conversions API in parallel. Any step is skipped
 * silently when its env vars aren't set, and failures are logged, never
 * thrown — the client never waits on this to send the user to WhatsApp.
 */
export const submitLead = createServerFn({ method: "POST" })
  .validator(leadInputSchema)
  .handler(async ({ data }) => {
    const recaptcha = await verifyRecaptcha(data.recaptchaToken);
    const isLikelyBot =
      recaptcha != null && (recaptcha.success === false || (recaptcha.score ?? 1) < 0.3);
    if (isLikelyBot) return { ok: false, reason: "recaptcha" as const };

    const payload = {
      name: data.name,
      ddi: data.ddi,
      phone: data.phone,
      page: data.page,
      submitted_at: new Date().toISOString(),
      attribution: data.attribution ?? {},
      recaptcha_score: recaptcha?.score ?? null,
    };

    await Promise.all([sendWebhook(payload), sendFacebookCapiEvent(data)]);
    return { ok: true };
  });
