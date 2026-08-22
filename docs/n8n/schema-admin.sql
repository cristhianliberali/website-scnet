-- ---------------------------------------------------------------------------
-- O que o painel super admin (/admin) precisa no banco.
-- ---------------------------------------------------------------------------
--
-- Roda depois de `schema.sql`, `schema-painel.sql` e
-- `schema-upgrade-indicacoes.sql`. Duas coisas acontecem aqui:
--
--   1. `web_formularios` deixa de ser um registro morto e vira a fila de
--      atendimento: ganha protocolo, status e as colunas que um humano mexe.
--   2. Nasce `web_config`, onde ficam os ajustes que o admin edita sem deploy —
--      hoje, os da seção de indicação.
--
-- Tudo é idempotente: rodar duas vezes não quebra nada e não duplica dado.
--
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. O status da solicitação
-- ---------------------------------------------------------------------------
--
-- Três estados, e só. "Em aberto" é tudo que ainda não terminou — quem quiser
-- distinguir "em análise" de "agendado" tem o campo de observação e a data da
-- visita para isso. Um enum curto é o que um humano consegue manter certo.
--
-- `CREATE TYPE` não aceita `IF NOT EXISTS`, daí o bloco.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_solicitacao') THEN
    CREATE TYPE public.status_solicitacao AS ENUM ('em_aberto', 'cancelado', 'concluido');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. A fila de atendimento
-- ---------------------------------------------------------------------------
--
-- A tabela pode já existir (o `schema.sql` a cria para o n8n gravar o que o
-- painel envia). Se existir, ela só ganha colunas; se não, nasce aqui.
--
-- A mudança de fundo é de papel: antes isto era um log — ninguém lia. Agora é
-- o que o cliente vê em "Atendimentos" e o que o admin resolve em /admin. Por
-- isso o protocolo e o status: um pedido sem número é um pedido que o cliente
-- não consegue cobrar, e um pedido sem estado é um que ninguém sabe se acabou.

CREATE TABLE IF NOT EXISTS public.web_formularios (
  id         bigserial   PRIMARY KEY,
  id_cliente text        NOT NULL,
  formulario text        NOT NULL,
  campos     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.web_formularios
  -- o número que o cliente cita ao cobrar; único, e gerado pelo banco
  ADD COLUMN IF NOT EXISTS protocolo          varchar(30),
  ADD COLUMN IF NOT EXISTS status             public.status_solicitacao
                                              NOT NULL DEFAULT 'em_aberto',
  -- o que aparece como título do atendimento na tela do cliente
  ADD COLUMN IF NOT EXISTS assunto            varchar(180),
  ADD COLUMN IF NOT EXISTS categoria          varchar(120),
  ADD COLUMN IF NOT EXISTS descricao          text,
  -- de qual contrato é o pedido, quando o formulário diz
  ADD COLUMN IF NOT EXISTS cod_contrato       text,
  -- data combinada da visita, quando houver
  ADD COLUMN IF NOT EXISTS agendado_para      date,
  -- anotação de quem atende; NÃO vai para a tela do cliente
  ADD COLUMN IF NOT EXISTS observacao_interna text,
  ADD COLUMN IF NOT EXISTS atualizado_em      timestamptz NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------------
-- 3. O protocolo automático
-- ---------------------------------------------------------------------------
--
-- Mesma escolha das indicações: quem gera é o banco. Deixar cada fluxo inventar
-- o seu é onde nascem as duplicidades — dois `INSERT` no mesmo segundo geram o
-- mesmo número e o segundo estoura. Quem grava pode simplesmente não mandar a
-- coluna.
--
-- O formato é `SOL-AAAAMM-000123`: legível ao telefone e ordenável por mês.

CREATE SEQUENCE IF NOT EXISTS public.web_formularios_protocolo_seq;

CREATE OR REPLACE FUNCTION public.proximo_protocolo_solicitacao()
RETURNS varchar
LANGUAGE sql
VOLATILE
AS $$
  SELECT 'SOL-' || to_char(now(), 'YYYYMM') || '-' ||
         lpad(nextval('public.web_formularios_protocolo_seq')::text, 6, '0');
$$;

ALTER TABLE public.web_formularios
  ALTER COLUMN protocolo SET DEFAULT public.proximo_protocolo_solicitacao();

-- As linhas que já estavam na tabela não têm protocolo. Elas ganham um agora,
-- pela mesma função, para a coluna poder ser obrigatória e única.
UPDATE public.web_formularios
   SET protocolo = public.proximo_protocolo_solicitacao()
 WHERE protocolo IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'web_formularios_protocolo_key'
  ) THEN
    ALTER TABLE public.web_formularios
      ADD CONSTRAINT web_formularios_protocolo_key UNIQUE (protocolo);
  END IF;
END $$;

ALTER TABLE public.web_formularios
  ALTER COLUMN protocolo SET NOT NULL;

-- `atualizado_em` que se atualiza sozinho. A função é a mesma que as indicações
-- usam; o `CREATE OR REPLACE` aqui a cria caso este arquivo rode antes daquele.
CREATE OR REPLACE FUNCTION public.tocar_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS web_formularios_atualizado_em ON public.web_formularios;
CREATE TRIGGER web_formularios_atualizado_em
  BEFORE UPDATE ON public.web_formularios
  FOR EACH ROW EXECUTE FUNCTION public.tocar_atualizado_em();

-- A tela do cliente pede "os atendimentos DESTE cliente, do mais novo para o
-- mais velho"; o admin pede "a fila inteira, o que está em aberto primeiro".
CREATE INDEX IF NOT EXISTS web_formularios_cliente_idx
  ON public.web_formularios (id_cliente, criado_em DESC);

CREATE INDEX IF NOT EXISTS web_formularios_status_idx
  ON public.web_formularios (status, criado_em DESC);

-- ---------------------------------------------------------------------------
-- 4. A campanha de cada indicação
-- ---------------------------------------------------------------------------
--
-- O bônus não é uma regra fixa do provedor: ele muda de campanha para campanha,
-- e o mesmo cliente participa de várias ao longo do ano. O que vale para uma
-- indicação é **a campanha do dia em que ela foi enviada** — mudar a campanha
-- de hoje não pode reescrever o que foi prometido em março.
--
-- Por isso o bônus já mora na linha da indicação (`tipo_bonus`,
-- `descricao_bonus`, `valor_indicacao`, da seção 3 de
-- `schema-upgrade-indicacoes.sql`): cada envio carimba as condições vigentes e
-- fica com elas. Falta só o nome da campanha, para o extrato do cliente e o
-- admin dizerem de qual delas aquela indicação veio.

ALTER TABLE public.indicacoes_web
  ADD COLUMN IF NOT EXISTS campanha varchar(120);

COMMENT ON COLUMN public.indicacoes_web.campanha IS
  'Nome da campanha vigente na data do envio. Junto com tipo_bonus, '
  'descricao_bonus e valor_indicacao, é o retrato do que foi prometido '
  'naquele dia — não é atualizado quando a campanha vigente muda.';

CREATE INDEX IF NOT EXISTS indicacoes_web_campanha_idx
  ON public.indicacoes_web (campanha, data DESC);

-- ---------------------------------------------------------------------------
-- 5. Os ajustes que o admin edita
-- ---------------------------------------------------------------------------
--
-- Uma linha por assunto, o conteúdo em `jsonb`. Poderia ser uma coluna por
-- ajuste, mas cada ajuste novo viraria uma migração e um deploy — e o ponto
-- desta tabela é justamente o contrário: mudar o texto de uma seção não devia
-- exigir nenhum dos dois.
--
-- O site nunca depende de a linha existir: o que faltar cai no padrão que está
-- no código (veja `CONFIG_INDICACAO_PADRAO` em `src/lib/admin-tipos.ts`).

CREATE TABLE IF NOT EXISTS public.web_config (
  chave         text        PRIMARY KEY,
  valor         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS web_config_atualizado_em ON public.web_config;
CREATE TRIGGER web_config_atualizado_em
  BEFORE UPDATE ON public.web_config
  FOR EACH ROW EXECUTE FUNCTION public.tocar_atualizado_em();

/*
 * A configuração da indicação.
 *
 *   ativo               desliga a indicação em TODA a área do cliente: some o
 *                       banner da visão geral, some o serviço da grade e da
 *                       navegação, e a URL do serviço cai na visão geral
 *   titulo/descricao    o texto da seção, editável sem deploy
 *   banner_*_url        as imagens do topo do formulário (URL, como os planos)
 *   banner_alt          o texto que descreve a imagem para quem não a vê
 *   banner_link         para onde o banner leva, quando levar a algum lugar
 *
 *   campanha_*          a campanha VIGENTE. Não é histórico: é o carimbo que
 *                       cada indicação nova recebe no momento do envio. Trocar
 *                       a campanha aqui muda o que as próximas indicações vão
 *                       valer, e não toca em nenhuma que já existe.
 *
 * Tamanhos recomendados (a tela do admin repete isso ao lado do campo):
 *   desktop  1200x240 px  (5:1)
 *   celular   720x360 px  (2:1)
 */
INSERT INTO public.web_config (chave, valor) VALUES (
  'indicacao',
  jsonb_build_object(
    'ativo', true,
    'titulo', 'Indique e ganhe desconto',
    'descricao', 'A cada amigo que instalar a SCNET, o desconto entra na sua próxima fatura.',
    'banner_desktop_url', '',
    'banner_mobile_url', '',
    'banner_alt', '',
    'banner_link', '',
    'campanha_nome', '',
    'campanha_tipo_bonus', 'desconto_fatura',
    'campanha_descricao_bonus', 'Desconto na próxima fatura quando a indicação instalar.',
    'campanha_valor', ''
  )
)
ON CONFLICT (chave) DO NOTHING;

COMMIT;

-- ---------------------------------------------------------------------------
-- 6. As variáveis do /admin
-- ---------------------------------------------------------------------------
--
-- Não há tabela de usuário: o acesso ao /admin é um par de variáveis de
-- ambiente, ADMIN_USUARIO e ADMIN_SENHA, conferidas em tempo constante. Sem as
-- duas definidas a rota responde 404 — ela nem existe.
--
-- É de propósito: uma tabela de usuários pede cadastro, recuperação de senha e
-- rotação, e nada disso se sustenta sozinho para um painel de uma pessoa. Duas
-- variáveis no EasyPanel são trocadas em dez segundos e não deixam hash parado
-- no banco.
