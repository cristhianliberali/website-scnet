/**
 * A tela que substitui a área do cliente quando ela está desligada no /admin.
 *
 * **Duas coisas, nesta ordem.** Primeiro a mensagem — a pessoa precisa entender
 * o que houve antes de a tela mudar debaixo dela. Depois o WhatsApp da central,
 * que é onde o problema dela de fato se resolve enquanto a área não volta.
 *
 * **O redirecionamento é automático, mas o botão existe mesmo assim.** Trocar a
 * página por conta própria falha em mais navegador do que se imagina (bloqueio
 * de redirecionamento, aba em segundo plano, extensão de privacidade), e quando
 * falha não avisa. O botão é a garantia de que ninguém fica olhando para uma
 * tela que prometeu levá-lo a algum lugar.
 */

import { useEffect, useState } from "react";
import { MessageCircle, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { dispararEvento, EVENTO, eventoWhatsapp } from "@/lib/datalayer";
import { WHATSAPP_REDIRECT_DELAY_MS, waLinkCentral } from "@/lib/whatsapp";

const MENSAGEM_WHATSAPP = "Oi! Tentei entrar na área do cliente do site e preciso de atendimento.";

export function AreaClienteDesligada({ mensagem, origem }: { mensagem: string; origem: string }) {
  const link = waLinkCentral(MENSAGEM_WHATSAPP);
  const [indo, setIndo] = useState(false);

  useEffect(() => {
    // O relatório precisa saber quantas pessoas bateram na porta fechada — é o
    // número que diz se vale a pena manter a área desligada mais um dia.
    dispararEvento(EVENTO.areaClienteDesligada, { origem });

    const id = window.setTimeout(() => {
      setIndo(true);
      eventoWhatsapp("area_cliente_desligada", { origem });
      window.location.href = link;
    }, WHATSAPP_REDIRECT_DELAY_MS);

    return () => window.clearTimeout(id);
  }, [link, origem]);

  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-center sm:py-24">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand/10 text-brand">
        <Wrench className="size-7" />
      </span>

      <h1 className="mt-5 font-display text-2xl font-extrabold text-brand-deep sm:text-3xl">
        Área do cliente em manutenção
      </h1>

      <p className="mt-3 font-body text-base text-muted-foreground">{mensagem}</p>

      <Button
        variant="whats"
        size="xl"
        className="mt-7 w-full sm:w-auto"
        asChild
        onClick={() => eventoWhatsapp("area_cliente_desligada", { origem, manual: true })}
      >
        <a href={link}>
          <MessageCircle className="size-5" />
          Falar com a central agora
        </a>
      </Button>

      <p className="mt-3 font-body text-sm text-muted-foreground">
        {indo ? "Abrindo o WhatsApp..." : "Estamos te levando para o WhatsApp da central."}
      </p>
    </div>
  );
}
