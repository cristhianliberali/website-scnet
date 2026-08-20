-- ---------------------------------------------------------------------------
-- Estruturas que alimentam o PAINEL do cliente (/cliente/painel).
-- ---------------------------------------------------------------------------
--
-- Rode DEPOIS do `schema.sql`, que cria a view `clientes_web` e as tabelas de
-- login. Este arquivo acrescenta o que a tela do painel lê:
--
--   1. Os tipos enumerados
--   2. As colunas novas do cadastro (em `clientes_web`)
--   3. public.contratos_web   os contratos, por código de cliente
--   4. public.faturas_web     as faturas
--   5. Índices
--   6. Um cliente fake completo, para conferir a tela
--
-- Tudo é idempotente: rodar duas vezes não quebra nada e não duplica dado.
--
-- ---------------------------------------------------------------------------
-- TRÊS COLUNAS FORAM ACRESCENTADAS AO QUE FOI PEDIDO
-- ---------------------------------------------------------------------------
--
-- Estão marcadas com `-- [+]` lá embaixo. Sem elas o painel não funciona:
--
--   faturas_web.cod_cliente      sem ela não há como saber de QUEM é a fatura,
--                                e a consulta do painel — que filtra pelo
--                                cliente da sessão — não teria como ser escrita
--   faturas_web.cod_contrato     de qual contrato é a fatura, para o cliente
--                                com mais de um ponto saber o que está pagando
--   faturas_web.data_vencimento  `dia_vencimento` é só o dia (1 a 31). Com ele
--                                sozinho a tela não consegue dizer "vence em
--                                10/08/2026" nem calcular atraso. As duas
--                                colunas coexistem: o dia, como pedido, e a
--                                data cheia da fatura emitida.
--
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Tipos enumerados
-- ---------------------------------------------------------------------------
--
-- Os valores vão em minúsculas para acompanhar o resto do schema
-- (`metodo IN ('sms','whatsapp','email')`). Não faz diferença para a tela: o
-- site normaliza caixa e acento antes de comparar, então 'Ativo' e 'ativo'
-- chegam no mesmo lugar.
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
END $$;

-- ---------------------------------------------------------------------------
-- 2. As colunas novas do cadastro
-- ---------------------------------------------------------------------------
--
-- `clientes_web` é uma VIEW sobre a sua base (veja o `schema.sql`). Então as
-- colunas entram em DOIS passos: primeiro na tabela de verdade, depois na view
-- que a expõe ao portal.
--
-- >>> TROQUE `sua_tabela_de_clientes` pelo nome real da sua tabela. <<<
--
-- Se no seu banco `clientes_web` for uma TABELA e não uma view — é o caso de
-- quem montou um cadastro só para o portal —, rode só o ALTER, apontando para
-- `public.clientes_web`, e pule o CREATE OR REPLACE VIEW.

ALTER TABLE sua_tabela_de_clientes
  ADD COLUMN IF NOT EXISTS data_nascimento date,
  ADD COLUMN IF NOT EXISTS tipo_cadastro   public.tipo_cadastro,
  ADD COLUMN IF NOT EXISTS cep             text,
  ADD COLUMN IF NOT EXISTS uf              char(2),
  ADD COLUMN IF NOT EXISTS cidade          text,
  ADD COLUMN IF NOT EXISTS bairro          text,
  ADD COLUMN IF NOT EXISTS logradouro      text,
  ADD COLUMN IF NOT EXISTS numero          text,
  ADD COLUMN IF NOT EXISTS complemento     text,
  ADD COLUMN IF NOT EXISTS status_cliente  public.status_cliente NOT NULL DEFAULT 'ativo';

-- Preenche o tipo de cadastro de quem já estava na base, pelo tamanho do
-- documento. 11 dígitos é CPF, 14 é CNPJ; o que não for nem um nem outro fica
-- nulo em vez de virar um palpite.
UPDATE sua_tabela_de_clientes
   SET tipo_cadastro = CASE length(regexp_replace(cpf_cnpj, '\D', '', 'g'))
                         WHEN 11 THEN 'cpf'::public.tipo_cadastro
                         WHEN 14 THEN 'cnpj'::public.tipo_cadastro
                       END
 WHERE tipo_cadastro IS NULL;

-- A view, agora com o cadastro completo.
--
-- As colunas antigas continuam nas mesmas posições — `CREATE OR REPLACE VIEW`
-- exige isso, e só deixa ACRESCENTAR no fim. Se você precisar reordenar,
-- `DROP VIEW public.clientes_web;` antes.
--
-- `documento` e `celular` continuam saindo só com dígitos: é assim que o
-- workflow de login compara. Veja a explicação no `schema.sql`.

CREATE OR REPLACE VIEW public.clientes_web AS
SELECT
  c.id::text                                             AS id_cliente,
  c.nome                                                 AS nome,
  regexp_replace(c.cpf_cnpj, '\D', '', 'g')              AS documento,
  regexp_replace(COALESCE(c.celular, ''), '\D', '', 'g') AS celular,
  lower(trim(COALESCE(c.email, '')))                     AS email,
  NULLIF(trim(COALESCE(c.acesso_sac, '')), '')           AS acesso_sac,
  NULLIF(COALESCE(c.senha_sac, ''), '')                  AS senha_sac,
  -- daqui para baixo, o que o painel acrescentou
  c.data_nascimento                                      AS data_nascimento,
  c.tipo_cadastro                                        AS tipo_cadastro,
  regexp_replace(COALESCE(c.cep, ''), '\D', '', 'g')     AS cep,
  upper(COALESCE(c.uf, ''))                              AS uf,
  c.cidade                                               AS cidade,
  c.bairro                                               AS bairro,
  c.logradouro                                           AS logradouro,
  c.numero                                               AS numero,
  c.complemento                                          AS complemento,
  c.status_cliente                                       AS status_cliente
FROM sua_tabela_de_clientes c
WHERE c.ativo;

-- ---------------------------------------------------------------------------
-- 3. Os contratos
-- ---------------------------------------------------------------------------
--
-- Um contrato por linha, ligado ao cliente pelo `cod_cliente` — que é o mesmo
-- valor de `clientes_web.id_cliente`, o que o login guarda na sessão. É por ele
-- que o painel filtra, e o filtro sai do cookie selado, nunca do navegador.
--
-- Sem chave estrangeira de propósito: `clientes_web` é uma view sobre a base do
-- provedor, e uma FK contra ela é impossível. Quem garante a integridade é a
-- rotina que alimenta esta tabela.

CREATE TABLE IF NOT EXISTS public.contratos_web (
  id                       bigserial              PRIMARY KEY,
  cod_cliente              text                   NOT NULL,
  cod_contrato             text                   NOT NULL,
  nome_plano               text,
  valor                    numeric(12,2)          NOT NULL DEFAULT 0,
  status_contrato          public.status_contrato NOT NULL DEFAULT 'ativo',
  status_fatura            public.status_fatura   NOT NULL DEFAULT 'paga',
  velocidade               text,
  -- itens separados por ";" — "Wi-Fi 6 incluso;Paramount+;Suporte 24h"
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
-- 4. As faturas
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.faturas_web (
  id                bigserial            PRIMARY KEY,
  codigo_fatura     text                 NOT NULL,
  cod_cliente       text                 NOT NULL,  -- [+] de quem é a fatura
  cod_contrato      text,                           -- [+] de qual contrato
  status_fatura     public.status_fatura NOT NULL DEFAULT 'aberta',
  descricao         text,
  dia_vencimento    smallint             CHECK (dia_vencimento BETWEEN 1 AND 31),
  data_vencimento   date,                           -- [+] a data cheia
  valor_original    numeric(12,2)        NOT NULL DEFAULT 0,
  -- com juros e multa quando vencida; igual ao original enquanto estiver no prazo
  valor_atual       numeric(12,2)        NOT NULL DEFAULT 0,
  linha_digitavel   text,
  pix_copia_e_cola  text,
  criado_em         timestamptz          NOT NULL DEFAULT now(),
  atualizado_em     timestamptz          NOT NULL DEFAULT now(),
  CONSTRAINT faturas_web_codigo_fatura_key UNIQUE (codigo_fatura)
);

-- ---------------------------------------------------------------------------
-- 5. Índices
-- ---------------------------------------------------------------------------
--
-- Toda consulta do painel começa por "os contratos/faturas DESTE cliente", e é
-- só isso que estes dois índices atendem. As faturas saem da mais nova para a
-- mais velha, que é a ordem em que a tela mostra.

CREATE INDEX IF NOT EXISTS contratos_web_cliente_idx
  ON public.contratos_web (cod_cliente);

CREATE INDEX IF NOT EXISTS faturas_web_cliente_idx
  ON public.faturas_web (cod_cliente, data_vencimento DESC);

CREATE INDEX IF NOT EXISTS faturas_web_contrato_idx
  ON public.faturas_web (cod_contrato);

COMMIT;

-- ---------------------------------------------------------------------------
-- 6. Um cliente fake, para conferir a tela
-- ---------------------------------------------------------------------------
--
-- Um cliente com DOIS contratos e QUATRO faturas, escolhidos para exercitar o
-- painel inteiro de uma vez: um contrato em dia e um bloqueado, uma fatura no
-- prazo, uma vencida com juros, uma paga e uma cancelada (que a tela não deve
-- mostrar). É com ele que dá para ver se cada pedaço da página está lendo o
-- campo certo.
--
-- O login é `demo@scnet.com.br` / `demo1234`.
--
-- >>> Rode só em banco de teste. <<<  Para desfazer, o bloco final apaga tudo.

BEGIN;

-- 6.1 O cliente. Vai na SUA tabela, porque `clientes_web` é uma view.
--     Troque o nome da tabela e ajuste as colunas ao seu cadastro.
INSERT INTO sua_tabela_de_clientes (
  id, nome, cpf_cnpj, celular, email, ativo, acesso_sac, senha_sac,
  data_nascimento, tipo_cadastro, cep, uf, cidade, bairro, logradouro, numero,
  complemento, status_cliente
) VALUES (
  990001,
  'Mariana Duarte Fontana',
  '111.444.777-35',
  '(49) 99912-3456',
  'demo@scnet.com.br',
  true,
  'demo@scnet.com.br',
  'demo1234',
  '1988-04-17',
  'cpf',
  '89801-100',
  'SC',
  'Chapecó',
  'Centro',
  'Avenida Getúlio Dorneles Vargas',
  '1842',
  'Apto 104, Bloco B',
  'ativo'
)
ON CONFLICT (id) DO NOTHING;

-- 6.2 Os contratos.
INSERT INTO public.contratos_web (
  cod_cliente, cod_contrato, nome_plano, valor, status_contrato, status_fatura,
  velocidade, composicao, endereco, dia_vencimento, data_adesao,
  data_vencimento_contrato
) VALUES
(
  '990001',
  'CTR-2024-8841',
  'Ultra Fibra 600 Mega',
  129.90,
  'ativo',
  'aberta',
  '600 Mbps',
  'Roteador Wi-Fi 6 incluso;Instalação grátis;Suporte 24h;Paramount+ por 3 meses',
  'Avenida Getúlio Dorneles Vargas, 1842, Apto 104, Bloco B - Centro, Chapecó/SC - CEP 89801-100',
  10,
  '2022-03-15',
  '2027-03-15'
),
(
  '990001',
  'CTR-2023-4219',
  'Gamer Pro 1 Giga',
  219.90,
  'bloqueado',
  'vencida',
  '1000 Mbps',
  'Wi-Fi 6 Mesh (2 pontos);IP fixo;Upload full duplex;Atendimento prioritário',
  'Rua Marechal Deodoro, 223, Sala 61 - Presidente Médici, Chapecó/SC - CEP 89805-100',
  15,
  '2023-08-10',
  '2026-08-10'
)
ON CONFLICT (cod_contrato) DO NOTHING;

-- 6.3 As faturas.
--
--     Repare no `valor_atual`: só a vencida difere do original, que é o que
--     a tela usa para mostrar quanto de juros e multa entrou.
INSERT INTO public.faturas_web (
  codigo_fatura, cod_cliente, cod_contrato, status_fatura, descricao,
  dia_vencimento, data_vencimento, valor_original, valor_atual,
  linha_digitavel, pix_copia_e_cola
) VALUES
(
  'FAT-2026-000181',
  '990001',
  'CTR-2024-8841',
  'aberta',
  'Mensalidade Agosto/2026',
  10,
  '2026-08-10',
  129.90,
  129.90,
  '34191.79001 01043.510047 91020.150008 5 96510000012990',
  '00020126580014br.gov.bcb.pix0136e4f3404c-7c01-4475-927c-3f9b23b3a1a15204000053039865406129.905802BR5913SCNET INTERNET6008CHAPECO62070503***6304A1B2'
),
(
  'FAT-2026-000164',
  '990001',
  'CTR-2023-4219',
  'vencida',
  'Mensalidade Julho/2026',
  15,
  '2026-07-15',
  219.90,
  234.87,
  '34191.79001 02043.520048 92020.160009 6 96230000023487',
  '00020126580014br.gov.bcb.pix0136e4f3404c-7c01-4475-927c-3f9b23b3a1a25204000053039865406234.875802BR5913SCNET INTERNET6008CHAPECO62070503***6304C7F2'
),
(
  'FAT-2026-000142',
  '990001',
  'CTR-2024-8841',
  'paga',
  'Mensalidade Julho/2026',
  10,
  '2026-07-10',
  129.90,
  129.90,
  '34191.79001 01043.510047 91020.150008 5 96200000012990',
  NULL
),
(
  'FAT-2026-000098',
  '990001',
  'CTR-2024-8841',
  'cancelada',
  'Mensalidade Junho/2026 (refaturada)',
  10,
  '2026-06-10',
  129.90,
  129.90,
  NULL,
  NULL
)
ON CONFLICT (codigo_fatura) DO NOTHING;

COMMIT;

-- Para remover o cliente fake depois:
--
--   DELETE FROM public.faturas_web        WHERE cod_cliente = '990001';
--   DELETE FROM public.contratos_web      WHERE cod_cliente = '990001';
--   DELETE FROM sua_tabela_de_clientes    WHERE id = 990001;
