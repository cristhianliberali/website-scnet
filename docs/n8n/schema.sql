-- Estruturas que o workflow `workflow-login-cliente.json` espera no Postgres.
--
-- São duas, e só a primeira precisa ser adaptada ao seu banco:
--
--   public.clientes_web        VIEW sobre a sua base de clientes (adapte)
--   public.web_codigos_acesso  TABELA dos códigos de acesso (use como está)
--
-- Rode com um usuário que possa criar objetos no schema `public`.

-- ---------------------------------------------------------------------------
-- 1. A ponte com a sua base de clientes
-- ---------------------------------------------------------------------------
--
-- O workflow inteiro lê o cadastro por esta view, e só por ela. É o único
-- ponto que você precisa adaptar: troque `sua_tabela_de_clientes` e os nomes
-- das colunas pelos do seu sistema, mantendo os nomes de saída.
--
-- Duas colunas merecem atenção:
--
--   documento  precisa sair SÓ COM DÍGITOS. O site normaliza o CPF/CNPJ antes
--              de enviar ("111.444.777-35" vira "11144477735"), então uma
--              coluna com pontuação nunca casa. Daí o regexp_replace.
--   celular    idem, e o workflow ainda derruba o DDI antes de comparar.

CREATE OR REPLACE VIEW public.clientes_web AS
SELECT
  c.id::text                                     AS id_cliente,
  c.nome                                         AS nome,
  regexp_replace(c.cpf_cnpj, '\D', '', 'g')      AS documento,
  regexp_replace(COALESCE(c.celular, ''), '\D', '', 'g') AS celular,
  lower(trim(COALESCE(c.email, '')))             AS email,
  c.supabase_user_id                             AS supabase_user_id
FROM sua_tabela_de_clientes c
WHERE c.ativo;

-- `supabase_user_id` guarda o `id` do usuário no Supabase, para o fluxo de
-- "Esqueci minha senha" saber se cria ou só redefine a senha. Se a sua tabela
-- ainda não tem essa coluna:
--
--   ALTER TABLE sua_tabela_de_clientes ADD COLUMN supabase_user_id uuid;
--
-- A view precisa ser gravável nessa coluna (o workflow escreve nela depois de
-- criar o usuário). Se preferir não tornar a view gravável, aponte o nó
-- "Guardar supabase_user_id" direto para a tabela real.

-- ---------------------------------------------------------------------------
-- 2. Os códigos de acesso
-- ---------------------------------------------------------------------------
--
-- Um código por linha. O código **não é guardado em claro**: fica só o
-- SHA-256. Quem lê o banco não consegue entrar na conta de ninguém, e a
-- verificação continua funcionando (compara hash com hash).

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
-- 3. Limpeza
-- ---------------------------------------------------------------------------
--
-- Códigos vencidos não servem para nada e são dado pessoal parado. Rode este
-- DELETE num Schedule Trigger diário no n8n, ou num cron do banco:

-- DELETE FROM public.web_codigos_acesso WHERE criado_em < now() - interval '7 days';
