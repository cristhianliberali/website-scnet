# Workflow do n8n — login da área do cliente

O outro lado do `WEBHOOK_LOGIN_URL`. O site (`/cliente`) manda quatro eventos
para cá; este workflow responde a todos e é quem decide se o cliente entra pelo
caminho do **documento + código**.

O outro caminho de login — e-mail ou telefone + senha — **não passa por aqui**:
o site fala direto com o Supabase. O n8n só encosta no Supabase no
`solicitacao_login`, para criar ou redefinir a senha do cliente.

| Arquivo                       | O que é                                      |
| ----------------------------- | -------------------------------------------- |
| `workflow-login-cliente.json` | O workflow, pronto para importar             |
| `schema.sql`                  | A view e a tabela que ele espera no Postgres |

## Antes de importar

**n8n 1.60 ou mais novo** — o workflow usa Switch v3.2 e If v2.2.

Três variáveis de ambiente **no serviço do n8n** (não no do site):

```
WEBHOOK_LOGIN_TOKEN=<a mesma string do WEBHOOK_LOGIN_TOKEN do site>
SUPABASE_URL=http://supabase-kong:8000
SUPABASE_SERVICE_ROLE_KEY=<chave service_role>
```

O token precisa ser **byte a byte igual** ao do site — é com ele que a
assinatura é recalculada, e um caractere de diferença recusa tudo.

A `service_role` mora aqui, e só aqui. O site usa a `anon`; quem cria e
redefine senha é este workflow.

Se o seu n8n roda com `N8N_BLOCK_ENV_ACCESS_IN_NODE=true`, os nós de código não
enxergam nada disso — deixe em `false` (o padrão).

Rode o `schema.sql` no Postgres. Só a view `clientes_web` precisa ser adaptada:
ela é o único ponto em que o workflow toca no seu cadastro.

## Depois de importar

**1. Credencial do Webhook (Header Auth).** No nó `Webhook Login`, crie uma
credencial _Header Auth_ com nome `authorization` e valor
`Bearer <WEBHOOK_LOGIN_TOKEN>`. Sem isso o webhook aceita qualquer chamada.

**2. Path do webhook.** Troque `TROQUE-POR-UM-UUID-SEU` (nos campos _Path_ e
_Webhook ID_) por um UUID gerado por você. A URL resultante vai no
`WEBHOOK_LOGIN_URL` do site — use o endereço **interno** da rede Docker, como
`http://n8n:5678/webhook/<seu-uuid>`.

**3. Raw Body.** O nó `Webhook Login` já vem com _Raw Body_ ligado. Não desligue:
a assinatura é calculada sobre os bytes originais do corpo, e reserializar o
JSON muda esses bytes.

**4. Credencial do Postgres** nos cinco nós de banco.

**5. Os dois `CONFIGURE AQUI`.** São nós vazios (No-Op) de propósito, para o
workflow importar e rodar de ponta a ponta antes de você plugar seus provedores:

- `Enviar código — CONFIGURE AQUI` — troque pelo seu envio de SMS, WhatsApp e
  e-mail. O canal escolhido chega em `$json.metodo` (`sms`/`whatsapp`/`email`) e
  o código em claro em `$json.codigo`, vindos do nó `Gerar código`. O jeito
  usual é um Switch por `metodo` com três saídas.
- `Enviar dados de acesso — CONFIGURE AQUI` — a mensagem do "Esqueci minha
  senha". A senha nova está em `$('Preparar credencial').first().json.senha`.

⚠️ Enquanto eles forem No-Op, **o cliente nunca recebe o código** e o site
mesmo assim diz "código enviado". É o primeiro sintoma a procurar se o login
travar na tela do código.

## Os quatro eventos

O nó `Rotear evento` separa por `evento`; cada ramo termina num
_Respond to Webhook_.

| Evento               | O que o ramo faz                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `documento_cliente`  | Busca o cliente pelo documento e devolve `id_cliente`, os canais disponíveis e os contatos |
| `envio_codigo`       | Gera um código de 6 dígitos, guarda o hash com validade de 5 min e manda enviar            |
| `verificacao_codigo` | Confere o código, conta a tentativa e libera (ou não) o acesso                             |
| `solicitacao_login`  | Gera senha nova, grava no Supabase e manda ao cliente                                      |

Um evento desconhecido cai no ramo `desconhecido` e responde `status: "erro"` —
nunca fica sem resposta, senão o site espera os 15s de timeout à toa.

O contrato completo de cada evento (o que chega em `dados`, o que a resposta
precisa ter) está no `.env.example`, na seção do `WEBHOOK_LOGIN_URL`.

## Decisões que valem conhecer antes de mexer

**A assinatura, não só o Bearer.** O nó `Validar assinatura` recalcula
`HMAC_SHA256(token, "<timestamp>.<corpo cru>")` e compara em tempo constante,
recusando timestamp com mais de 5 minutos. O Bearer prova que quem chamou
conhece o token; a assinatura prova que o corpo não foi alterado no caminho e
que a requisição não é a repetição de uma anterior capturada.

**O código não é guardado em claro.** No banco fica só o SHA-256. Quem abrir a
tabela não entra na conta de ninguém.

**Uma instrução SQL por decisão.** Escolher o código, contar a tentativa e
marcá-lo como usado acontecem num único comando. Em comandos separados haveria
a janela em que dois envios simultâneos gastam o mesmo código.

**O par cliente/documento é reconferido.** O site garante que o `id_cliente` sai
do cookie selado, mas as queries de envio e verificação exigem que ele bata com
o documento assim mesmo. Um webhook alcançável por URL não deve depender só do
bom comportamento de quem o chama.

**Mensagens de erro vagas, de propósito.** Documento não encontrado, código
errado, código expirado e tentativas esgotadas respondem quase a mesma coisa. A
diferença entre elas não muda nada para o cliente e entrega bastante para quem
está testando CPFs. Pelo mesmo motivo, o `solicitacao_login` responde `ok`
mesmo quando o documento não existe.

## Testando

Com o workflow ativo, o teste honesto é pelo site: abra `/cliente`, informe um
CPF do seu cadastro e siga até o código. O log do n8n mostra cada nó.

Para testar um evento isolado sem o site, o corpo precisa ir assinado — este
comando monta e assina um `documento_cliente`:

```bash
TOKEN='seu-webhook-login-token'
URL='http://localhost:5678/webhook/seu-uuid'
BODY='{"evento":"documento_cliente","id_sessao":"1","id_requisicao":"1","page":"/cliente","submitted_at":"2026-01-01T00:00:00.000Z","recaptcha_score":null,"dados":{"tipo_documento":"cpf","documento":"11144477735"}}'
TS=$(date +%s)
SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$TOKEN" -hex | awk '{print $NF}')

curl -sS -X POST "$URL" \
  -H "content-type: application/json" \
  -H "authorization: Bearer $TOKEN" \
  -H "x-scnet-timestamp: $TS" \
  -H "x-scnet-assinatura: $SIG" \
  --data "$BODY"
```

Resposta esperada:

```json
{
  "status": "ok",
  "id_cliente": "9911",
  "canais": { "sms": true, "whatsapp": true, "email": true },
  "contatos": { "celular": "49999991234", "email": "maria@email.com" }
}
```

Mude um caractere do `BODY` sem refazer a assinatura: deve vir `401` com
`{"status":"erro","mensagem":"Requisição não autorizada."}`.
