-- Estruturas que o workflow `workflow-login-cliente.json` espera no Postgres.
--
-- Uma view sobre a sua base (adapte) e quatro tabelas do portal (use como estão):
--
--   public.clientes_web        VIEW sobre a sua base de clientes  ← ADAPTE
--   public.web_credenciais     senha do portal (salt + hash scrypt)
--   public.web_codigos_acesso  códigos de acesso por SMS/WhatsApp/e-mail
--   public.web_sessoes         tokens de acesso emitidos no login
--   public.web_formularios     formulários enviados pelo painel
--
-- Rode com um usuário que possa criar objetos no schema `public`.

-- ---------------------------------------------------------------------------
-- 1. A ponte com a sua base de clientes
-- ---------------------------------------------------------------------------
--
-- O workflow inteiro lê o cadastro por esta view, e só por ela. É o único ponto
-- que você precisa adaptar: troque `sua_tabela_de_clientes` e os nomes das
-- colunas pelos do seu sistema, mantendo os nomes de saída.
--
-- Duas colunas merecem atenção:
--
--   documento  precisa sair SÓ COM DÍGITOS. O site normaliza o CPF/CNPJ antes
--              de enviar ("111.444.777-35" vira "11144477735"), então uma
--              coluna com pontuação nunca casa. Daí o regexp_replace.
--   celular    idem, e SEM DDI: o site manda "+5549999991234", o workflow tira
--              o "55" antes de comparar, e o que sobra é "49999991234".

CREATE OR REPLACE VIEW public.clientes_web AS
SELECT
  c.id::text                                             AS id_cliente,
  c.nome                                                 AS nome,
  regexp_replace(c.cpf_cnpj, '\D', '', 'g')              AS documento,
  regexp_replace(COALESCE(c.celular, ''), '\D', '', 'g') AS celular,
  lower(trim(COALESCE(c.email, '')))                     AS email
FROM sua_tabela_de_clientes c
WHERE c.ativo;

-- ---------------------------------------------------------------------------
-- 2. A senha do portal
-- ---------------------------------------------------------------------------
--
-- A senha do site é do PORTAL, não do seu sistema — por isso mora numa tabela
-- própria em vez de numa coluna do cadastro.
--
-- Guardamos salt + hash scrypt, nunca a senha. scrypt é um KDF: derivar a chave
-- custa memória e tempo de propósito, o que torna a força bruta sobre uma
-- tabela vazada ordens de grandeza mais lenta do que com um SHA-256 puro. O
-- cálculo acontece no nó de código do n8n (`crypto.scryptSync`), não aqui: a
-- senha em claro nunca entra numa query, então não aparece em log de banco nem
-- em `pg_stat_statements`.

CREATE TABLE IF NOT EXISTS public.web_credenciais (
  id_cliente    text        PRIMARY KEY,
  senha_salt    text        NOT NULL,
  senha_hash    text        NOT NULL,
  atualizada_em timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. Os códigos de acesso
-- ---------------------------------------------------------------------------
--
-- Um código por linha, e também só o hash: um código de 6 dígitos tem 1 milhão
-- de possibilidades, então o SHA-256 não impede quebrá-lo offline — impede que
-- quem abrir a tabela leia os códigos VIVOS e entre nas contas dentro dos 5
-- minutos de validade, que é o risco concreto.

CREATE TABLE IF NOT EXISTS public.web_codigos_acesso (
  id          bigserial   PRIMARY KEY,
  id_cliente  text        NOT NULL,
  documento   text        NOT NULL,
  metodo      text        NOT NULL CHECK (metodo IN ('sms', 'whatsapp', 'email')),
  codigo_hash text        NOT NULL,
  tentativas  int         NOT NULL DEFAULT 0,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  expira_em   timestamptz NOT NULL,
  usado_em    timestamptz
);

-- A verificação sempre busca o código mais recente de um cliente.
CREATE INDEX IF NOT EXISTS web_codigos_acesso_cliente_idx
  ON public.web_codigos_acesso (id_cliente, criado_em DESC);

-- ---------------------------------------------------------------------------
-- 4. Os tokens de acesso
-- ---------------------------------------------------------------------------
--
-- Uma sessão por linha. O token é opaco e aleatório (32 bytes), não carrega
-- informação nenhuma — é só uma chave que aponta para esta linha. É isso que
-- permite REVOGAR uma sessão a qualquer momento: um JWT autoassinado, por
-- comparação, continua válido até expirar mesmo depois de você querer derrubá-lo.
--
-- No banco fica só o SHA-256. Aqui o hash simples basta: 256 bits de entropia
-- não têm o que adivinhar por força bruta, e o hash serve para que uma cópia da
-- tabela não entregue sessões vivas.

CREATE TABLE IF NOT EXISTS public.web_sessoes (
  token_hash    text        PRIMARY KEY,
  id_cliente    text        NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  expira_em     timestamptz NOT NULL,
  ultimo_uso_em timestamptz,
  revogada_em   timestamptz
);

CREATE INDEX IF NOT EXISTS web_sessoes_cliente_idx
  ON public.web_sessoes (id_cliente, expira_em DESC);

-- Derrubar a sessão de um cliente agora (ele volta ao login na próxima ação):
--   UPDATE public.web_sessoes SET revogada_em = now()
--    WHERE id_cliente = '9911' AND revogada_em IS NULL;

-- ---------------------------------------------------------------------------
-- 5. Os formulários do painel
-- ---------------------------------------------------------------------------
--
-- `id_cliente` vem da SESSÃO (do token), nunca do corpo da requisição — assim
-- um registro não pode ser atribuído a outra pessoa.

CREATE TABLE IF NOT EXISTS public.web_formularios (
  id         bigserial   PRIMARY KEY,
  id_cliente text        NOT NULL,
  formulario text        NOT NULL,
  campos     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS web_formularios_cliente_idx
  ON public.web_formularios (id_cliente, criado_em DESC);

-- ---------------------------------------------------------------------------
-- 6. Limpeza
-- ---------------------------------------------------------------------------
--
-- Códigos e sessões vencidos não servem para nada e são dado pessoal parado.
-- Rode num Schedule Trigger diário no n8n, ou num cron do banco:

-- DELETE FROM public.web_codigos_acesso WHERE criado_em < now() - interval '7 days';
-- DELETE FROM public.web_sessoes        WHERE expira_em < now() - interval '7 days';
