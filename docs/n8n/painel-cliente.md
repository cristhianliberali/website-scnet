# Painel do cliente — contrato do webhook

O que o site manda e o que o n8n precisa devolver em `/cliente/painel`.

Tudo aqui acontece **depois do login**, no mesmo `WEBHOOK_LOGIN_URL` dos eventos
de autenticação. O contrato do login está no `.env.example`; este documento
cobre só o painel.

## Índice

- [Duas fontes: o banco e o webhook](#duas-fontes-o-banco-e-o-webhook)
- [Como um evento do painel chega](#como-um-evento-do-painel-chega)
- [O carregamento inicial e o cache](#o-carregamento-inicial-e-o-cache)
- [Consultas](#consultas)
  - [`painel_bootstrap`](#painel_bootstrap)
  - [Recargas por seção](#recargas-por-seção)
- [Formulários](#formulários)
- [Regras que valem para todas as respostas](#regras-que-valem-para-todas-as-respostas)

---

## Duas fontes: o banco e o webhook

O painel lê de dois lugares, e a divisão segue o que cada um faz melhor:

| O quê                                                           | De onde          |
| --------------------------------------------------------------- | ---------------- |
| **Consulta de abertura** (cadastro, contratos, faturas, planos) | Postgres, direto |
| **Formulários** (abrir chamado, trocar de plano, segunda via…)  | n8n, sempre      |

Dado que já está numa tabela nossa não precisa de um salto até o n8n para
voltar. Ação, sim: quem fala com o ERP, o gateway de pagamento e o WhatsApp é o
fluxo, e é lá que ela continua.

**Não há reserva pelo webhook.** Uma falha de leitura (tabela ausente, conexão
fora do ar, cliente que não está no cadastro) vira **erro na tela**, com o
motivo no log. Antes ela caía para o n8n em silêncio, e a tela carregava vazia
— o que fez um banco mal configurado passar dias sem ser notado. Falhar visível
é melhor que suceder errado.

Na prática isso quer dizer que **o site não manda mais nenhum evento de
consulta**. Os únicos eventos que chegam ao n8n são os de login e os catorze de
formulário.

**O que autoriza a consulta ao banco.** O `id_cliente` sai do cookie de sessão,
que é selado e foi escrito pelo n8n no login. O navegador não o lê nem o forja,
e nenhuma função aceita um id vindo do formulário — daí um `WHERE cod_cliente =
$1` bastar para ninguém enxergar o cliente do vizinho.

**O que o banco ainda não tem.** As tabelas de hoje cobrem cadastro, contratos,
faturas e o catálogo de planos. Notas fiscais, indicações e chamados voltam
vazios, e a tela mostra o estado vazio de cada um — até existirem as tabelas
correspondentes.

O schema está em [`schema-painel.sql`](./schema-painel.sql).

---

## Como um evento do painel chega

Todo POST tem o mesmo envelope. `evento` é o que o Switch do n8n usa para
rotear; `dados` muda de evento para evento.

```json
{
  "evento": "painel_bootstrap",
  "id_sessao": "6f1c8c1e-...",
  "id_requisicao": "b3a0e2d4-...",
  "page": "/cliente",
  "submitted_at": "2026-08-19T14:32:05.412Z",
  "recaptcha_score": 0.9,
  "token": "o-token-emitido-no-login",
  "id_cliente": "84920",
  "dados": { "secao": "bootstrap" }
}
```

`token` e `id_cliente` só aparecem nos eventos do painel — são a credencial que
o login emitiu. Eles vão **no corpo**, e não em um header, porque o corpo é o
que a assinatura HMAC cobre.

Cada requisição também leva:

| Header               | Conteúdo                                             |
| -------------------- | ---------------------------------------------------- |
| `Authorization`      | `Bearer <WEBHOOK_LOGIN_TOKEN>`                       |
| `X-SCNET-Timestamp`  | segundos desde a época                               |
| `X-SCNET-Assinatura` | `HMAC_SHA256(token, "<timestamp>.<corpo cru>")`, hex |

> **Quem manda é o token, não o `id_cliente`.** O `id_cliente` viaja junto por
> conveniência do fluxo, mas ele sai do cookie do site e nunca do formulário.
> Confira no n8n que o token e o `id_cliente` pertencem um ao outro em vez de
> confiar no id recebido.

---

## O carregamento inicial e o cache

Depois de autenticar, o site dispara **uma** consulta — `painel_bootstrap` — que
traz o painel inteiro. Não são sete chamadas: é uma, e ela monta a tela toda.

Onde o resultado fica guardado, e por quanto tempo:

| Camada               | Prazo                         | Some quando                                             |
| -------------------- | ----------------------------- | ------------------------------------------------------- |
| TanStack Query (aba) | 5 min                         | recarregar a página, fechar a aba, clicar "Atualizar"   |
| Memória do servidor  | 60 s (`PAINEL_CACHE_SECONDS`) | formulário que muda algo, logout, reinício do container |

Na prática:

- **Abrir e fechar modais não custa nada.** A tela lê do cache da aba.
- **Um F5 costuma não chegar ao n8n.** O cache do servidor responde.
- **Todo formulário que muda algo derruba o que ele afeta.** Quem trocou de
  plano não fica um minuto vendo o plano antigo.
- **Formulário que não muda nada não recarrega nada** — diagnóstico,
  viabilidade e teste de velocidade não disparam consulta nenhuma depois.
- **O botão "Atualizar" passa por cima dos dois caches** (`forcar: true` no
  corpo do `painel_bootstrap`).

**Você pode evitar até essa recarga.** Se a resposta de um formulário já vier
com as listas atualizadas, o site as usa direto e não faz a consulta seguinte.
Veja [Resposta que já traz o painel](#resposta-que-já-traz-o-painel).

---

## Consultas

### `painel_bootstrap`

**Envio**

```json
{ "evento": "painel_bootstrap", "dados": { "secao": "bootstrap" } }
```

Com `forcar: true` no envelope quando o cliente clicou em "Atualizar".

**Resposta esperada** — este é o JSON completo que a tela consome. Nenhuma
chave é obrigatória: o que faltar vira vazio, e a seção correspondente mostra o
estado vazio em vez de quebrar.

```json
{
  "status": "ok",
  "dados": {
    "cliente": {
      "id": "84920",
      "nome": "Lucas Oliveira Mendes",
      "documento": "341.***.***-05",
      "email": "lucas@email.com",
      "telefone": "(49) 99845-1920",
      "codigo": "CLI-94821",
      "cliente_desde": "2022-03-14",
      "codigo_indicacao": "LUCAS50FIBRA",
      "link_indicacao": "https://scnet.com.br/indique/LUCAS50FIBRA",
      "desconto_acumulado": 150.0
    },

    "contratos": [
      {
        "id": "ctr_01",
        "numero": "CTR-2024-8841",
        "apelido": "Residência principal",
        "endereco": {
          "cep": "89800-000",
          "logradouro": "Av. Getúlio Vargas",
          "numero": "1842",
          "complemento": "Apto 104",
          "bairro": "Centro",
          "cidade": "Chapecó",
          "uf": "SC"
        },
        "plano": "Ultra Fibra 600 Mega",
        "download": "600 Mbps",
        "upload": "300 Mbps",
        "valor_mensal": 129.9,
        "status_financeiro": "em_dia",
        "status_conexao": "online",
        "dia_vencimento": 10,
        "ssid_wifi": "SCNET_Lucas_5G",
        "roteador": "Huawei AX3",
        "ip": "177.136.94.212",
        "instalado_em": "2022-03-15",
        "tecnologia": "Fibra óptica GPON"
      }
    ],

    "faturas": [
      {
        "id": "inv_01",
        "id_contrato": "ctr_01",
        "referencia": "Agosto/2026",
        "vencimento": "2026-08-10",
        "valor": 129.9,
        "status": "aberto",
        "linha_digitavel": "34191.79001 01043.510047 91020.150008 5 96510000012990",
        "pix_copia_e_cola": "00020126580014br.gov.bcb.pix0136...",
        "url_boleto": "https://.../boleto/inv_01.pdf",
        "pago_em": ""
      }
    ],

    "notas_fiscais": [
      {
        "id": "nfe_01",
        "numero": "000.419.821",
        "serie": "U-21",
        "referencia": "Julho/2026",
        "emitida_em": "2026-07-10",
        "valor": 129.9,
        "numero_contrato": "CTR-2024-8841",
        "cfop": "5.303",
        "chave_verificacao": "3526.0209.4182.1001.5521",
        "url_danfe": "https://.../nfse/000419821.pdf"
      }
    ],

    "indicacoes": [
      {
        "id": "ref_01",
        "nome": "Carolina Silveira",
        "telefone": "(49) 97123-8899",
        "data": "2026-07-12",
        "status": "instalado",
        "desconto": 50.0
      }
    ],

    "chamados": [
      {
        "id": "tkt_01",
        "protocolo": "20260818-94182",
        "id_contrato": "ctr_01",
        "categoria": "Otimização de Wi-Fi",
        "assunto": "Alcance no segundo piso",
        "descricao": "Sinal fraco nos cômodos do fundo.",
        "status": "resolvido",
        "aberto_em": "2026-08-18",
        "agendado_para": ""
      }
    ],

    "planos": [
      {
        "id": "plano_600",
        "nome": "Ultra Fibra 600 Mega",
        "download": "600 Mbps",
        "upload": "300 Mbps",
        "valor": 129.9,
        "vantagens": ["Roteador Wi-Fi 6", "Sem taxa de adesão"],
        "destaque": true,
        "selo": "Mais popular"
      }
    ],

    "adicionais": [
      {
        "id": "mesh",
        "nome": "Ponto Wi-Fi Mesh extra",
        "descricao": "Cobre os cômodos mais distantes",
        "valor": 19.9
      }
    ],

    "avisos": [
      {
        "id": "av_01",
        "titulo": "Manutenção programada",
        "texto": "Dia 22/08, das 2h às 4h, no bairro Centro.",
        "tipo": "alerta"
      }
    ],

    "desbloqueio_disponivel": true
  }
}
```

#### Valores aceitos nos campos de status

O site normaliza antes de exibir, então maiúsculas, acentos e as variações mais
comuns funcionam. O que ele não reconhecer cai no padrão da coluna.

| Campo                           | Valores                                                      | Também aceita                                                          | Padrão     |
| ------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- | ---------- |
| `contratos[].status_financeiro` | `em_dia`, `em_aberto`, `vencido`                             | `adimplente`, `pago`, `aberto`, `pendente`, `atrasado`, `inadimplente` | `em_dia`   |
| `contratos[].status_conexao`    | `online`, `alerta`, `offline`                                | `ativo`, `conectado`, `instavel`, `suspenso`, `bloqueado`              | `online`   |
| `faturas[].status`              | `pago`, `aberto`, `vencido`                                  | `paga`, `liquidado`, `quitado`, `em_aberto`, `pendente`, `vencida`     | `aberto`   |
| `indicacoes[].status`           | `pendente`, `em_instalacao`, `instalado`, `cancelado`        | `aguardando`, `agendado`, `concluido`, `recusado`                      | `pendente` |
| `chamados[].status`             | `aberto`, `em_analise`, `agendado`, `resolvido`, `cancelado` | `novo`, `em_andamento`, `fechado`, `concluido`                         | `aberto`   |
| `avisos[].tipo`                 | `info`, `sucesso`, `alerta`, `erro`                          | `success`, `warning`, `error`                                          | `info`     |

#### Formatos aceitos nos demais campos

| Tipo            | O que pode vir                                                                        |
| --------------- | ------------------------------------------------------------------------------------- |
| Números         | `129.9`, `"129.90"`, `"129,90"`, `"R$ 1.234,56"` — todos viram `1234.56` corretamente |
| Datas           | `"2026-08-10"` (vira `10/08/2026`) ou já escrita: `"10/08/2026"`, `"Agosto/2026"`     |
| Listas de texto | `["Wi-Fi 6", "Sem adesão"]` ou `"Wi-Fi 6;Sem adesão"`                                 |
| Booleanos       | `true`, `"true"`, `"sim"`, `1`                                                        |

#### De onde cada campo sai, quando a fonte é o banco

| Campo do JSON                   | Coluna                                         |
| ------------------------------- | ---------------------------------------------- |
| `cliente.*`                     | `clientes_web`                                 |
| `cliente.cliente_desde`         | a `data_adesao` mais antiga entre os contratos |
| `cliente.codigo`                | `clientes_web.id_cliente`                      |
| `contratos[].id` / `.numero`    | `contratos_web.cod_contrato`                   |
| `contratos[].apelido`           | o primeiro trecho de `contratos_web.endereco`  |
| `contratos[].status_conexao`    | `contratos_web.status_contrato`                |
| `contratos[].status_financeiro` | `contratos_web.status_fatura`                  |
| `contratos[].download`          | `contratos_web.velocidade`                     |
| `faturas[].valor`               | `faturas_web.valor_atual` (com juros e multa)  |
| `faturas[].valor_original`      | `faturas_web.valor_original`                   |
| `faturas[].referencia`          | `faturas_web.descricao`                        |
| `planos[]`                      | `planos_web` — a mesma tabela da home          |

Contratos com `status_contrato = 'cancelado'` e faturas com
`status_fatura = 'cancelada'` ficam de fora da consulta: não há mais nada a
fazer com eles na tela, e uma fatura cancelada ao lado das abertas é o tipo de
coisa que faz o cliente ligar para o financeiro.

`desbloqueio_disponivel` sai como `true` quando há contrato bloqueado ou
suspenso. É um **padrão**, não a política do provedor — para mandar nisso,
recuse o formulário `painel_desbloqueio_confianca` ou passe a consulta para o
webhook.

#### Apelidos de chave

Cada campo aceita alguns nomes, para encaixar no que o seu cadastro já devolve
sem um nó de renomeação no meio:

| Campo do site      | Também aceito como                     |
| ------------------ | -------------------------------------- |
| `cliente`          | `customer`, `assinante`                |
| `contratos`        | `contracts`                            |
| `faturas`          | `invoices`, `titulos`                  |
| `notas_fiscais`    | `notas`, `notasFiscais`, `taxInvoices` |
| `indicacoes`       | `referrals`                            |
| `chamados`         | `tickets`, `atendimentos`              |
| `planos`           | `planos_disponiveis`, `plans`          |
| `documento`        | `cpf_cnpj`, `cpfCnpj`, `cpf`, `cnpj`   |
| `valor_mensal`     | `valor`, `mensalidade`, `monthlyValue` |
| `pix_copia_e_cola` | `pix`, `brcode`, `qrcode_pix`          |
| `linha_digitavel`  | `codigo_barras`, `barcode`             |
| `vencimento`       | `data_vencimento`, `dueDate`           |
| `aberto_em`        | `criado_em`, `createdAt`, `data`       |

Qualquer lista também pode vir dentro de um envelope:
`"faturas": { "itens": [...] }` funciona igual a `"faturas": [...]`
(`itens`, `items`, `lista`, `dados`, `data` e `registros` servem).

### Recargas por seção

Existem para recarregar uma parte só. O site as usa quando um formulário mexeu
naquilo — nunca para montar a tela.

| Evento                 | `dados`                        | Resposta                                  |
| ---------------------- | ------------------------------ | ----------------------------------------- |
| `painel_contratos`     | `{ "secao": "contratos" }`     | `{ "dados": { "contratos": [...] } }`     |
| `painel_faturas`       | `{ "secao": "faturas" }`       | `{ "dados": { "faturas": [...] } }`       |
| `painel_notas_fiscais` | `{ "secao": "notas_fiscais" }` | `{ "dados": { "notas_fiscais": [...] } }` |
| `painel_indicacoes`    | `{ "secao": "indicacoes" }`    | `{ "dados": { "indicacoes": [...] } }`    |
| `painel_chamados`      | `{ "secao": "chamados" }`      | `{ "dados": { "chamados": [...] } }`      |
| `painel_planos`        | `{ "secao": "planos" }`        | `{ "dados": { "planos": [...] } }`        |

O formato de cada item é o mesmo do `painel_bootstrap`.

> **Começando o fluxo?** Dá para atender só o `painel_bootstrap` e deixar estes
> seis para depois: enquanto a resposta dos formulários não trouxer listas
> novas, o site recarrega pelo `painel_bootstrap` mesmo.

---

## Formulários

Um evento por formulário, como combinado. Todos chegam com o mesmo formato de
`dados`:

```json
{
  "evento": "painel_abrir_chamado",
  "token": "...",
  "id_cliente": "84920",
  "dados": {
    "formulario": "abrir_chamado",
    "campos": { "...": "os campos da tela" }
  }
}
```

`dados.formulario` está sempre lá, então um ramo genérico por `formulario`
também dá conta — mas o `evento` é específico justamente para você poder rotear
por ele e ter um ramo por assunto.

A resposta mínima de qualquer formulário é:

```json
{ "status": "ok", "mensagem": "O texto que o cliente vai ler." }
```

`mensagem` é opcional; sem ela o site usa um texto padrão próprio de cada tela.
Quando existe, é ela que aparece — inclusive nos casos em que o pedido entra em
análise em vez de ser concluído na hora.

### 1. `painel_trocar_plano`

```json
{
  "id_contrato": "ctr_01",
  "id_plano": "plano_1000",
  "plano": "Gamer Master 1 Giga",
  "valor_plano": 179.9,
  "adicionais": [{ "id": "mesh", "nome": "Ponto Wi-Fi Mesh extra", "valor": 19.9 }],
  "valor_total": 199.8
}
```

**Resposta**

```json
{
  "status": "ok",
  "mensagem": "Troca agendada para a próxima virada de fatura.",
  "dados": { "protocolo": "20260819-77120" }
}
```

O `protocolo` aparece na confirmação com um botão de copiar. Sem ele, a tela
mostra só a mensagem.

### 2. `painel_indicar_amigo`

```json
{ "nome": "Pedro Henrique", "telefone": "(49) 99999-8888", "codigo_indicacao": "LUCAS50FIBRA" }
```

**Resposta**

```json
{
  "status": "ok",
  "mensagem": "Indicação enviada! Vamos falar com o Pedro.",
  "dados": {
    "indicacoes": [
      {
        "id": "ref_09",
        "nome": "Pedro Henrique",
        "telefone": "(49) 99999-8888",
        "data": "2026-08-19",
        "status": "pendente",
        "desconto": 50.0
      }
    ]
  }
}
```

Devolver a lista atualizada em `dados.indicacoes` faz o novo nome aparecer na
hora, sem uma segunda chamada.

### 3. `painel_pix_automatico`

```json
{ "tipo_chave": "cpf", "chave": "341.892.418-05" }
```

`tipo_chave`: `cpf`, `email`, `telefone` ou `aleatoria`.

**Resposta**

```json
{ "status": "ok", "mensagem": "PIX automático ativado a partir da próxima fatura." }
```

### 4. `painel_debito_automatico`

```json
{
  "banco": "341",
  "banco_nome": "Itaú Unibanco",
  "agencia": "1842",
  "conta": "09482-1",
  "tipo_conta": "corrente",
  "documento_titular": "341.892.418-05"
}
```

`tipo_conta`: `corrente` ou `poupanca`.

**Resposta**

```json
{ "status": "ok", "mensagem": "Débito em conta enviado ao banco para autorização." }
```

### 5. `painel_viabilidade_endereco`

Consulta de cobertura, disparada pelo botão "Conferir cobertura" da mudança de
endereço. **Não muda nada** — o site não recarrega o painel depois dela.

```json
{ "cep": "89805-100", "numero": "223", "id_contrato": "ctr_01" }
```

**Resposta**

```json
{
  "status": "ok",
  "mensagem": "Temos cobertura nesse endereço.",
  "dados": {
    "viavel": true,
    "logradouro": "Rua Marechal Deodoro",
    "bairro": "Presidente Médici",
    "cidade": "Chapecó",
    "uf": "SC"
  }
}
```

Os campos de endereço, quando vêm, preenchem o formulário sozinhos.

> **Sem cobertura** é `"viavel": false` com a mensagem explicando — e ainda com
> `"status": "ok"`, porque a consulta funcionou. Um `viavel` ausente é lido como
> viável: o fluxo respondeu positivo, e recusar por um campo que não veio seria
> inventar uma negativa que ninguém deu.

### 6. `painel_mudanca_endereco`

```json
{
  "id_contrato": "ctr_01",
  "cep": "89805-100",
  "logradouro": "Rua Marechal Deodoro",
  "numero": "223",
  "complemento": "Sala 61",
  "bairro": "Presidente Médici",
  "cidade": "Chapecó",
  "uf": "SC",
  "data_visita": "2026-09-02",
  "periodo_visita": "manha"
}
```

`periodo_visita`: `manha` ou `tarde`. `data_visita` vem no formato `AAAA-MM-DD`
e é uma preferência do cliente, não uma confirmação.

**Resposta**

```json
{
  "status": "ok",
  "mensagem": "Mudança agendada para 02/09 pela manhã.",
  "dados": { "protocolo": "20260819-77121" }
}
```

### 7. `painel_trocar_titular`

```json
{
  "id_contrato": "ctr_01",
  "titular_atual": "Lucas Oliveira Mendes",
  "novo_titular": {
    "nome": "Mariana Silva Rocha",
    "documento": "111.222.333-44",
    "rg": "48.912.840-X SSP/SC",
    "nascimento": "1990-04-15",
    "email": "mariana@email.com",
    "telefone": "(49) 98888-7777"
  },
  "vinculo": "familiar",
  "aceite_confirmado": true
}
```

`vinculo`: `familiar`, `novo_morador`, `socio` ou `outro`.

**Resposta**

```json
{
  "status": "ok",
  "mensagem": "Recebemos o pedido. Vamos conferir os documentos e retornar em até 2 dias úteis.",
  "dados": { "protocolo": "20260819-77122" }
}
```

### 8. `painel_segunda_via`

```json
{
  "id_fatura": "inv_01",
  "id_contrato": "ctr_01",
  "referencia": "Agosto/2026",
  "vencimento": "2026-08-10",
  "valor": 129.9
}
```

**Resposta**

```json
{
  "status": "ok",
  "mensagem": "PIX válido por 30 minutos.",
  "dados": {
    "pix_copia_e_cola": "00020126580014br.gov.bcb.pix0136...",
    "linha_digitavel": "34191.79001 01043.510047 91020.150008 5 96510000012990",
    "url_boleto": "https://.../boleto/inv_01.pdf"
  }
}
```

O que voltar aqui substitui o que veio no carregamento da página — é o caminho
para gerar um boleto novo com a data de hoje. Os três campos são opcionais; a
tela mostra os que existirem.

### 9. `painel_nota_fiscal`

```json
{
  "id_nota": "nfe_01",
  "numero": "000.419.821",
  "referencia": "Julho/2026",
  "numero_contrato": "CTR-2024-8841"
}
```

**Resposta**

```json
{ "status": "ok", "dados": { "url_danfe": "https://.../nfse/000419821.pdf" } }
```

Com `url_danfe` (ou `url`, `link_nota`, `pdf`) a nota abre em outra aba. Sem
ela, a tela mostra a `mensagem` — é o caminho para "vamos enviar por e-mail".

### 10. `painel_abrir_chamado`

```json
{
  "id_contrato": "ctr_01",
  "categoria": "Internet lenta ou oscilando",
  "assunto": "Sinal cai toda noite por volta das 20h",
  "descricao": "Começou na segunda-feira. Acontece no Wi-Fi e no cabo.",
  "diagnostico": "Sinal óptico normal (-18 dBm). Sem perda na rede."
}
```

`diagnostico` só vai junto se o cliente tiver rodado o diagnóstico antes de
enviar.

**Resposta**

```json
{
  "status": "ok",
  "mensagem": "Chamado aberto. Retornamos em até 4 horas.",
  "dados": {
    "protocolo": "20260819-77123",
    "chamados": [
      {
        "id": "tkt_09",
        "protocolo": "20260819-77123",
        "id_contrato": "ctr_01",
        "categoria": "Internet lenta ou oscilando",
        "assunto": "Sinal cai toda noite",
        "status": "aberto",
        "aberto_em": "2026-08-19"
      }
    ]
  }
}
```

### 11. `painel_diagnostico_conexao`

O botão "Rodar diagnóstico" dentro do suporte. **Não muda nada.**

```json
{ "id_contrato": "ctr_01" }
```

**Resposta**

```json
{
  "status": "ok",
  "dados": {
    "diagnostico": "Sinal óptico normal (-18 dBm). Nenhuma perda entre a OLT e o seu ponto."
  }
}
```

O texto de `diagnostico` (ou `resultado`, ou `resumo`) aparece na tela e segue
junto no chamado, se o cliente abrir um.

### 12. `painel_reiniciar_conexao`

O botão "Reiniciar conexão" no card do contrato.

```json
{ "id_contrato": "ctr_01" }
```

**Resposta**

```json
{ "status": "ok", "mensagem": "Comando enviado. O equipamento reinicia em cerca de 40 segundos." }
```

### 13. `painel_desbloqueio_confianca`

```json
{ "faturas": ["inv_02"], "valor_total": 219.9 }
```

**Resposta**

```json
{
  "status": "ok",
  "mensagem": "Conexão liberada. Regularize até 22/08 para não bloquear de novo.",
  "dados": { "prazo": "2026-08-22" }
}
```

Se a política do provedor não permitir o desbloqueio naquele momento, responda
com `status` diferente de `ok` e a `mensagem` explicando — a tela mostra o texto
como está.

Para **esconder o botão** de quem não tem direito a ele, mande
`"desbloqueio_disponivel": false` no `painel_bootstrap`.

### 14. `painel_teste_velocidade`

**Não muda nada.**

```json
{ "id_contrato": "ctr_01" }
```

**Resposta**

```json
{
  "status": "ok",
  "mensagem": "Medição feita a partir da nossa borda até o seu equipamento.",
  "dados": { "download": 582.4, "upload": 291.7, "ping": 8 }
}
```

Os números são em Mbps (`download`, `upload`) e milissegundos (`ping`). A tela
compara o download medido com a velocidade contratada e mostra a proporção.

---

## Regras que valem para todas as respostas

### Só `ok` é sucesso

```json
{ "status": "ok" }
```

Qualquer outro `status`, erro HTTP ou timeout é tratado como falha, e a
`mensagem` da resposta é o texto que o cliente lê. Sem `mensagem`, o site usa um
texto genérico próprio.

### Sessão derrubada

Para expulsar uma sessão antes da hora, responda com HTTP **401/403** ou com
`status` igual a `token_invalido`, `token_expirado` ou `nao_autorizado`. O site
apaga o cookie, esquece o cache daquele cliente e manda o cliente ao login.

### Renovação do token

Qualquer resposta do painel pode trazer um token novo, e o site troca o antigo
por ele. É assim que a validade desliza enquanto o cliente usa a tela — não há
evento de renovação separado.

```json
{ "status": "ok", "token": "novo-token", "expira_em_segundos": 3600, "dados": {} }
```

Sem token na resposta, o atual continua valendo.

### Resposta que já traz o painel

Quando um formulário devolve as listas atualizadas, o site as aplica direto e
**não faz a consulta seguinte**. Vale para `cliente`, `contratos`, `faturas`,
`notas_fiscais`, `indicacoes`, `chamados`, `planos`, `adicionais` e `avisos` —
soltos em `dados` ou dentro de `dados.painel`:

```json
{
  "status": "ok",
  "mensagem": "Chamado aberto.",
  "dados": {
    "protocolo": "20260819-77123",
    "painel": { "chamados": ["...a lista completa e atualizada..."] }
  }
}
```

O que a resposta não trouxer permanece como estava. **Uma lista vazia apaga a
lista** — `"faturas": []` significa "não há mais faturas", não "não consultei".
Para não mexer numa seção, omita a chave dela.

### Onde os dados podem estar

O site procura o conteúdo em `dados`; se não achar, usa o corpo inteiro (menos
`status`, `mensagem` e `token`). As duas formas abaixo são equivalentes:

```json
{ "status": "ok", "dados": { "faturas": [] } }
{ "status": "ok", "faturas": [] }
```

### Tamanho e tempo

O corpo da resposta é lido até **64 KB** e o site desiste depois de **15
segundos**. Um cadastro com centenas de faturas precisa ser recortado no n8n —
mande o período que interessa, não o histórico inteiro.

---

## Conferindo sem o n8n pronto

Um webhook de mentira que responda o `painel_bootstrap` acima já enche a tela
inteira. É o caminho mais rápido para ver o painel funcionando antes de plugar o
cadastro de verdade:

```bash
WEBHOOK_LOGIN_URL=http://127.0.0.1:5679/webhook/teste \
SESSION_SECRET=uma-chave-de-teste-com-mais-de-32-caracteres \
bun run dev
```

Responda `acesso_senha` com `{"status":"ok","id_cliente":"1","cliente":{"nome":"Teste"},"token":"t","expira_em_segundos":3600}`
para entrar, e `painel_bootstrap` com o JSON desta página para ver o painel
montado.
