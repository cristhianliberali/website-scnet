/**
 * Envios do site: tudo que foi preenchido na home e na `/contratacao`.
 *
 * É uma tela de LEITURA, e isso é uma decisão, não uma falta. As outras abas do
 * /admin editam o que o provedor controla — preço de plano, status de
 * atendimento. Aqui o conteúdo é o que a pessoa digitou, e registro que alguém
 * corrige deixa de ser registro: no dia em que um lead for contestado, o valor
 * desta tabela é ela nunca ter sido editada.
 *
 * A contratação aparece como UMA linha que cresce. Quem parou na etapa 2 está
 * aqui com o nome, o telefone e "Etapa 2 de 4" — e é essa a linha que vale uma
 * ligação, porque é gente que quis contratar e travou no meio.
 */

import { useMemo, useState } from "react";
import { Download, Search } from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { data as formatarData, telefone as formatarTelefone } from "@/lib/painel-formato";
import { LIMITES } from "@/lib/form-limits";
import {
  ROTULO_CAMPO_ANEXO,
  ROTULO_FORMULARIO_ENVIO,
  STATUS_ENVIO,
  type AnexoResumo,
  type EnvioAdmin,
  type FormularioEnvio,
} from "@/lib/envios-tipos";
import { LinhaExpansivel, SelecaoAdmin, SeloAdmin, TituloBloco, Vazio } from "./admin-ui";

const OPCOES_FILTRO = [
  ["todos", "Todos os formulários"],
  ["contratacao", ROTULO_FORMULARIO_ENVIO.contratacao],
  ["lead", ROTULO_FORMULARIO_ENVIO.lead],
] as const;

/**
 * O tom do selo conta a história em uma olhada: verde é contratação completa,
 * cinza é envio que o CRM não aceitou, âmbar é o que está no meio do caminho —
 * que é exatamente a lista que alguém deveria estar ligando.
 */
function seloDoEnvio(envio: EnvioAdmin): { texto: string; tom: "aberto" | "ok" | "off" } {
  if (envio.statusEnvio === "webhook_erro") {
    return { texto: STATUS_ENVIO.webhook_erro, tom: "off" };
  }
  if (envio.concluido) return { texto: "Completo", tom: "ok" };
  return { texto: `Etapa ${envio.etapa} de ${envio.totalEtapas}`, tom: "aberto" };
}

const tamanhoLegivel = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;

export function SecaoEnvios({
  envios,
  aoBaixarAnexo,
}: {
  envios: EnvioAdmin[];
  /** Busca o arquivo no servidor. `null` quando ele não está mais no banco. */
  aoBaixarAnexo: (
    id: string,
    campo: string,
  ) => Promise<{ nome: string; tipo: string; base64: string } | null>;
}) {
  const [filtro, setFiltro] = useState<FormularioEnvio | "todos">("todos");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);

  /*
   * Filtro em memória, como nas outras abas: a lista inteira (o servidor corta
   * em 300) já veio na abertura da tela, então a busca responde no mesmo quadro
   * em que a tecla é digitada, sem uma ida ao servidor por letra.
   */
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    // dígitos soltos: quem procura por telefone digita "49999" sem parênteses
    const digitos = termo.replace(/\D/g, "");
    return envios.filter((e) => {
      if (filtro !== "todos" && e.formulario !== filtro) return false;
      if (!termo) return true;
      if (digitos && e.telefone.replace(/\D/g, "").includes(digitos)) return true;
      return [e.nome, e.plano, e.etapaId, e.dados].join(" ").toLowerCase().includes(termo);
    });
  }, [envios, filtro, busca]);

  return (
    <div className="space-y-3">
      <TituloBloco>Envios do site</TituloBloco>

      <p className="font-body text-xs text-muted-foreground">
        Cada envio dos formulários da home e da contratação, do mais novo para o mais velho. A
        contratação é uma linha só, que se completa conforme a pessoa avança pelas etapas — quem
        parou no meio fica aqui com o que já tinha preenchido.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <SelecaoAdmin
          rotulo="Formulário"
          valor={filtro}
          opcoes={OPCOES_FILTRO}
          aoMudar={setFiltro}
          className="w-56"
        />
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome, telefone, plano, endereço…"
            maxLength={LIMITES.busca}
            className="pl-9"
          />
        </div>
        <p className="font-body text-xs text-muted-foreground">
          {visiveis.length} de {envios.length}
        </p>
      </div>

      {visiveis.length === 0 ? (
        <Vazio texto="Nenhum envio com esse filtro. Se a lista está sempre vazia, rode docs/n8n/schema-envios.sql no banco do site." />
      ) : (
        <div className="space-y-2">
          {visiveis.map((envio) => {
            const selo = seloDoEnvio(envio);
            return (
              <LinhaExpansivel
                key={envio.id}
                aberto={aberto === envio.id}
                aoAlternar={() => setAberto(aberto === envio.id ? null : envio.id)}
                resumo={
                  <>
                    <span className="min-w-0">
                      <span className="block font-ui text-sm font-bold text-foreground">
                        {envio.nome || "sem nome"}
                        {envio.telefone && (
                          <span className="font-normal text-muted-foreground">
                            {" · "}
                            {formatarTelefone(envio.telefone)}
                          </span>
                        )}
                      </span>
                      <span className="block font-body text-xs text-muted-foreground">
                        {formatarData(envio.data.slice(0, 10))} ·{" "}
                        {ROTULO_FORMULARIO_ENVIO[envio.formulario]}
                        {envio.plano && ` · ${envio.plano}`}
                        {envio.anexos.length > 0 && ` · ${envio.anexos.length} anexo(s)`}
                      </span>
                    </span>
                    <SeloAdmin texto={selo.texto} tom={selo.tom} />
                  </>
                }
              >
                {aberto === envio.id && <Detalhe envio={envio} aoBaixarAnexo={aoBaixarAnexo} />}
              </LinhaExpansivel>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Detalhe({
  envio,
  aoBaixarAnexo,
}: {
  envio: EnvioAdmin;
  aoBaixarAnexo: (
    id: string,
    campo: string,
  ) => Promise<{ nome: string; tipo: string; base64: string } | null>;
}) {
  return (
    <div className="space-y-3">
      <dl className="grid gap-x-6 gap-y-1 rounded-lg bg-secondary/50 p-3 font-body text-xs sm:grid-cols-2">
        <Linha rotulo="Formulário" valor={ROTULO_FORMULARIO_ENVIO[envio.formulario]} />
        <Linha rotulo="Situação no CRM" valor={STATUS_ENVIO[envio.statusEnvio]} />
        <Linha rotulo="Primeiro envio" valor={envio.data.replace("T", " ").slice(0, 16)} />
        <Linha
          rotulo="Última atualização"
          valor={envio.atualizadoEm.replace("T", " ").slice(0, 16)}
        />
        <Linha
          rotulo="Etapa"
          valor={
            envio.concluido
              ? `concluída (${envio.etapa} de ${envio.totalEtapas})`
              : `${envio.etapa} de ${envio.totalEtapas}${envio.etapaId ? ` — ${envio.etapaId}` : ""}`
          }
        />
        <Linha rotulo="Plano" valor={envio.plano || "—"} />
      </dl>

      {envio.anexos.length > 0 && (
        <div className="space-y-2">
          <p className="font-ui text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Anexos
          </p>
          {envio.anexos.map((anexo) => (
            <BotaoAnexo
              key={anexo.campo}
              anexo={anexo}
              aoBaixar={() => aoBaixarAnexo(envio.id, anexo.campo)}
            />
          ))}
        </div>
      )}

      <div>
        <p className="font-ui text-xs font-bold uppercase tracking-wide text-muted-foreground">
          O formulário como foi preenchido
        </p>
        <pre className="mt-2 max-h-96 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-200">
          {envio.dados}
        </pre>
      </div>
    </div>
  );
}

/**
 * Baixa um anexo.
 *
 * O arquivo não fica na lista: ele é buscado no clique, um de cada vez. É o que
 * permite a tela abrir com trezentos envios sem carregar um único documento —
 * ver a lista e ver um documento são coisas diferentes, e só a segunda precisa
 * dos megabytes.
 */
function BotaoAnexo({ anexo, aoBaixar }: { anexo: AnexoResumo; aoBaixar: () => Promise<unknown> }) {
  const [baixando, setBaixando] = useState(false);

  async function baixar() {
    if (baixando) return;
    setBaixando(true);
    try {
      const arquivo = (await aoBaixar()) as { nome: string; tipo: string; base64: string } | null;
      if (!arquivo) {
        toast.error("O arquivo não está mais no banco. A ficha dele continua aqui.");
        return;
      }
      const link = document.createElement("a");
      link.href = `data:${arquivo.tipo};base64,${arquivo.base64}`;
      link.download = arquivo.nome;
      link.click();
    } catch {
      toast.error("Não foi possível baixar o arquivo.");
    } finally {
      setBaixando(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void baixar()}
      disabled={baixando}
      className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-2.5 text-left transition hover:border-brand/50 disabled:opacity-60"
    >
      <Download className="size-4 shrink-0 text-brand" />
      <span className="min-w-0 flex-1">
        <span className="block font-ui text-xs font-bold text-foreground">
          {ROTULO_CAMPO_ANEXO[anexo.campo] ?? anexo.campo}
        </span>
        <span className="block truncate font-body text-[11px] text-muted-foreground">
          {anexo.nome} · {tamanhoLegivel(anexo.tamanho)}
        </span>
      </span>
      <span className="font-ui text-[11px] font-bold text-brand">
        {baixando ? "abrindo…" : "baixar"}
      </span>
    </button>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="inline text-muted-foreground">{rotulo}: </dt>
      <dd className="inline font-semibold text-foreground">{valor}</dd>
    </div>
  );
}
