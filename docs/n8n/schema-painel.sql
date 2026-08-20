-- ---------------------------------------------------------------------------
-- Estruturas que alimentam o PAINEL do cliente (/cliente/painel).
-- ---------------------------------------------------------------------------
--
-- Escrito para o banco que já está no ar, onde `public.clientes_web` é uma
-- TABELA (e não a view que o `schema.sql` propõe como alternativa). Ela não é
-- recriada nem convertida: só ganha colunas.
--
-- O que este arquivo faz:
--
--   1. Os tipos enumerados
--   2. As colunas novas em public.clientes_web
--   3. A chave primária de clientes_web (id_cliente)
--   4. public.contratos_web   os contratos, por código de cliente
--   5. public.faturas_web     as faturas
--   6. public.planos_web      o catálogo de planos (home + troca de plano)
--   7. Índices
--   8. Um cliente fake completo, para conferir a tela  ← opcional, só em teste
--   9. Limpeza de uma tabela que ficou sem uso
--
-- Tudo é idempotente: rodar duas vezes não quebra nada e não duplica dado.
--
-- ---------------------------------------------------------------------------
-- TRÊS COLUNAS FORAM ACRESCENTADAS AO QUE FOI PEDIDO
-- ---------------------------------------------------------------------------
--
-- Estão marcadas com `-- [+]` na seção 5. Sem elas o painel não funciona:
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
-- `clientes_web` continua exatamente a tabela que já é. As sete colunas atuais
-- (id_cliente, nome, documento, celular, email, acesso_sac, senha_sac) não são
-- tocadas — estas dez entram no fim.
--
-- As larguras acompanham o estilo da tabela: `varchar` com limite, como em
-- `nome varchar(150)`, e não `text` solto.

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

-- Preenche o tipo de cadastro de quem já está na base, pelo tamanho do
-- documento. 11 dígitos é CPF, 14 é CNPJ; o que não for nem um nem outro fica
-- nulo em vez de virar um palpite.
UPDATE public.clientes_web
   SET tipo_cadastro = CASE length(regexp_replace(documento, '\D', '', 'g'))
                         WHEN 11 THEN 'cpf'::public.tipo_cadastro
                         WHEN 14 THEN 'cnpj'::public.tipo_cadastro
                       END
 WHERE tipo_cadastro IS NULL;

-- ---------------------------------------------------------------------------
-- 3. A chave primária de clientes_web
-- ---------------------------------------------------------------------------
--
-- As chaves estrangeiras da seção 4 e 5 precisam que `id_cliente` seja único.
-- Se a tabela já tem PK ou UNIQUE nessa coluna, nada acontece aqui.
--
-- Se o comando falhar por duplicidade, o problema é de dado, não de migração:
-- dois clientes com o mesmo `id_cliente` significam que uma sessão poderia
-- abrir o painel do outro. Vale corrigir antes de seguir.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
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
END $$;

-- ---------------------------------------------------------------------------
-- 4. Os contratos
-- ---------------------------------------------------------------------------
--
-- Um contrato por linha, ligado ao cliente pelo `cod_cliente` — que é o mesmo
-- valor de `clientes_web.id_cliente`, o que o login guarda na sessão. É por ele
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
-- 5. As faturas
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.faturas_web (
  id                bigserial            PRIMARY KEY,
  codigo_fatura     text                 NOT NULL,
  cod_cliente       text                 NOT NULL,  -- [+] de quem é a fatura
  cod_contrato      text,                           -- [+] de qual contrato
  status_fatura     public.status_fatura NOT NULL DEFAULT 'aberta',
  descricao         varchar(180),
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

-- As chaves estrangeiras, em bloco à parte para o arquivo poder rodar de novo
-- sem reclamar que a restrição já existe.
--
-- ON DELETE CASCADE: apagar um cliente leva contratos e faturas junto. É o que
-- se quer de um cadastro do portal — deixar a fatura de um cliente que não
-- existe mais é guardar dado pessoal que ninguém vai olhar.
--
-- ON UPDATE CASCADE porque `id_cliente` é texto: se um dia a numeração do
-- cadastro mudar, os filhos acompanham em vez de virarem órfãos.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contratos_web_cliente_fkey'
  ) THEN
    ALTER TABLE public.contratos_web
      ADD CONSTRAINT contratos_web_cliente_fkey
      FOREIGN KEY (cod_cliente) REFERENCES public.clientes_web (id_cliente)
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'faturas_web_cliente_fkey'
  ) THEN
    ALTER TABLE public.faturas_web
      ADD CONSTRAINT faturas_web_cliente_fkey
      FOREIGN KEY (cod_cliente) REFERENCES public.clientes_web (id_cliente)
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  /*
   * A fatura aponta para o contrato, mas com ON DELETE SET NULL: um contrato
   * encerrado e removido não deve apagar o histórico de cobrança junto — a
   * fatura continua valendo para o cliente, só deixa de ter contrato.
   */
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'faturas_web_contrato_fkey'
  ) THEN
    ALTER TABLE public.faturas_web
      ADD CONSTRAINT faturas_web_contrato_fkey
      FOREIGN KEY (cod_contrato) REFERENCES public.contratos_web (cod_contrato)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. O catálogo de planos
-- ---------------------------------------------------------------------------
--
-- Alimenta DOIS lugares: a grade de planos da home e o modal "Trocar de plano"
-- do painel. Sem esta tabela a home fica sem planos (e diz isso no log do
-- servidor) e o modal de troca mostra o estado vazio.
--
-- As colunas são as que o site já consulta — veja `src/lib/planos-db.ts`.
--
--   composicao          os itens do plano, separados por ";"
--   url_logo_agregados  as logos dos agregados, também separadas por ";"
--   codigo_oferta       deixa o plano restrito a uma campanha: ele só aparece
--                       quando a URL traz ?codigo_oferta= com o mesmo valor
--   ordem_grade         a ordem em que os cards saem na tela

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

-- ---------------------------------------------------------------------------
-- 7. Índices
-- ---------------------------------------------------------------------------
--
-- Toda consulta do painel começa por "os contratos/faturas DESTE cliente", e é
-- só isso que os dois primeiros atendem. As faturas saem da mais nova para a
-- mais velha, que é a ordem em que a tela mostra.

CREATE INDEX IF NOT EXISTS contratos_web_cliente_idx
  ON public.contratos_web (cod_cliente);

CREATE INDEX IF NOT EXISTS faturas_web_cliente_idx
  ON public.faturas_web (cod_cliente, data_vencimento DESC);

CREATE INDEX IF NOT EXISTS faturas_web_contrato_idx
  ON public.faturas_web (cod_contrato);

CREATE INDEX IF NOT EXISTS planos_web_grade_idx
  ON public.planos_web (ativo, ordem_grade);

COMMIT;

-- ---------------------------------------------------------------------------
-- 8. Um cliente fake, para conferir a tela           ← RODE SÓ EM BANCO DE TESTE
-- ---------------------------------------------------------------------------
--
-- Daqui para baixo é dado de mentira. A estrutura acima já está pronta: se
-- você está aplicando em produção, PARE NO COMMIT ACIMA.
--
-- Um cliente com DOIS contratos e QUATRO faturas, escolhidos para exercitar o
-- painel inteiro de uma vez: um contrato em dia e um bloqueado, uma fatura no
-- prazo, uma vencida com juros, uma paga e uma cancelada (que a tela não deve
-- mostrar). É com ele que dá para ver se cada pedaço da página lê o campo certo.
--
-- O login é `demo@scnet.com.br` / `demo1234`.
--
-- ATENÇÃO AO FORMATO: `documento` e `celular` vão SÓ COM DÍGITOS. Antes havia
-- uma view fazendo `regexp_replace` na leitura; numa tabela, o que está gravado
-- é o que o login compara — e o site sempre manda dígito puro. Um CPF pontuado
-- cabe no varchar(14) e nunca casaria.

BEGIN;

INSERT INTO public.clientes_web (
  id_cliente, nome, documento, celular, email, acesso_sac, senha_sac,
  data_nascimento, tipo_cadastro, cep, uf, cidade, bairro, logradouro, numero,
  complemento, status_cliente
) VALUES (
  '990001',
  'Mariana Duarte Fontana',
  '11144477735',
  '49999123456',
  'demo@scnet.com.br',
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
ON CONFLICT (id_cliente) DO NOTHING;

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

-- Repare no `valor_atual`: só a vencida difere do original, e é essa diferença
-- que a tela mostra como juros e multa.
INSERT INTO public.faturas_web (
  codigo_fatura, cod_cliente, cod_contrato, status_fatura, descricao,
  dia_vencimento, data_vencimento, valor_original, valor_atual,
  linha_digitavel, pix_copia_e_cola
) VALUES
(
  'FAT-2026-000181', '990001', 'CTR-2024-8841', 'aberta',
  'Mensalidade Agosto/2026', 10, '2026-08-10', 129.90, 129.90,
  '34191.79001 01043.510047 91020.150008 5 96510000012990',
  '00020126580014br.gov.bcb.pix0136e4f3404c-7c01-4475-927c-3f9b23b3a1a15204000053039865406129.905802BR5913SCNET INTERNET6008CHAPECO62070503***6304A1B2'
),
(
  'FAT-2026-000164', '990001', 'CTR-2023-4219', 'vencida',
  'Mensalidade Julho/2026', 15, '2026-07-15', 219.90, 234.87,
  '34191.79001 02043.520048 92020.160009 6 96230000023487',
  '00020126580014br.gov.bcb.pix0136e4f3404c-7c01-4475-927c-3f9b23b3a1a25204000053039865406234.875802BR5913SCNET INTERNET6008CHAPECO62070503***6304C7F2'
),
(
  'FAT-2026-000142', '990001', 'CTR-2024-8841', 'paga',
  'Mensalidade Julho/2026', 10, '2026-07-10', 129.90, 129.90,
  '34191.79001 01043.510047 91020.150008 5 96200000012990', NULL
),
(
  'FAT-2026-000098', '990001', 'CTR-2024-8841', 'cancelada',
  'Mensalidade Junho/2026 (refaturada)', 10, '2026-06-10', 129.90, 129.90,
  NULL, NULL
)
ON CONFLICT (codigo_fatura) DO NOTHING;

-- Três planos, para o modal "Trocar de plano" ter o que mostrar.
INSERT INTO public.planos_web (
  id_plano, ativo, ordem_grade, destaque, nome, descricao, valor,
  composicao_resumo, composicao, nome_destaque
) VALUES
(
  1, true, 1, false, 'Fibra Essencial 300 Mega',
  'Para quem usa a internet no dia a dia.', 89.90,
  'Wi-Fi 5 e suporte 24h',
  'Wi-Fi 5 Dual-Band incluso;Instalação grátis;Suporte 24h;Download ilimitado',
  'Econômico'
),
(
  2, true, 2, true, 'Ultra Fibra 600 Mega',
  'O mais pedido: sobra banda para streaming e trabalho.', 129.90,
  'Wi-Fi 6 e Paramount+',
  'Roteador Wi-Fi 6 Gigabit;Paramount+ incluso;Sem taxa de adesão;Prioridade para 4K',
  'Mais popular'
),
(
  3, true, 3, false, 'Gamer Pro 1 Giga',
  'Latência baixa e upload simétrico.', 219.90,
  'Mesh, IP fixo e full duplex',
  'Wi-Fi 6 Mesh (2 pontos);IP fixo;Upload full duplex;Atendimento prioritário',
  'Performance'
)
ON CONFLICT (id_plano) DO NOTHING;

COMMIT;

-- Para remover o cliente fake depois — as faturas e os contratos saem junto,
-- pelo ON DELETE CASCADE:
--
--   DELETE FROM public.clientes_web WHERE id_cliente = '990001';
--   DELETE FROM public.planos_web   WHERE id_plano IN (1, 2, 3);

-- ---------------------------------------------------------------------------
-- 9. Uma tabela que ficou sem uso
-- ---------------------------------------------------------------------------
--
-- `web_credenciais` guardava a senha do portal, de quando o site tinha senha
-- própria. Hoje quem autentica é o par `acesso_sac`/`senha_sac` do cadastro, e
-- nenhum nó do workflow lê essa tabela. O que sobrou ali é hash de senha
-- parado — dado sensível que ninguém consulta.
--
-- Confira que está mesmo vazia ou obsoleta antes de apagar:
--
--   SELECT count(*) FROM public.web_credenciais;
--   DROP TABLE IF EXISTS public.web_credenciais;
