/**
 * O liga/desliga da área de membros.
 *
 * **Para que serve.** Quando o n8n cai, o cadastro está em migração ou o
 * sistema está em manutenção, a área do cliente responde erro para todo mundo —
 * e erro genérico faz o cliente desistir. Desligada, ela dá lugar a uma
 * mensagem sua e leva a pessoa ao WhatsApp da central, que resolve o caso na
 * hora. É o mesmo espírito do interruptor do anti-robô: quem está atendendo
 * precisa conseguir agir sem depender de deploy.
 *
 * **O alcance é a área inteira**, não uma tela: o login, o painel, e também o
 * "Já sou cliente" do formulário de contratação, que passa a mandar para o
 * WhatsApp em vez de mandar para um login que não vai funcionar.
 */

import { useState, type FormEvent } from "react";
import { DoorClosed, DoorOpen } from "lucide-react";

import type { ConfigAreaCliente } from "@/lib/admin-tipos";
import { WHATSAPP_CENTRAL } from "@/lib/whatsapp";
import { BotaoSalvar, Cartao, MarcaAdmin, TextoLongoAdmin, TituloBloco } from "./admin-ui";

export function SecaoAreaCliente({
  config,
  salvando,
  aoSalvar,
}: {
  config: ConfigAreaCliente;
  salvando: boolean;
  aoSalvar: (config: ConfigAreaCliente) => void;
}) {
  const [rascunho, setRascunho] = useState<ConfigAreaCliente>(config);

  function submeter(e: FormEvent) {
    e.preventDefault();
    aoSalvar(rascunho);
  }

  return (
    <div className="space-y-4">
      <TituloBloco>Área do cliente</TituloBloco>

      <div
        className={`flex gap-3 rounded-xl border p-4 ${
          config.ativa
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        {config.ativa ? (
          <DoorOpen className="mt-0.5 size-5 shrink-0" />
        ) : (
          <DoorClosed className="mt-0.5 size-5 shrink-0" />
        )}
        <div className="min-w-0">
          <p className="font-ui text-sm font-bold">
            {config.ativa ? "No ar" : "DESLIGADA — ninguém entra agora"}
          </p>
          <p className="mt-1 font-body text-xs">
            {config.ativa
              ? "Login e painel funcionando normalmente, e o “Já sou cliente” do formulário leva ao login."
              : `Login e painel substituídos pela mensagem abaixo, e quem tentar entrar é levado ao WhatsApp ${WHATSAPP_CENTRAL}. O "Já sou cliente" do formulário de contratação vai para o mesmo lugar.`}
          </p>
        </div>
      </div>

      <Cartao>
        <form onSubmit={submeter} className="space-y-3">
          <MarcaAdmin
            rotulo="Área do cliente ligada"
            marcado={rascunho.ativa}
            aoMudar={(v) => setRascunho({ ...rascunho, ativa: v })}
            dica="Desmarque durante uma manutenção. Vale na hora, sem deploy e sem reiniciar nada."
          />

          <TextoLongoAdmin
            rotulo="Mensagem exibida quando estiver desligada"
            valor={rascunho.mensagem}
            aoMudar={(v) => setRascunho({ ...rascunho, mensagem: v })}
            rows={3}
            dica="Diga o que houve e que a central resolve. É o que a pessoa lê antes de ir para o WhatsApp."
          />

          <p className="font-body text-xs text-muted-foreground">
            O número da central vem da variável <code>VITE_WHATSAPP_NUMBER_CENTRAL</code>. Hoje ela
            aponta para <strong>{WHATSAPP_CENTRAL}</strong>.
          </p>

          <BotaoSalvar salvando={salvando} rotulo="Salvar área do cliente" />
        </form>
      </Cartao>
    </div>
  );
}
