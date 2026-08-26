-- ===========================================================================
-- SCNET — TODO ENVIO DE FORMULÁRIO DO SITE, GRAVADO NO BANCO.
-- ===========================================================================
--
-- COMO RODAR NO PGADMIN
--
--   1. Conecte no banco que o SITE usa — o mesmo de POSTGRES_URL/POSTGRES_DB,
--      o mesmo do painel do cliente e do /admin. Rodar no banco errado é o erro
--      mais comum: nada reclama, e a aba "Envios do site" continua vazia.
--      Confira em /diagnostico?token=... qual banco o servidor abriu.
--   2. Abra a Query Tool (Ferramenta de Consulta) nesse banco.
--   3. Cole este arquivo inteiro e execute (F5).
--   4. No fim aparece uma tabela de conferência com o que ficou no banco.
--
-- É SEGURO RODAR DE NOVO. Tudo é `IF NOT EXISTS`: nada é recriado, nenhum dado
-- é apagado, nenhuma coluna existente é alterada.
--
-- ---------------------------------------------------------------------------
-- O QUE ELE CRIA
-- ---------------------------------------------------------------------------
--
--   web_envios         uma linha por envio do site: o lead da home e cada
--                      contratação. A contratação vai sendo ATUALIZADA na
--                      mesma linha conforme a pessoa avança pelas etapas.
--   web_envios_anexos  os arquivos (comprovante e documento), em `bytea`.
--
-- ---------------------------------------------------------------------------
-- POR QUE DUAS TABELAS, E NÃO UMA COLUNA COM O ARQUIVO DENTRO
-- ---------------------------------------------------------------------------
--
-- A linha do envio é lida o tempo todo: é ela que monta a lista do /admin. O
-- arquivo é lido uma vez, quando alguém clica para baixar. Se os dois
-- morassem juntos, montar uma lista de 300 envios significaria arrastar
-- centenas de megabytes de documento do disco para a memória do servidor —
-- exatamente a sobrecarga que este arquivo existe para evitar.
--
-- Então a linha guarda a FICHA de cada anexo (nome, tipo, tamanho, sha256) na
-- coluna `anexos`, que é minúscula e sempre segura de ler, e os BYTES ficam em
-- `web_envios_anexos`, que só é tocada no download. `ON DELETE CASCADE`: apagar
-- o envio apaga os arquivos junto, sem sobra.
--
-- ---------------------------------------------------------------------------
-- ONDE A SEGURANÇA MORA
-- ---------------------------------------------------------------------------
--
-- Em três camadas, e esta é a última delas:
--
--   1. NA ENTRADA (src/lib/): o corpo da requisição é recusado acima de 30MB
--      antes de ser lido, o IP é limitado a 15 envios por minuto, o CSRF é
--      conferido, o reCAPTCHA reprova robô, o zod fecha tipo e tamanho de cada
--      campo, e o anexo é conferido pelos BYTES INICIAIS do arquivo (um `.exe`
--      renomeado para `.pdf` não passa) com o nome reescrito pelo servidor.
--   2. NA CONSULTA: tudo é parametrizado pelo postgres.js — nenhum valor do
--      cliente vira texto de SQL. O site grava só o que já saiu validado.
--   3. AQUI: as restrições abaixo são o que sobra valendo se as duas primeiras
--      falharem — ou se alguém abrir o pgAdmin e tentar um INSERT à mão. O
--      banco recusa arquivo acima de 10MB, tipo que não seja PDF/PNG/JPEG,
--      campo de anexo desconhecido, JSON gigante e mais de um arquivo por
--      campo. Uma restrição não depende de o código estar certo.
--
-- A seção 5 vai além e cria um usuário só para o site, sem poder de criar,
-- apagar nem truncar nada — para o dia em que a aplicação for comprometida.
--
-- ===========================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. A tabela dos envios
-- ---------------------------------------------------------------------------
--
-- `id_sessao` é a chave do negócio, e não a `id`: é ele que faz a contratação
-- ser UMA linha que cresce, em vez de quatro linhas soltas (uma por etapa) que
-- alguém teria de juntar depois. O site manda o mesmo `id_sessao` nas quatro
-- etapas e o `INSERT ... ON CONFLICT` atualiza a linha que já existe.
--
-- As colunas de fora do JSON são as que a tela precisa para listar, ordenar e
-- procurar sem abrir o JSON de cada linha: quando o envio chegou, quem enviou e
-- em que pé parou. Todo o resto — plano, endereço, cadastro, agendamento,
-- UTMs — vive em `dados`, e é o retrato completo do que a pessoa preencheu.

CREATE TABLE IF NOT EXISTS public.web_envios (
  id            bigserial   PRIMARY KEY,

  -- de qual formulário veio, e a chave que liga as etapas de uma contratação
  formulario    varchar(20) NOT NULL,
  id_sessao     varchar(64) NOT NULL,

  -- quando chegou o primeiro envio, e quando a linha mudou pela última vez
  data          timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),

  -- quem enviou: o que se procura numa lista, então fica fora do JSON
  nome          varchar(150),
  telefone      varchar(20),

  -- até onde a pessoa chegou (1..4 na contratação; a home tem etapa única)
  etapa         smallint    NOT NULL DEFAULT 1,
  etapa_id      varchar(40),
  total_etapas  smallint    NOT NULL DEFAULT 1,
  concluido     boolean     NOT NULL DEFAULT false,

  -- o que o n8n respondeu no último envio desta linha
  status_envio  varchar(20) NOT NULL DEFAULT 'recebido',

  -- o plano escolhido, para a lista dizer o que a pessoa quer sem abrir o JSON
  plano         varchar(120),

  -- o IP NUNCA é gravado em claro: o que fica é um hash, que serve para ver
  -- que 400 envios vieram do mesmo lugar sem guardar dado pessoal de ninguém
  ip_hash       varchar(64),

  -- o formulário inteiro, como a pessoa preencheu
  dados         jsonb       NOT NULL DEFAULT '{}'::jsonb,

  -- a FICHA dos anexos (nome, tipo, tamanho, sha256). Os bytes ficam na
  -- tabela da seção 2 — ver o cabeçalho deste arquivo.
  anexos        jsonb       NOT NULL DEFAULT '[]'::jsonb
);

-- ---------------------------------------------------------------------------
-- 1.1 As restrições
-- ---------------------------------------------------------------------------
--
-- `length(x::text)` e não `pg_column_size(x)`: só função IMMUTABLE é aceita
-- numa restrição, e o `pg_column_size` não é uma. O texto do JSON é a medida
-- honesta do que se está tentando gravar.
--
-- Os tetos são folgados de propósito — eles não são o limite do dia a dia (o
-- código corta bem antes, em 64KB de `dados`), são a parede que impede alguém
-- de usar a tabela como depósito.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'web_envios_id_sessao_key') THEN
    ALTER TABLE public.web_envios ADD CONSTRAINT web_envios_id_sessao_key UNIQUE (id_sessao);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'web_envios_formulario_ck') THEN
    ALTER TABLE public.web_envios ADD CONSTRAINT web_envios_formulario_ck
      CHECK (formulario IN ('lead', 'contratacao'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'web_envios_status_ck') THEN
    ALTER TABLE public.web_envios ADD CONSTRAINT web_envios_status_ck
      CHECK (status_envio IN ('recebido', 'webhook_ok', 'webhook_erro', 'sem_webhook'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'web_envios_etapa_ck') THEN
    ALTER TABLE public.web_envios ADD CONSTRAINT web_envios_etapa_ck
      CHECK (etapa BETWEEN 1 AND 20 AND total_etapas BETWEEN 1 AND 20);
  END IF;

  -- 256KB de JSON. O site corta em 64KB; isto é o teto absoluto.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'web_envios_dados_ck') THEN
    ALTER TABLE public.web_envios ADD CONSTRAINT web_envios_dados_ck
      CHECK (jsonb_typeof(dados) = 'object' AND length(dados::text) <= 262144);
  END IF;

  -- A ficha dos anexos é texto curto: no máximo 4 fichas e 8KB no total.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'web_envios_anexos_ck') THEN
    ALTER TABLE public.web_envios ADD CONSTRAINT web_envios_anexos_ck
      CHECK (
        jsonb_typeof(anexos) = 'array'
        AND jsonb_array_length(anexos) <= 4
        AND length(anexos::text) <= 8192
      );
  END IF;
END $$;

COMMENT ON TABLE public.web_envios IS
  'Um envio de formulário do site por linha. A contratação é atualizada na '
  'mesma linha a cada etapa, pela chave id_sessao.';

COMMENT ON COLUMN public.web_envios.dados IS
  'O formulário inteiro como a pessoa preencheu: plano, endereço, cadastro, '
  'agendamento, origem e UTMs. Já saneado pelo servidor.';

COMMENT ON COLUMN public.web_envios.ip_hash IS
  'SHA-256 do IP com o sal de IP_HASH_SALT. Serve para reconhecer abuso vindo '
  'de um mesmo lugar sem guardar o endereço de ninguém.';

-- ---------------------------------------------------------------------------
-- 1.2 Os índices
-- ---------------------------------------------------------------------------
--
-- A lista do /admin pede "os últimos envios, do mais novo para o mais velho";
-- o telefone é por onde se procura quando a pessoa liga; o `ip_hash` é como se
-- descobre que uma enxurrada veio toda do mesmo lugar.

CREATE INDEX IF NOT EXISTS web_envios_data_idx
  ON public.web_envios (data DESC);

CREATE INDEX IF NOT EXISTS web_envios_formulario_idx
  ON public.web_envios (formulario, data DESC);

CREATE INDEX IF NOT EXISTS web_envios_telefone_idx
  ON public.web_envios (telefone);

CREATE INDEX IF NOT EXISTS web_envios_ip_idx
  ON public.web_envios (ip_hash, data DESC);

-- `atualizado_em` que se mantém sozinho. A função é a mesma que as outras
-- tabelas usam; o `CREATE OR REPLACE` a cria caso este arquivo rode sozinho.
CREATE OR REPLACE FUNCTION public.tocar_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS web_envios_atualizado_em ON public.web_envios;
CREATE TRIGGER web_envios_atualizado_em
  BEFORE UPDATE ON public.web_envios
  FOR EACH ROW EXECUTE FUNCTION public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- 2. Os arquivos
-- ---------------------------------------------------------------------------
--
-- `bytea`, e não base64 em texto: é o arquivo como ele é, sem os 33% a mais que
-- o base64 cobra, e com `octet_length` medindo o tamanho de verdade — o que
-- permite a restrição de 10MB ser exata.
--
-- `UNIQUE (envio_id, campo)` é o que impede a mesma pessoa de empilhar
-- cinquenta comprovantes na mesma contratação: reenviar a etapa troca o
-- arquivo, não acumula outro.

CREATE TABLE IF NOT EXISTS public.web_envios_anexos (
  id        bigserial   PRIMARY KEY,
  envio_id  bigint      NOT NULL REFERENCES public.web_envios (id) ON DELETE CASCADE,
  campo     varchar(40) NOT NULL,
  nome      varchar(160) NOT NULL,
  tipo      varchar(60) NOT NULL,
  tamanho   integer     NOT NULL,
  -- impressão digital do arquivo: diz se dois envios mandaram o mesmo documento
  sha256    varchar(64) NOT NULL,
  conteudo  bytea       NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'web_envios_anexos_envio_campo_key') THEN
    ALTER TABLE public.web_envios_anexos
      ADD CONSTRAINT web_envios_anexos_envio_campo_key UNIQUE (envio_id, campo);
  END IF;

  -- Só os dois campos que o formulário tem. Qualquer outro nome é recusado.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'web_envios_anexos_campo_ck') THEN
    ALTER TABLE public.web_envios_anexos ADD CONSTRAINT web_envios_anexos_campo_ck
      CHECK (campo IN ('comprovante_residencia', 'documento_com_foto'));
  END IF;

  -- Só os três formatos aceitos. Nem executável, nem zip, nem svg (que é
  -- script disfarçado de imagem quando um navegador o abre).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'web_envios_anexos_tipo_ck') THEN
    ALTER TABLE public.web_envios_anexos ADD CONSTRAINT web_envios_anexos_tipo_ck
      CHECK (tipo IN ('application/pdf', 'image/png', 'image/jpeg'));
  END IF;

  -- 10MB por arquivo, medidos nos bytes gravados — não no que o cliente disse.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'web_envios_anexos_tamanho_ck') THEN
    ALTER TABLE public.web_envios_anexos ADD CONSTRAINT web_envios_anexos_tamanho_ck
      CHECK (octet_length(conteudo) > 0 AND octet_length(conteudo) <= 10485760);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'web_envios_anexos_sha_ck') THEN
    ALTER TABLE public.web_envios_anexos ADD CONSTRAINT web_envios_anexos_sha_ck
      CHECK (sha256 ~ '^[0-9a-f]{64}$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS web_envios_anexos_envio_idx
  ON public.web_envios_anexos (envio_id);

COMMENT ON TABLE public.web_envios_anexos IS
  'Os arquivos de cada envio. Fora da tabela principal para que listar envios '
  'nunca arraste documento nenhum do disco.';

COMMIT;

-- ===========================================================================
-- 3. CONFERÊNCIA
-- ===========================================================================
--
-- `existe` falso significa que o bloco não rodou — o motivo está na aba
-- "Messages" do pgAdmin.

SELECT 'web_envios'        AS tabela,
       to_regclass('public.web_envios') IS NOT NULL AS existe,
       (SELECT count(*) FROM public.web_envios) AS linhas
UNION ALL
SELECT 'web_envios_anexos',
       to_regclass('public.web_envios_anexos') IS NOT NULL,
       (SELECT count(*) FROM public.web_envios_anexos);

-- ===========================================================================
-- 4. LIMPEZA PERIÓDICA (rode quando quiser; nada aqui é automático)
-- ===========================================================================
--
-- Duas razões para apagar: a tabela não é um arquivo morto — ela é a caixa de
-- entrada do comercial — e documento de identidade guardado sem necessidade é
-- risco puro pela LGPD. O que não vai ser usado não devia estar lá.
--
-- Apaga só os ARQUIVOS dos envios com mais de 90 dias, mantendo o registro do
-- envio (nome, telefone, plano, data) para o histórico comercial:

--   DELETE FROM public.web_envios_anexos
--    WHERE envio_id IN (SELECT id FROM public.web_envios
--                        WHERE data < now() - interval '90 days');

-- Apaga os envios ABANDONADOS com mais de 30 dias — quem parou na etapa 1 e
-- nunca voltou. Os arquivos vão junto, pelo ON DELETE CASCADE:

--   DELETE FROM public.web_envios
--    WHERE concluido IS FALSE
--      AND data < now() - interval '30 days';

-- Quanto espaço cada coisa está ocupando hoje:

--   SELECT pg_size_pretty(pg_total_relation_size('public.web_envios'))        AS envios,
--          pg_size_pretty(pg_total_relation_size('public.web_envios_anexos')) AS anexos;

-- ===========================================================================
-- 5. UM USUÁRIO SÓ PARA O SITE (opcional, e MUITO recomendado)
-- ===========================================================================
--
-- Hoje o site provavelmente conecta com um usuário que pode tudo — inclusive
-- `DROP TABLE`. Isso quer dizer que uma falha na aplicação não é um vazamento:
-- é a perda do banco. Um usuário separado, que só sabe fazer o que o site
-- precisa, transforma o pior caso em algo bem menor.
--
-- O que este usuário NÃO pode: criar, alterar ou apagar tabela; truncar;
-- apagar linha de `web_envios`; ler qualquer tabela que não esteja na lista.
--
-- COMO USAR
--   1. Troque a senha abaixo por uma longa e aleatória (32+ caracteres).
--   2. Rode o bloco.
--   3. No EasyPanel, aponte POSTGRES_USER/POSTGRES_PASSWORD (ou POSTGRES_URL)
--      para ele e reinicie o serviço.
--   4. Confira em /diagnostico?token=... que as tabelas continuam visíveis.

/*
-- Troque a senha! Ela é a chave do banco inteiro para quem a tiver.
CREATE ROLE scnet_site LOGIN PASSWORD 'troque-esta-senha-por-uma-longa-e-aleatoria'
  CONNECTION LIMIT 10;

-- Uma consulta que trava não pode segurar uma conexão para sempre: o site
-- responde em milissegundos, então 10 segundos já é um exagero generoso.
ALTER ROLE scnet_site SET statement_timeout = '10s';
ALTER ROLE scnet_site SET idle_in_transaction_session_timeout = '15s';
ALTER ROLE scnet_site SET lock_timeout = '5s';

GRANT USAGE ON SCHEMA public TO scnet_site;

-- Nada de criar tabela nova com este usuário.
REVOKE CREATE ON SCHEMA public FROM scnet_site;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

DO $$
DECLARE
  t text;
  -- as tabelas que o site LÊ e ESCREVE
  escrita text[] := ARRAY[
    'web_envios', 'web_envios_anexos', 'web_formularios', 'indicacoes_web', 'web_config'
  ];
  -- as que ele lê, e nas quais o /admin também edita o catálogo
  catalogo text[] := ARRAY['planos_web', 'planos_upgrade'];
  -- as que ele só LÊ
  leitura text[] := ARRAY['clientes_web', 'contratos_web', 'faturas_web'];
BEGIN
  FOREACH t IN ARRAY escrita LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO scnet_site', t);
    END IF;
  END LOOP;

  -- DELETE só onde o /admin realmente exclui: plano e indicação.
  FOREACH t IN ARRAY catalogo LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO scnet_site', t);
    END IF;
  END LOOP;

  IF to_regclass('public.indicacoes_web') IS NOT NULL THEN
    EXECUTE 'GRANT DELETE ON public.indicacoes_web TO scnet_site';
  END IF;

  FOREACH t IN ARRAY leitura LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT ON public.%I TO scnet_site', t);
    END IF;
  END LOOP;
END $$;

-- As sequências dos `bigserial` — sem isto, todo INSERT falha com
-- "permission denied for sequence".
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO scnet_site;

-- E as funções que o site chama (o protocolo das solicitações, por exemplo).
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO scnet_site;

-- Confira o que ele pode fazer:
--   SELECT table_name, privilege_type
--     FROM information_schema.role_table_grants
--    WHERE grantee = 'scnet_site' ORDER BY table_name, privilege_type;
*/

-- ===========================================================================
-- DEPOIS DE RODAR
-- ===========================================================================
--
-- 1. Nada a configurar no site: o nome das tabelas já é o padrão. Só defina
--    POSTGRES_ENVIOS_TABLE / POSTGRES_ENVIOS_ANEXOS_TABLE se você as renomear.
--
-- 2. Para o hash do IP não ser adivinhável, defina no EasyPanel:
--
--      IP_HASH_SALT=<qualquer texto longo e aleatório, guardado só lá>
--
--    Sem ele o site ainda grava o hash, mas um IPv4 pode ser descoberto por
--    tentativa e erro — são só 4 bilhões de combinações.
--
-- 3. Para NÃO guardar os arquivos no banco (só a ficha deles), defina:
--
--      ENVIOS_GRAVAR_ANEXOS=false
--
-- 4. Confira pelo site: envie o formulário da home e abra /admin › "Envios do
--    site". A linha aparece na hora.
