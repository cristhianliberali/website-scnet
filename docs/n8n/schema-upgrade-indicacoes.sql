-- ---------------------------------------------------------------------------
-- Duas tabelas novas do painel: planos_upgrade e indicacoes_web.
-- ---------------------------------------------------------------------------
--
-- Roda depois de `schema-painel.sql`, que é quem cria `clientes_web`,
-- `contratos_web`, `faturas_web` e `planos_web`. As chaves estrangeiras daqui
-- apontam para as duas primeiras.
--
-- O que este arquivo faz:
--
--   1. public.planos_upgrade   o catálogo da troca de plano do painel
--   2. Os tipos enumerados da indicação
--   3. public.indicacoes_web   as indicações feitas pelo cliente
--   4. O protocolo automático
--   5. Índices
--   6. Dado de exemplo                        ← opcional, só em teste
--
-- Tudo é idempotente: rodar duas vezes não quebra nada e não duplica dado.
--
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. O catálogo da troca de plano
-- ---------------------------------------------------------------------------
--
-- `planos_web` alimenta a HOME e a /contratacao: são os planos de venda, com
-- preço de campanha, primeira fatura promocional e oferta amarrada a um código.
-- Nada disso vale para quem já é cliente e quer subir de velocidade — e era
-- justamente essa lista que o painel mostrava.
--
-- `planos_upgrade` é a lista do painel, e só dela. As colunas são as mesmas de
-- `planos_web`, menos `codigo_oferta`: aqui não existe plano restrito a
-- campanha, porque não há URL com `?codigo_oferta=` no meio do caminho — quem
-- chega já entrou com login.
--
-- `codigo_oferta_mk` FICOU. Ele não é a restrição de campanha: é o número da
-- oferta no MK, o que o n8n usa para efetivar a troca no sistema do provedor.
-- Sem ele, o pedido de upgrade chega do outro lado sem dizer para qual oferta.
--
-- A regra de quem aparece na tela NÃO está aqui: o painel só oferece plano de
-- valor igual ou maior que o do contrato atual (veja `TelaTrocarPlano`). Uma
-- linha de valor menor nesta tabela não é erro — ela simplesmente não é
-- oferecida a quem já paga mais, e continua disponível para quem paga menos.

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
  -- os itens do plano, separados por ";" — "Wi-Fi 6 incluso;Skeelo;Suporte 24h"
  composicao              text,
  -- as logos dos agregados, também separadas por ";"
  url_logo_agregados      text,
  nome_destaque           varchar(60),
  codigo_oferta_mk        bigint
);

COMMENT ON TABLE public.planos_upgrade IS
  'Planos oferecidos na troca de plano do painel do cliente. Separada de '
  'planos_web (home/contratação) de propósito: preço de campanha e oferta '
  'restrita não valem para quem já é cliente.';

-- ---------------------------------------------------------------------------
-- 2. Os tipos enumerados da indicação
-- ---------------------------------------------------------------------------
--
-- `CREATE TYPE` não aceita `IF NOT EXISTS`, daí o bloco.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_indicacao') THEN
    CREATE TYPE public.status_indicacao AS ENUM
      ('em_aberto', 'sem_sucesso', 'dados_invalidos', 'concluido');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tipo_bonus_indicacao') THEN
    CREATE TYPE public.tipo_bonus_indicacao AS ENUM
      ('desconto_fatura', 'premio', 'pix');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. As indicações
-- ---------------------------------------------------------------------------
--
-- Uma linha por indicação feita no painel. Ela nasce com o que o cliente sabe
-- (nome, telefone e cidade do amigo) e é COMPLETADA depois, quando o comercial
-- fecha ou descarta: `cod_novo_cliente`, `cod_contrato_novo_cliente`, o bônus
-- e o status. Por isso quase tudo aqui é anulável — o preenchimento acontece em
-- dois momentos, e exigir na entrada um dado que só existe no fim travaria o
-- formulário.
--
-- As duas pontas ficam ligadas ao cadastro:
--
--   id_cliente                 quem indicou   -> clientes_web.id_cliente
--   cod_novo_cliente           quem foi indicado, depois que virou cliente
--   cod_contrato_novo_cliente  o contrato instalado -> contratos_web.cod_contrato
--
-- É o que permite responder, sem cruzar planilha, "esta indicação virou qual
-- contrato?" e "quanto este cliente já ganhou indicando?".

CREATE TABLE IF NOT EXISTS public.indicacoes_web (
  id                        bigserial                    PRIMARY KEY,
  -- o número que o cliente cita ao perguntar pela indicação
  protocolo                 varchar(30)                  NOT NULL,
  id_cliente                text                         NOT NULL,
  -- preenchidos depois, quando a indicação vira cliente de verdade
  cod_novo_cliente          text,
  cod_contrato_novo_cliente text,
  nome_cliente              varchar(150),
  nome_indicacao            varchar(150)                 NOT NULL,
  -- só dígitos e com DDI, do jeito que o site manda: 5549999998888
  telefone_indicacao        varchar(20)                  NOT NULL,
  cidade                    varchar(120),
  observacoes               text,
  data                      timestamptz                  NOT NULL DEFAULT now(),
  status                    public.status_indicacao      NOT NULL DEFAULT 'em_aberto',
  tipo_bonus                public.tipo_bonus_indicacao,
  descricao_bonus           text,
  -- usado quando o bônus é pago em PIX
  valor_indicacao           numeric(12,2),
  criado_em                 timestamptz                  NOT NULL DEFAULT now(),
  atualizado_em             timestamptz                  NOT NULL DEFAULT now(),
  CONSTRAINT indicacoes_web_protocolo_key UNIQUE (protocolo),
  /*
   * O valor só faz sentido no bônus em dinheiro. A restrição evita a linha
   * meio preenchida — "prêmio de R$ 50,00" — que ninguém sabe depois se era
   * para pagar ou para entregar.
   */
  CONSTRAINT indicacoes_web_valor_ck CHECK (
    valor_indicacao IS NULL OR tipo_bonus IN ('pix', 'desconto_fatura')
  )
);

COMMENT ON COLUMN public.indicacoes_web.valor_indicacao IS
  'Quanto a indicação vale em dinheiro. Usado quando tipo_bonus = pix (ou '
  'desconto_fatura); para premio, quem descreve é descricao_bonus.';

-- As chaves estrangeiras em bloco à parte, para o arquivo poder rodar de novo
-- sem reclamar que a restrição já existe.
--
-- Quem indicou sai junto do cadastro (CASCADE): é dado dele. Já o indicado e o
-- contrato dele apenas se desligam (SET NULL) — apagar um contrato não deve
-- levar embora o histórico de quem ganhou bônus por ele.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'indicacoes_web_cliente_fkey'
  ) THEN
    ALTER TABLE public.indicacoes_web
      ADD CONSTRAINT indicacoes_web_cliente_fkey
      FOREIGN KEY (id_cliente) REFERENCES public.clientes_web (id_cliente)
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'indicacoes_web_novo_cliente_fkey'
  ) THEN
    ALTER TABLE public.indicacoes_web
      ADD CONSTRAINT indicacoes_web_novo_cliente_fkey
      FOREIGN KEY (cod_novo_cliente) REFERENCES public.clientes_web (id_cliente)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'indicacoes_web_novo_contrato_fkey'
  ) THEN
    ALTER TABLE public.indicacoes_web
      ADD CONSTRAINT indicacoes_web_novo_contrato_fkey
      FOREIGN KEY (cod_contrato_novo_cliente) REFERENCES public.contratos_web (cod_contrato)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. O protocolo automático
-- ---------------------------------------------------------------------------
--
-- O protocolo é único e o cliente o vê na hora do envio. Deixar cada fluxo
-- inventar o seu é onde nascem as duplicidades — dois `INSERT` no mesmo segundo
-- geram o mesmo número e o segundo estoura. Aqui o banco resolve: quem grava
-- pode simplesmente não mandar a coluna.
--
-- O formato é `IND-AAAAMM-000123`: legível ao telefone e ordenável por mês.

CREATE SEQUENCE IF NOT EXISTS public.indicacoes_web_protocolo_seq;

CREATE OR REPLACE FUNCTION public.proximo_protocolo_indicacao()
RETURNS varchar
LANGUAGE sql
VOLATILE
AS $$
  SELECT 'IND-' || to_char(now(), 'YYYYMM') || '-' ||
         lpad(nextval('public.indicacoes_web_protocolo_seq')::text, 6, '0');
$$;

ALTER TABLE public.indicacoes_web
  ALTER COLUMN protocolo SET DEFAULT public.proximo_protocolo_indicacao();

-- `atualizado_em` que se atualiza sozinho: o status muda várias vezes ao longo
-- da vida da indicação, e quem opera precisa saber quando foi a última.
CREATE OR REPLACE FUNCTION public.tocar_atualizado_em()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS indicacoes_web_atualizado_em ON public.indicacoes_web;
CREATE TRIGGER indicacoes_web_atualizado_em
  BEFORE UPDATE ON public.indicacoes_web
  FOR EACH ROW EXECUTE FUNCTION public.tocar_atualizado_em();

-- ---------------------------------------------------------------------------
-- 5. Índices
-- ---------------------------------------------------------------------------
--
-- A consulta do painel é sempre "as indicações DESTE cliente, da mais nova para
-- a mais velha". As outras duas atendem quem opera: a fila do que está em
-- aberto e a busca pelo telefone que ligou.

CREATE INDEX IF NOT EXISTS indicacoes_web_cliente_idx
  ON public.indicacoes_web (id_cliente, data DESC);

CREATE INDEX IF NOT EXISTS indicacoes_web_status_idx
  ON public.indicacoes_web (status, data DESC);

CREATE INDEX IF NOT EXISTS indicacoes_web_telefone_idx
  ON public.indicacoes_web (telefone_indicacao);

CREATE INDEX IF NOT EXISTS planos_upgrade_grade_idx
  ON public.planos_upgrade (ativo, ordem_grade);

COMMIT;

-- ---------------------------------------------------------------------------
-- 6. Dado de exemplo                                 ← RODE SÓ EM BANCO DE TESTE
-- ---------------------------------------------------------------------------
--
-- Daqui para baixo é dado de mentira, casado com o cliente fake `990001` da
-- seção 8 de `schema-painel.sql`. A estrutura acima já está pronta: se você está
-- aplicando em produção, PARE NO COMMIT ACIMA.
--
-- Os quatro planos cobrem a regra de exibição: com o contrato de R$ 129,90 na
-- tela, o de 300 Mega não aparece (é downgrade) e os outros três sim.

BEGIN;

INSERT INTO public.planos_upgrade (
  id_plano, ativo, ordem_grade, destaque, nome, descricao, valor,
  composicao_resumo, composicao, nome_destaque, codigo_oferta_mk
) VALUES
(
  1, true, 1, false, 'Fibra Essencial 300 Mega',
  'Para quem usa a internet no dia a dia.', 89.90,
  'Wi-Fi 5 e suporte 24h',
  'Internet fibra óptica;300 Mega de velocidade;1x Roteador Wi-Fi 5;App Skeelo',
  NULL, NULL
),
(
  2, true, 2, false, 'Ultra Fibra 600 Mega',
  'Sobra banda para streaming e trabalho.', 149.90,
  'Wi-Fi 6 e Skeelo',
  'Internet fibra óptica;600 Mega de velocidade;1x Roteador Wi-Fi 6 Incluso;App Skeelo',
  NULL, NULL
),
(
  3, true, 3, true, 'Ultra Fibra 800 Mega',
  'O mais escolhido de quem sobe de plano.', 179.90,
  'Wi-Fi 6 e Skeelo',
  'Internet fibra óptica;800 Mega de velocidade;1x Roteador Wi-Fi 6 Incluso;App Skeelo',
  'Mais escolhido', NULL
),
(
  4, true, 4, false, 'Gamer Pro 1 Giga',
  'Latência baixa e upload simétrico.', 219.90,
  'Mesh, IP fixo e full duplex',
  'Internet fibra óptica;1 Giga de velocidade;2x Roteadores Wi-Fi 6 Inclusos;App Skeelo',
  'Performance', NULL
)
ON CONFLICT (id_plano) DO NOTHING;

-- Três indicações, uma em cada estágio: uma esperando contato, uma que virou
-- contrato e rendeu PIX, e uma que não deu certo.
INSERT INTO public.indicacoes_web (
  protocolo, id_cliente, cod_novo_cliente, cod_contrato_novo_cliente,
  nome_cliente, nome_indicacao, telefone_indicacao, cidade, observacoes,
  data, status, tipo_bonus, descricao_bonus, valor_indicacao
) VALUES
(
  'IND-202608-000001', '990001', NULL, NULL,
  'Mariana Duarte Fontana', 'Pedro Henrique Alves', '5549999887766', 'Chapecó',
  'Prefere ser chamado depois das 18h.',
  '2026-08-12 09:20:00-03', 'em_aberto', NULL, NULL, NULL
),
(
  'IND-202607-000002', '990001', NULL, NULL,
  'Mariana Duarte Fontana', 'Carla Beatriz Souza', '5549998776655', 'Maravilha',
  NULL,
  '2026-07-02 14:05:00-03', 'concluido', 'pix', 'PIX de bônus por indicação', 50.00
),
(
  'IND-202606-000003', '990001', NULL, NULL,
  'Mariana Duarte Fontana', 'João Vitor Lima', '5549997665544', 'Chapecó',
  'Sem cobertura no endereço informado.',
  '2026-06-18 11:40:00-03', 'sem_sucesso', NULL, NULL, NULL
)
ON CONFLICT (protocolo) DO NOTHING;

-- A sequência do protocolo começa em 1: os exemplos acima já usaram 1, 2 e 3,
-- então ela avança para não colidir com eles no primeiro envio real.
SELECT setval('public.indicacoes_web_protocolo_seq', 3, true);

COMMIT;

-- Para remover o dado de exemplo depois:
--
--   DELETE FROM public.indicacoes_web WHERE id_cliente = '990001';
--   DELETE FROM public.planos_upgrade WHERE id_plano IN (1, 2, 3, 4);
