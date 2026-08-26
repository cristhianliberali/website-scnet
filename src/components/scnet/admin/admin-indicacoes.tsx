/**
 * As indicações e o bônus de cada uma.
 *
 * **O bônus é por linha, não por regra global.** Cada indicação nasce com o
 * carimbo da campanha que estava valendo no dia do envio — nome, tipo de bônus,
 * condição e valor. Mudar a campanha vigente (na aba "Indicação") muda o que as
 * próximas vão valer e não toca em nenhuma que já existe; é isso que faz o
 * extrato do cliente continuar verdadeiro depois da terceira campanha do ano.
 *
 * Aqui dá para corrigir o carimbo de uma linha específica — o caso de "essa
 * entrou na campanha errada" —, sem que a correção vaze para as outras.
 */

import { useMemo, useState, type FormEvent } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { data as formatarData, telefone as formatarTelefone } from "@/lib/painel-formato";
import { LIMITE, LIMITE_ADMIN } from "@/lib/form-limits";
import {
  STATUS_INDICACAO_ADMIN,
  TIPOS_BONUS,
  type IndicacaoAdmin,
  type StatusIndicacaoAdmin,
  type TipoBonus,
} from "@/lib/admin-tipos";
import {
  BotaoPerigo,
  BotaoSalvar,
  LinhaExpansivel,
  SelecaoAdmin,
  SeloAdmin,
  TextoAdmin,
  TextoLongoAdmin,
  TituloBloco,
  Vazio,
} from "./admin-ui";

const OPCOES_STATUS = [
  ["em_aberto", STATUS_INDICACAO_ADMIN.em_aberto],
  ["concluido", STATUS_INDICACAO_ADMIN.concluido],
  ["sem_sucesso", STATUS_INDICACAO_ADMIN.sem_sucesso],
  ["dados_invalidos", STATUS_INDICACAO_ADMIN.dados_invalidos],
] as const satisfies readonly (readonly [StatusIndicacaoAdmin, string])[];

const OPCOES_FILTRO = [["todos", "Todos os status"], ...OPCOES_STATUS] as const;

export const OPCOES_BONUS = [
  ["", "Sem bônus definido"],
  ["desconto_fatura", TIPOS_BONUS.desconto_fatura],
  ["premio", TIPOS_BONUS.premio],
  ["pix", TIPOS_BONUS.pix],
] as const satisfies readonly (readonly [TipoBonus, string])[];

const tomDoStatus = (status: StatusIndicacaoAdmin) =>
  status === "concluido" ? "ok" : status === "em_aberto" ? "aberto" : "off";

export function SecaoIndicacoes({
  indicacoes,
  salvando,
  aoSalvar,
  aoExcluir,
}: {
  indicacoes: IndicacaoAdmin[];
  salvando: boolean;
  aoSalvar: (indicacao: IndicacaoAdmin) => void;
  aoExcluir: (id: string) => void;
}) {
  const [filtro, setFiltro] = useState<StatusIndicacaoAdmin | "todos">("todos");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<IndicacaoAdmin | null>(null);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return indicacoes.filter((i) => {
      if (filtro !== "todos" && i.status !== filtro) return false;
      if (!termo) return true;
      return [
        i.protocolo,
        i.nomeIndicacao,
        i.nomeCliente,
        i.telefoneIndicacao,
        i.cidade,
        i.campanha,
      ]
        .join(" ")
        .toLowerCase()
        .includes(termo);
    });
  }, [indicacoes, filtro, busca]);

  return (
    <div className="space-y-3">
      <TituloBloco>Indicações</TituloBloco>

      <div className="flex flex-wrap items-end gap-3">
        <SelecaoAdmin
          rotulo="Status"
          valor={filtro}
          opcoes={OPCOES_FILTRO}
          aoMudar={setFiltro}
          className="w-48"
        />
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Protocolo, indicado, quem indicou, campanha…"
            maxLength={LIMITE.busca}
            className="pl-9"
          />
        </div>
        <p className="font-body text-xs text-muted-foreground">
          {visiveis.length} de {indicacoes.length}
        </p>
      </div>

      {visiveis.length === 0 ? (
        <Vazio texto="Nenhuma indicação com esse filtro." />
      ) : (
        <div className="space-y-2">
          {visiveis.map((i) => (
            <LinhaExpansivel
              key={i.id}
              aberto={aberto === i.id}
              aoAlternar={() => {
                if (aberto === i.id) {
                  setAberto(null);
                  return;
                }
                setAberto(i.id);
                setRascunho(i);
              }}
              resumo={
                <>
                  <span className="min-w-0">
                    <span className="block font-ui text-sm font-bold text-foreground">
                      {i.nomeIndicacao}
                    </span>
                    <span className="block font-body text-xs text-muted-foreground">
                      {i.protocolo} · indicado por {i.nomeCliente || i.idCliente} ·{" "}
                      {formatarTelefone(i.telefoneIndicacao)}
                      {i.cidade && ` · ${i.cidade}`} · {formatarData(i.data.slice(0, 10))}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {i.campanha && <SeloAdmin texto={i.campanha} tom="off" />}
                    <SeloAdmin
                      texto={STATUS_INDICACAO_ADMIN[i.status]}
                      tom={tomDoStatus(i.status)}
                    />
                  </span>
                </>
              }
            >
              {rascunho && rascunho.id === i.id && (
                <Editor
                  rascunho={rascunho}
                  aoMudar={setRascunho}
                  salvando={salvando}
                  aoSalvar={aoSalvar}
                  aoCancelar={() => setAberto(null)}
                  aoExcluir={() => aoExcluir(i.id)}
                />
              )}
            </LinhaExpansivel>
          ))}
        </div>
      )}
    </div>
  );
}

function Editor({
  rascunho,
  aoMudar,
  salvando,
  aoSalvar,
  aoCancelar,
  aoExcluir,
}: {
  rascunho: IndicacaoAdmin;
  aoMudar: (i: IndicacaoAdmin) => void;
  salvando: boolean;
  aoSalvar: (i: IndicacaoAdmin) => void;
  aoCancelar: () => void;
  aoExcluir: () => void;
}) {
  const campo = <K extends keyof IndicacaoAdmin>(chave: K, valor: IndicacaoAdmin[K]) =>
    aoMudar({ ...rascunho, [chave]: valor });

  function submeter(e: FormEvent) {
    e.preventDefault();
    aoSalvar(rascunho);
  }

  const emDinheiro = rascunho.tipoBonus === "pix" || rascunho.tipoBonus === "desconto_fatura";

  return (
    <form onSubmit={submeter} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <TextoAdmin
          rotulo="Nome da indicação"
          valor={rascunho.nomeIndicacao}
          aoMudar={(v) => campo("nomeIndicacao", v)}
          maxLength={LIMITE_ADMIN.indicacao.nome}
        />
        <TextoAdmin
          rotulo="WhatsApp"
          valor={rascunho.telefoneIndicacao}
          aoMudar={(v) => campo("telefoneIndicacao", v)}
          dica="Com DDI: 5549999998888"
          maxLength={LIMITE_ADMIN.indicacao.telefone}
        />
        <TextoAdmin
          rotulo="Cidade"
          valor={rascunho.cidade}
          aoMudar={(v) => campo("cidade", v)}
          maxLength={LIMITE_ADMIN.indicacao.cidade}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <SelecaoAdmin
          rotulo="Status"
          valor={rascunho.status}
          opcoes={OPCOES_STATUS}
          aoMudar={(v) => campo("status", v)}
        />
        <TextoAdmin
          rotulo="Código do novo cliente"
          valor={rascunho.codNovoCliente}
          aoMudar={(v) => campo("codNovoCliente", v)}
          dica="Precisa existir no cadastro."
          maxLength={LIMITE_ADMIN.indicacao.codigo}
        />
        <TextoAdmin
          rotulo="Contrato do novo cliente"
          valor={rascunho.codContratoNovoCliente}
          aoMudar={(v) => campo("codContratoNovoCliente", v)}
          dica="Precisa existir em contratos_web."
          maxLength={LIMITE_ADMIN.indicacao.codigo}
        />
      </div>

      <div className="rounded-lg border border-dashed border-border bg-secondary/40 p-3">
        <p className="mb-2 font-ui text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Bônus desta indicação
        </p>
        <p className="mb-3 font-body text-xs text-muted-foreground">
          Foi carimbado pela campanha vigente no dia do envio. Mexer aqui muda só esta linha.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <TextoAdmin
            rotulo="Campanha"
            valor={rascunho.campanha}
            aoMudar={(v) => campo("campanha", v)}
            maxLength={LIMITE_ADMIN.indicacao.campanha}
          />
          <SelecaoAdmin
            rotulo="Tipo de pagamento"
            valor={rascunho.tipoBonus}
            opcoes={OPCOES_BONUS}
            aoMudar={(v) => campo("tipoBonus", v)}
          />
          <TextoAdmin
            rotulo="Valor"
            valor={rascunho.valorIndicacao}
            aoMudar={(v) => campo("valorIndicacao", v)}
            maxLength={LIMITE_ADMIN.indicacao.valor}
            dica={
              emDinheiro
                ? "Em reais: 50,00"
                : "Só vale para PIX e desconto — o banco recusa valor em prêmio."
            }
            disabled={!emDinheiro}
          />
        </div>
        <TextoLongoAdmin
          rotulo="Condição / descrição do bônus"
          valor={rascunho.descricaoBonus}
          aoMudar={(v) => campo("descricaoBonus", v)}
          rows={2}
          maxLength={LIMITE_ADMIN.indicacao.descricaoBonus}
          className="mt-3"
          dica="É o texto que o cliente lê no extrato dele."
        />
      </div>

      <TextoLongoAdmin
        rotulo="Observações"
        valor={rascunho.observacoes}
        aoMudar={(v) => campo("observacoes", v)}
        rows={2}
        maxLength={LIMITE_ADMIN.indicacao.observacoes}
      />

      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
        <BotaoPerigo
          rotulo="Excluir"
          confirmacao="Excluir mesmo?"
          aoConfirmar={aoExcluir}
          desabilitado={salvando}
        />
        <Button type="button" size="sm" variant="outline" onClick={aoCancelar} disabled={salvando}>
          Cancelar
        </Button>
        <BotaoSalvar salvando={salvando} rotulo="Salvar indicação" />
      </div>
    </form>
  );
}
