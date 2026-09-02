-- ===========================================================================
-- SCNET — tudo que o PAINEL DO CLIENTE (/cliente/painel) e o /admin precisam.
-- ===========================================================================
--
-- COMO RODAR NO PGADMIN
--
--   1. Conecte no banco que o SITE usa (o mesmo de POSTGRES_DB/POSTGRES_URL).
--      Rodar no banco errado é o erro mais comum: o comando não reclama de
--      nada, e a tela continua vazia. Confira em /diagnostico?token=... qual
--      banco o servidor abriu.
--   2. Abra a Query Tool (Ferramenta de Consulta) nesse banco.
--   3. Cole este arquivo inteiro e execute (F5).
--   4. No fim aparece uma tabela de conferência dizendo o que existe e quantas
--      linhas cada coisa tem.
--
-- É SEGURO RODAR DE NOVO. Tudo é `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`:
-- nada é recriado, nenhum dado é apagado, nenhuma coluna existente é alterada.
--
-- NÃO HÁ DADO DE MENTIRA AQUI. Só estrutura. O cliente fake para conferir a
-- tela está em `schema-painel.sql` (seção 8) e em `schema-upgrade-indicacoes.sql`
-- (seção 6) — rode aqueles trechos só em banco de teste.
--
-- Este arquivo junta, na ordem certa, o que estava espalhado em:
--   schema-painel.sql · schema-upgrade-indicacoes.sql · schema-admin.sql
--
-- ---------------------------------------------------------------------------
-- O QUE ELE CRIA
-- ---------------------------------------------------------------------------
--
--   clientes_web      o cadastro (só ganha colunas; não é recriado)
--   contratos_web     os contratos do cliente
--   faturas_web       as faturas
--   planos_web        o catálogo da HOME e da /contratacao
--   planos_upgrade    o catálogo da TROCA DE PLANO do painel
--   indicacoes_web    as indicações, com protocolo e bônus por campanha
--   web_formularios   a fila de atendimento: o que o cliente pede pelo painel
--   web_config        os ajustes que o /admin edita sem deploy
--
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Os tipos enumerados
-- ---------------------------------------------------------------------------
--
-- Valores em minúsculas, sem acento. Não faz diferença para a tela — o site
-- normaliza caixa e acento antes de comparar —, mas mantém o banco consistente.
--
-- `CREATE TYPE` não aceita `IF NOT EXISTS`, daí o bloco.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_cadastro') THEN
    CREATE TYPE public.tipo_cadastro AS ENUM ('cpf', 'cnpj');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_cliente') THEN
    CREATE TYPE public.status_cliente AS ENUM ('ativo', 'inativo');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_contrato') THEN
    CREATE TYPE public.status_contrato AS ENUM
      ('ativo', 'suspenso', 'bloqueado', 'cancelado');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_fatura') THEN
    CREATE TYPE public.status_fatura AS ENUM
      ('paga', 'aberta', 'vencida', 'cancelada');
  END IF;

  -- o andamento de uma indicação
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_indicacao') THEN
    CREATE TYPE public.status_indicacao AS ENUM
      ('em_aberto', 'sem_sucesso', 'dados_invalidos', 'concluido');
  END IF;

  -- como o bônus da indicação é pago
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_bonus_indicacao') THEN
    CREATE TYPE public.tipo_bonus_indicacao AS ENUM
      ('desconto_fatura', 'premio', 'pix');
  END IF;

  -- o andamento de uma solicitação (atendimento)
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_solicitacao') THEN
    CREATE TYPE public.status_solicitacao AS ENUM
      ('em_aberto', 'cancelado', 'concluido');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. As funções que as tabelas usam
-- ---------------------------------------------------------------------------
--
-- Vêm antes das tabelas porque duas delas viram `DEFAULT` de coluna — e um
-- `DEFAULT` só pode apontar para função que já existe.

-- `atualizado_em` que se atualiza sozinho em todo UPDATE.
CREATE OR REPLACE FUNCTION public.tocar_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END $$;

/*
 * Os protocolos.
 *
 * Quem gera é o BANCO, e não cada fluxo que grava. Deixar o n8n (ou o site, ou
 * os dois) inventarem o número é onde nascem as duplicidades: dois INSERT no
 * mesmo segundo produzem o mesmo protocolo e o segundo estoura. Com o DEFAULT
 * aqui, quem grava simplesmente não manda a coluna.
 *
 * Formato `IND-AAAAMM-000123` / `SOL-AAAAMM-000123`: legível ao telefone e
 * ordenável por mês.
 */
CREATE SEQUENCE IF NOT EXISTS public.indicacoes_web_protocolo_seq;
CREATE SEQUENCE IF NOT EXISTS public.web_formularios_protocolo_seq;

CREATE OR REPLACE FUNCTION public.proximo_protocolo_indicacao()
RETURNS varchar
LANGUAGE sql
VOLATILE
AS $$
  SELECT 'IND-' || to_char(now(), 'YYYYMM') || '-' ||
         lpad(nextval('public.indicacoes_web_protocolo_seq')::text, 6, '0');
$$;

CREATE OR REPLACE FUNCTION public.proximo_protocolo_solicitacao()
RETURNS varchar
LANGUAGE sql
VOLATILE
AS $$
  SELECT 'SOL-' || to_char(now(), 'YYYYMM') || '-' ||
         lpad(nextval('public.web_formularios_protocolo_seq')::text, 6, '0');
$$;

-- ---------------------------------------------------------------------------
-- 3. O cadastro (clientes_web)
-- ---------------------------------------------------------------------------
--
-- A tabela NÃO é criada nem recriada aqui: ela já existe na sua instalação e é
-- de onde o login lê. O que este bloco faz é acrescentar as colunas que o
-- painel exibe (endereço, nascimento, tipo de cadastro, situação).
--
-- Se `clientes_web` for uma VIEW (a variante documentada em `schema.sql`), o
-- bloco não faz nada e avisa: numa view, quem precisa ganhar colunas é a tabela
-- de origem, e só você sabe qual é.

DO $$
DECLARE
  tipo char;
BEGIN
  SELECT relkind INTO tipo FROM pg_class
   WHERE oid = to_regclass('public.clientes_web');

  IF tipo IS NULL THEN
    RAISE NOTICE 'clientes_web não existe neste banco. Rode docs/n8n/schema.sql (seção 1) ou confira se está no banco certo.';

  ELSIF tipo <> 'r' THEN
    RAISE NOTICE 'clientes_web é uma VIEW: as colunas do painel precisam sair da tabela de origem dela.';

  ELSE
    ALTER TABLE public.clientes_web
      ADD COLUMN IF NOT EXISTS data_nascimento date,
      ADD COLUMN IF NOT EXISTS tipo_cadastro   public.tipo_cadastro,
      ADD COLUMN IF NOT EXISTS cep             varchar(9),
      ADD COLUMN IF NOT EXISTS uf              char(2),
      ADD COLUMN IF NOT EXISTS cidade          varchar(120),
      ADD COLUMN IF NOT EXISTS bairro          varchar(120),
      ADD COLUMN IF NOT EXISTS logradouro      varchar(180),
      ADD COLUMN IF NOT EXISTS numero          varchar(20),
      ADD COLUMN IF NOT EXISTS complemento     varchar(120),
      ADD COLUMN IF NOT EXISTS status_cliente  public.status_cliente NOT NULL DEFAULT 'ativo';

    /*
     * Preenche o tipo de cadastro de quem já está na base, pelo tamanho do
     * documento: 11 dígitos é CPF, 14 é CNPJ. O que não for nem um nem outro
     * fica nulo, em vez de virar um palpite.
     */
    UPDATE public.clientes_web
       SET tipo_cadastro = CASE length(regexp_replace(documento, '\D', '', 'g'))
                             WHEN 11 THEN 'cpf'::public.tipo_cadastro
                             WHEN 14 THEN 'cnpj'::public.tipo_cadastro
                           END
     WHERE tipo_cadastro IS NULL;

    /*
     * `id_cliente` precisa ser único: é nele que os contratos, as faturas e as
     * indicações se apoiam. Se este comando falhar por duplicidade, o problema
     * é de DADO, não de migração — dois clientes com o mesmo id significam que
     * uma sessão poderia abrir o painel do outro. Corrija antes de seguir.
     */
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.clientes_web'::regclass
         AND contype IN ('p', 'u')
         AND conkey = ARRAY[(
               SELECT attnum FROM pg_attribute
                WHERE attrelid = 'public.clientes_web'::regclass
                  AND attname = 'id_cliente'
             )]
    ) THEN
      ALTER TABLE public.clientes_web
        ADD CONSTRAINT clientes_web_pkey PRIMARY KEY (id_cliente);
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Os contratos
-- ---------------------------------------------------------------------------
--
-- Um contrato por linha, ligado ao cliente por `cod_cliente` — o mesmo valor de
-- `clientes_web.id_cliente`, que é o que o login guarda na sessão. É por ele
-- que o painel filtra, e o filtro sai do cookie selado, nunca do navegador.

CREATE TABLE IF NOT EXISTS public.contratos_web (
  id                       bigserial              PRIMARY KEY,
  cod_cliente              text                   NOT NULL,
  cod_contrato             text                   NOT NULL,
  nome_plano               varchar(150),
  valor                    numeric(12,2)          NOT NULL DEFAULT 0,
  status_contrato          public.status_contrato NOT NULL DEFAULT 'ativo',
  status_fatura            public.status_fatura   NOT NULL DEFAULT 'paga',
  velocidade               varchar(60),
  -- itens separados por ";" — "Wi-Fi 6 incluso;Skeelo;Suporte 24h"
  composicao               text,
  -- o endereço de instalação inteiro numa coluna só, pronto para exibir
  endereco                 text,
  dia_vencimento           smallint               CHECK (dia_vencimento BETWEEN 1 AND 31),
  data_adesao              date,
  data_vencimento_contrato date,
  criado_em                timestamptz            NOT NULL DEFAULT now(),
  atualizado_em            timestamptz            NOT NULL DEFAULT now(),
  CONSTRAINT contratos_web_cod_contrato_key UNIQUE (cod_contrato)
);

-- ---------------------------------------------------------------------------
-- 5. As faturas
-- ---------------------------------------------------------------------------
--
-- `dia_vencimento` é só o dia (1 a 31); `data_vencimento` é a data cheia da
-- fatura emitida. As duas coexistem porque só a segunda permite dizer "vence em
-- 10/08/2026" e calcular atraso.
--
-- `valor_atual` é o que se paga hoje (com juros e multa quando vencida) e
-- `valor_original` é o de face. Exibir só o atualizado esconderia o acréscimo;
-- só o original cobraria a menos.

CREATE TABLE IF NOT EXISTS public.faturas_web (
  id                bigserial            PRIMARY KEY,
  codigo_fatura     text                 NOT NULL,
  cod_cliente       text                 NOT NULL,
  cod_contrato      text,
  status_fatura     public.status_fatura NOT NULL DEFAULT 'aberta',
  descricao         varchar(180),
  dia_vencimento    smallint             CHECK (dia_vencimento BETWEEN 1 AND 31),
  data_vencimento   date,
  valor_original    numeric(12,2)        NOT NULL DEFAULT 0,
  valor_atual       numeric(12,2)        NOT NULL DEFAULT 0,
  linha_digitavel   text,
  pix_copia_e_cola  text,
  criado_em         timestamptz          NOT NULL DEFAULT now(),
  atualizado_em     timestamptz          NOT NULL DEFAULT now(),
  CONSTRAINT faturas_web_codigo_fatura_key UNIQUE (codigo_fatura)
);

-- ---------------------------------------------------------------------------
-- 6. O catálogo da vitrine (planos_web)
-- ---------------------------------------------------------------------------
--
-- Alimenta a HOME e a /contratacao. `codigo_oferta` deixa o plano restrito a
-- uma campanha: ele só aparece quando a URL traz ?codigo_oferta= com o mesmo
-- valor.
--
-- Se a tabela já existe, ela só ganha as colunas que faltarem.

CREATE TABLE IF NOT EXISTS public.planos_web (
  id_plano                bigint        PRIMARY KEY,
  ativo                   boolean       NOT NULL DEFAULT true,
  ordem_grade             int           NOT NULL DEFAULT 0,
  destaque                boolean       NOT NULL DEFAULT false,
  codigo_mk               bigint,
  nome                    varchar(150)  NOT NULL,
  descricao               text,
  valor                   numeric(12,2) NOT NULL DEFAULT 0,
  valor_primeiras_faturas numeric(12,2),
  quant_meses_desconto    int,
  composicao_resumo       text,
  composicao              text,
  url_logo_agregados      text,
  nome_destaque           varchar(60),
  codigo_oferta_mk        bigint,
  codigo_oferta           varchar(60)
);

ALTER TABLE public.planos_web
  ADD COLUMN IF NOT EXISTS ativo                   boolean       NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ordem_grade             int           NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS destaque                boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS codigo_mk               bigint,
  ADD COLUMN IF NOT EXISTS descricao               text,
  ADD COLUMN IF NOT EXISTS valor_primeiras_faturas numeric(12,2),
  ADD COLUMN IF NOT EXISTS quant_meses_desconto    int,
  ADD COLUMN IF NOT EXISTS composicao_resumo       text,
  ADD COLUMN IF NOT EXISTS composicao              text,
  ADD COLUMN IF NOT EXISTS url_logo_agregados      text,
  ADD COLUMN IF NOT EXISTS nome_destaque           varchar(60),
  ADD COLUMN IF NOT EXISTS codigo_oferta_mk        bigint,
  ADD COLUMN IF NOT EXISTS codigo_oferta           varchar(60);

-- ---------------------------------------------------------------------------
-- 7. O catálogo da troca de plano (planos_upgrade)
-- ---------------------------------------------------------------------------
--
-- A troca de plano do painel NÃO lê `planos_web`. Aquela é a tabela da vitrine
-- — preço de campanha, primeira fatura promocional, oferta amarrada a um código
-- que só existe na URL de quem chegou pela home. Oferecer aquilo a quem já é
-- cliente é prometer uma condição de venda nova para um contrato antigo.
--
-- Mesmas colunas de `planos_web`, menos `codigo_oferta`: aqui não existe plano
-- restrito a campanha, porque quem chega já entrou com login.
--
-- `codigo_oferta_mk` FICOU. Ele não é a restrição de campanha: é o número da
-- oferta no MK, o que o n8n usa para efetivar a troca no sistema do provedor.
--
-- A regra de exibição não está aqui: o painel só oferece plano de valor IGUAL
-- OU MAIOR que o do contrato atual. Uma linha de valor menor não é erro — ela
-- só não é oferecida a quem já paga mais.

CREATE TABLE IF NOT EXISTS public.planos_upgrade (
  id_plano                bigint        PRIMARY KEY,
  ativo                   boolean       NOT NULL DEFAULT true,
  ordem_grade             int           NOT NULL DEFAULT 0,
  destaque                boolean       NOT NULL DEFAULT false,
  codigo_mk               bigint,
  nome                    varchar(150)  NOT NULL,
  descricao               text,
  valor                   numeric(12,2) NOT NULL DEFAULT 0,
  valor_primeiras_faturas numeric(12,2),
  quant_meses_desconto    int,
  composicao_resumo       text,
  composicao              text,
  url_logo_agregados      text,
  nome_destaque           varchar(60),
  codigo_oferta_mk        bigint
);

COMMENT ON TABLE public.planos_upgrade IS
  'Planos oferecidos na troca de plano do painel do cliente. Separada de '
  'planos_web (home/contratação) de propósito: preço de campanha e oferta '
  'restrita não valem para quem já é cliente.';

-- ---------------------------------------------------------------------------
-- 8. As indicações
-- ---------------------------------------------------------------------------
--
-- A linha nasce com o que o cliente sabe (nome, telefone e cidade do amigo) e é
-- COMPLETADA depois, quando o comercial fecha ou descarta: `cod_novo_cliente`,
-- `cod_contrato_novo_cliente` e o resultado. Por isso quase tudo é anulável —
-- exigir na entrada um dado que só existe no fim travaria o formulário.
--
-- O BÔNUS MORA NA LINHA, e não numa regra global. Ele muda de campanha para
-- campanha, e o mesmo cliente participa de várias ao longo do ano: cada envio
-- carimba `campanha`, `tipo_bonus`, `descricao_bonus` e `valor_indicacao` com
-- as condições vigentes NAQUELE DIA e fica com elas. Trocar a campanha depois
-- não reescreve o que foi prometido antes — é isso que faz o extrato do cliente
-- continuar verdadeiro na terceira campanha do ano.

CREATE TABLE IF NOT EXISTS public.indicacoes_web (
  id                        bigserial               PRIMARY KEY,
  -- o número que o cliente cita ao perguntar pela indicação
  protocolo                 varchar(30)             NOT NULL
                                                    DEFAULT public.proximo_protocolo_indicacao(),
  id_cliente                text                    NOT NULL,
  -- preenchidos depois, quando a indicação vira cliente de verdade
  cod_novo_cliente          text,
  cod_contrato_novo_cliente text,
  nome_cliente              varchar(150),
  nome_indicacao            varchar(150)            NOT NULL,
  -- só dígitos e com DDI, do jeito que o site manda: 5549999998888
  telefone_indicacao        varchar(20)             NOT NULL,
  cidade                    varchar(120),
  observacoes               text,
  data                      timestamptz             NOT NULL DEFAULT now(),
  status                    public.status_indicacao NOT NULL DEFAULT 'em_aberto',
  campanha                  varchar(120),
  tipo_bonus                public.tipo_bonus_indicacao,
  descricao_bonus           text,
  -- usado quando o bônus é pago em dinheiro (PIX ou desconto)
  valor_indicacao           numeric(12,2),
  criado_em                 timestamptz             NOT NULL DEFAULT now(),
  atualizado_em             timestamptz             NOT NULL DEFAULT now(),
  CONSTRAINT indicacoes_web_protocolo_key UNIQUE (protocolo)
);

-- Para quem já tinha a tabela antes da campanha existir.
ALTER TABLE public.indicacoes_web
  ADD COLUMN IF NOT EXISTS campanha varchar(120);

ALTER TABLE public.indicacoes_web
  ALTER COLUMN protocolo SET DEFAULT public.proximo_protocolo_indicacao();

COMMENT ON COLUMN public.indicacoes_web.campanha IS
  'Nome da campanha vigente na data do envio. Junto com tipo_bonus, '
  'descricao_bonus e valor_indicacao, é o retrato do que foi prometido '
  'naquele dia — não é atualizado quando a campanha vigente muda.';

/*
 * O valor só faz sentido no bônus em dinheiro. A restrição evita a linha meio
 * preenchida — "prêmio de R$ 50,00" — que ninguém sabe depois se era para pagar
 * ou para entregar.
 */
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'indicacoes_web_valor_ck'
  ) THEN
    ALTER TABLE public.indicacoes_web
      ADD CONSTRAINT indicacoes_web_valor_ck CHECK (
        valor_indicacao IS NULL OR tipo_bonus IN ('pix', 'desconto_fatura')
      );
  END IF;
END $$;

DROP TRIGGER IF EXISTS indicacoes_web_atualizado_em ON public.indicacoes_web;
CREATE TRIGGER indicacoes_web_atualizado_em
  BEFORE UPDATE ON public.indicacoes_web
  FOR EACH ROW EXECUTE FUNCTION public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- 9. A fila de atendimento (web_formularios)
-- ---------------------------------------------------------------------------
--
-- Esta tabela mudou de papel. Antes era um log do que o painel enviava, e
-- ninguém lia. Agora é o que o cliente vê em "Atendimentos" e o que o admin
-- resolve em /admin: um pedido sem número é um pedido que o cliente não
-- consegue cobrar, e um pedido sem estado é um que ninguém sabe se acabou.
--
-- Se você já tinha a tabela (o `schema.sql` a criava para o n8n), ela só ganha
-- as colunas novas — nada do que está lá é perdido.

CREATE TABLE IF NOT EXISTS public.web_formularios (
  id         bigserial   PRIMARY KEY,
  id_cliente text        NOT NULL,
  formulario text        NOT NULL,
  campos     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.web_formularios
  ADD COLUMN IF NOT EXISTS protocolo          varchar(30),
  ADD COLUMN IF NOT EXISTS status             public.status_solicitacao
                                              NOT NULL DEFAULT 'em_aberto',
  -- o que aparece como título do atendimento na tela do cliente
  ADD COLUMN IF NOT EXISTS assunto            varchar(180),
  ADD COLUMN IF NOT EXISTS categoria          varchar(120),
  ADD COLUMN IF NOT EXISTS descricao          text,
  -- de qual contrato é o pedido, quando o formulário diz
  ADD COLUMN IF NOT EXISTS cod_contrato       text,
  -- data combinada da visita: preenchida, a tela do cliente mostra "Agendado"
  ADD COLUMN IF NOT EXISTS agendado_para      date,
  -- anotação de quem atende; NÃO aparece para o cliente
  ADD COLUMN IF NOT EXISTS observacao_interna text,
  ADD COLUMN IF NOT EXISTS atualizado_em      timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.web_formularios
  ALTER COLUMN protocolo SET DEFAULT public.proximo_protocolo_solicitacao();

-- As linhas que já estavam na tabela não têm protocolo. Ganham um agora, pela
-- mesma função, para a coluna poder ser obrigatória e única.
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

DROP TRIGGER IF EXISTS web_formularios_atualizado_em ON public.web_formularios;
CREATE TRIGGER web_formularios_atualizado_em
  BEFORE UPDATE ON public.web_formularios
  FOR EACH ROW EXECUTE FUNCTION public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- 10. Os ajustes editáveis (web_config)
-- ---------------------------------------------------------------------------
--
-- Uma linha por assunto, o conteúdo em `jsonb`. Poderia ser uma coluna por
-- ajuste, mas cada ajuste novo viraria uma migração e um deploy — e o ponto
-- desta tabela é o contrário: mudar o texto de uma seção não devia exigir
-- nenhum dos dois.
--
-- O site nunca depende de a linha existir: o que faltar cai no padrão do
-- código. Você edita tudo isto na aba "Seção de indicação" do /admin.
--
--   ativo               desliga a indicação em TODA a área do cliente: some o
--                       banner, o item da grade, o item da navegação e o
--                       próprio endereço do serviço
--   titulo/descricao    o texto da seção
--   banner_*_url        as imagens do topo do formulário (URL — não há upload)
--                       desktop 1200x240 px (5:1) · celular 720x360 px (2:1)
--   banner_alt          descreve a imagem para leitor de tela; vazio = decoração
--   banner_link         para onde o banner leva, quando levar a algum lugar
--   campanha_*          a campanha VIGENTE — o carimbo que cada indicação NOVA
--                       recebe. Trocar aqui não altera nenhuma indicação que já
--                       existe.

CREATE TABLE IF NOT EXISTS public.web_config (
  chave         text        PRIMARY KEY,
  valor         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS web_config_atualizado_em ON public.web_config;
CREATE TRIGGER web_config_atualizado_em
  BEFORE UPDATE ON public.web_config
  FOR EACH ROW EXECUTE FUNCTION public.tocar_atualizado_em();

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

-- O prazo de instalação, editado na aba "Prazo de instalação" do /admin. É ele
-- que monta o calendário da última etapa da /contratacao:
--
--   expediente          uma posição por dia da semana, de domingo (0) a sábado
--                       (6), com as faixas de atendimento técnico. O prazo é
--                       contado em horas de ATENDIMENTO (não de relógio), e as
--                       faixas são também os períodos que o cliente escolhe:
--                       dia sem faixa não aparece no calendário
--   prazo_padrao_horas  a espera de toda cidade fora de `cidades`
--   cidades             a exceção, {cidade, horas} por cidade — a busca é
--                       aproximada (acento, caixa, pontuação e "/SC" não
--                       separam a mesma cidade)
--   horizonte_dias      até quantos dias à frente o calendário oferece data
--
-- Sem esta linha vale `CONFIG_AGENDAMENTO_PADRAO` (src/lib/admin-tipos.ts).
INSERT INTO public.web_config (chave, valor) VALUES (
  'agendamento',
  jsonb_build_object(
    'prazo_padrao_horas', '48',
    'horizonte_dias', '60',
    'cidades', '[]'::jsonb,
    'expediente', jsonb_build_array(
      jsonb_build_object('atende_manha', false, 'manha_inicio', '08:00',
                         'manha_fim', '12:00', 'atende_tarde', false,
                         'tarde_inicio', '13:00', 'tarde_fim', '18:00'),
      jsonb_build_object('atende_manha', true, 'manha_inicio', '08:00',
                         'manha_fim', '12:00', 'atende_tarde', true,
                         'tarde_inicio', '13:00', 'tarde_fim', '18:00'),
      jsonb_build_object('atende_manha', true, 'manha_inicio', '08:00',
                         'manha_fim', '12:00', 'atende_tarde', true,
                         'tarde_inicio', '13:00', 'tarde_fim', '18:00'),
      jsonb_build_object('atende_manha', true, 'manha_inicio', '08:00',
                         'manha_fim', '12:00', 'atende_tarde', true,
                         'tarde_inicio', '13:00', 'tarde_fim', '18:00'),
      jsonb_build_object('atende_manha', true, 'manha_inicio', '08:00',
                         'manha_fim', '12:00', 'atende_tarde', true,
                         'tarde_inicio', '13:00', 'tarde_fim', '18:00'),
      jsonb_build_object('atende_manha', true, 'manha_inicio', '08:00',
                         'manha_fim', '12:00', 'atende_tarde', true,
                         'tarde_inicio', '13:00', 'tarde_fim', '18:00'),
      jsonb_build_object('atende_manha', true, 'manha_inicio', '08:00',
                         'manha_fim', '12:00', 'atende_tarde', false,
                         'tarde_inicio', '13:00', 'tarde_fim', '18:00')
    )
  )
)
ON CONFLICT (chave) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 11. As chaves estrangeiras
-- ---------------------------------------------------------------------------
--
-- Em bloco à parte para o arquivo poder rodar de novo sem reclamar que a
-- restrição já existe. Todas dependem de `clientes_web` ser uma TABELA com
-- `id_cliente` único — numa instalação em view, este bloco é pulado com aviso,
-- e o painel continua funcionando (o vínculo passa a ser só por convenção).
--
-- ON DELETE CASCADE onde o dado é do cliente: apagar o cadastro leva junto
-- contratos, faturas e as indicações que ELE fez. Deixar isso para trás é
-- guardar dado pessoal que ninguém vai olhar.
--
-- ON DELETE SET NULL onde o vínculo é referência: uma fatura sobrevive ao fim
-- do contrato, e a indicação sobrevive ao cadastro do indicado.

/*
 * O `oid` do cadastro é guardado numa variável, e a conferência das restrições
 * só acontece DEPOIS de ele existir.
 *
 * Escrever isso como uma expressão só — `to_regclass(...) IS NOT NULL AND
 * EXISTS (... 'public.clientes_web'::regclass ...)` — parece equivalente e não
 * é: o `::regclass` é avaliado de qualquer jeito e LANÇA ERRO quando a tabela
 * não existe, em vez de o `AND` curto-circuitar. Como este arquivo roda dentro
 * de uma transação, esse erro desfazia o script INTEIRO: num banco vazio,
 * nenhuma tabela era criada e a única pista era um erro no fim.
 */
DO $$
DECLARE
  oid_cadastro oid := to_regclass('public.clientes_web');
  cadastro_ok boolean := false;
BEGIN
  IF oid_cadastro IS NOT NULL
     AND (SELECT relkind FROM pg_class WHERE oid = oid_cadastro) = 'r' THEN
    SELECT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conrelid = oid_cadastro
         AND contype IN ('p', 'u')
         AND conkey = ARRAY[(
               SELECT attnum FROM pg_attribute
                WHERE attrelid = oid_cadastro
                  AND attname = 'id_cliente'
             )]
    ) INTO cadastro_ok;
  END IF;

  IF NOT cadastro_ok THEN
    RAISE NOTICE 'Chaves estrangeiras puladas: clientes_web precisa ser tabela com id_cliente único.';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contratos_web_cliente_fkey') THEN
    ALTER TABLE public.contratos_web
      ADD CONSTRAINT contratos_web_cliente_fkey
      FOREIGN KEY (cod_cliente) REFERENCES public.clientes_web (id_cliente)
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'faturas_web_cliente_fkey') THEN
    ALTER TABLE public.faturas_web
      ADD CONSTRAINT faturas_web_cliente_fkey
      FOREIGN KEY (cod_cliente) REFERENCES public.clientes_web (id_cliente)
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'faturas_web_contrato_fkey') THEN
    ALTER TABLE public.faturas_web
      ADD CONSTRAINT faturas_web_contrato_fkey
      FOREIGN KEY (cod_contrato) REFERENCES public.contratos_web (cod_contrato)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicacoes_web_cliente_fkey') THEN
    ALTER TABLE public.indicacoes_web
      ADD CONSTRAINT indicacoes_web_cliente_fkey
      FOREIGN KEY (id_cliente) REFERENCES public.clientes_web (id_cliente)
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicacoes_web_novo_cliente_fkey') THEN
    ALTER TABLE public.indicacoes_web
      ADD CONSTRAINT indicacoes_web_novo_cliente_fkey
      FOREIGN KEY (cod_novo_cliente) REFERENCES public.clientes_web (id_cliente)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'indicacoes_web_novo_contrato_fkey') THEN
    ALTER TABLE public.indicacoes_web
      ADD CONSTRAINT indicacoes_web_novo_contrato_fkey
      FOREIGN KEY (cod_contrato_novo_cliente) REFERENCES public.contratos_web (cod_contrato)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 12. Os índices
-- ---------------------------------------------------------------------------
--
-- Toda consulta do painel começa por "o que é DESTE cliente"; as duas últimas
-- atendem quem opera: a fila do que está em aberto e a busca pelo telefone que
-- ligou.

CREATE INDEX IF NOT EXISTS contratos_web_cliente_idx
  ON public.contratos_web (cod_cliente);

CREATE INDEX IF NOT EXISTS faturas_web_cliente_idx
  ON public.faturas_web (cod_cliente, data_vencimento DESC);

CREATE INDEX IF NOT EXISTS faturas_web_contrato_idx
  ON public.faturas_web (cod_contrato);

CREATE INDEX IF NOT EXISTS planos_web_grade_idx
  ON public.planos_web (ativo, ordem_grade);

CREATE INDEX IF NOT EXISTS planos_upgrade_grade_idx
  ON public.planos_upgrade (ativo, ordem_grade);

CREATE INDEX IF NOT EXISTS indicacoes_web_cliente_idx
  ON public.indicacoes_web (id_cliente, data DESC);

CREATE INDEX IF NOT EXISTS indicacoes_web_status_idx
  ON public.indicacoes_web (status, data DESC);

CREATE INDEX IF NOT EXISTS indicacoes_web_telefone_idx
  ON public.indicacoes_web (telefone_indicacao);

CREATE INDEX IF NOT EXISTS indicacoes_web_campanha_idx
  ON public.indicacoes_web (campanha, data DESC);

CREATE INDEX IF NOT EXISTS web_formularios_cliente_idx
  ON public.web_formularios (id_cliente, criado_em DESC);

CREATE INDEX IF NOT EXISTS web_formularios_status_idx
  ON public.web_formularios (status, criado_em DESC);

COMMIT;

-- ===========================================================================
-- CONFERÊNCIA
-- ===========================================================================
--
-- O resultado abaixo é o retrato do que ficou no banco. `existe` falso em
-- qualquer linha significa que aquele bloco não rodou — role a aba "Messages"
-- do pgAdmin, o motivo está lá.

SELECT 'clientes_web'    AS tabela, to_regclass('public.clientes_web')    IS NOT NULL AS existe,
       (SELECT count(*) FROM public.clientes_web)    AS linhas
UNION ALL
SELECT 'contratos_web',  to_regclass('public.contratos_web')  IS NOT NULL,
       (SELECT count(*) FROM public.contratos_web)
UNION ALL
SELECT 'faturas_web',    to_regclass('public.faturas_web')    IS NOT NULL,
       (SELECT count(*) FROM public.faturas_web)
UNION ALL
SELECT 'planos_web',     to_regclass('public.planos_web')     IS NOT NULL,
       (SELECT count(*) FROM public.planos_web)
UNION ALL
SELECT 'planos_upgrade', to_regclass('public.planos_upgrade') IS NOT NULL,
       (SELECT count(*) FROM public.planos_upgrade)
UNION ALL
SELECT 'indicacoes_web', to_regclass('public.indicacoes_web') IS NOT NULL,
       (SELECT count(*) FROM public.indicacoes_web)
UNION ALL
SELECT 'web_formularios', to_regclass('public.web_formularios') IS NOT NULL,
       (SELECT count(*) FROM public.web_formularios)
UNION ALL
SELECT 'web_config',     to_regclass('public.web_config')     IS NOT NULL,
       (SELECT count(*) FROM public.web_config);

-- ===========================================================================
-- DEPOIS DE RODAR
-- ===========================================================================
--
-- 1. `planos_upgrade` nasce VAZIA — e vazia a troca de plano não oferece nada.
--    Cadastre os planos em /admin › Planos de upgrade, ou copie os da vitrine:
--
--      INSERT INTO public.planos_upgrade (
--        id_plano, ativo, ordem_grade, destaque, codigo_mk, nome, descricao,
--        valor, valor_primeiras_faturas, quant_meses_desconto,
--        composicao_resumo, composicao, url_logo_agregados, nome_destaque,
--        codigo_oferta_mk
--      )
--      SELECT
--        id_plano, ativo, ordem_grade, destaque, codigo_mk, nome, descricao,
--        valor, valor_primeiras_faturas, quant_meses_desconto,
--        composicao_resumo, composicao, url_logo_agregados, nome_destaque,
--        codigo_oferta_mk
--      FROM public.planos_web
--       WHERE ativo IS TRUE AND codigo_oferta IS NULL
--      ON CONFLICT (id_plano) DO NOTHING;
--
-- 2. No servidor (EasyPanel › Environment Variables), para o /admin existir:
--
--      ADMIN_USUARIO=...
--      ADMIN_SENHA=...        (senha longa: daqui se edita preço de plano)
--
--    As tabelas novas já têm nome padrão; só defina estas se você as renomear:
--      POSTGRES_PLANOS_UPGRADE_TABLE, POSTGRES_INDICACOES_TABLE,
--      POSTGRES_FORMULARIOS_TABLE, POSTGRES_CONFIG_TABLE
--
-- 3. Confira pelo site: /diagnostico?token=... mostra qual banco o servidor
--    abriu e quais tabelas ele enxerga.
