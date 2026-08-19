# Workflow do n8n — área do cliente

O outro lado do `WEBHOOK_LOGIN_URL`. Este workflow é **o único** provedor de
identidade do `/cliente`: ele decide quem entra pelos dois métodos de login,
emite o token de acesso da sessão e responde às consultas e formulários do
painel enquanto esse token estiver válido.

| Arquivo                       | O que é                                             |
| ----------------------------- | --------------------------------------------------- |
| `workflow-login-cliente.json` | O workflow, pronto para importar (42 nós)           |
| `schema.sql`                  | As estruturas que ele espera no Postgres            |
| `painel-cliente.md`           | O contrato JSON de cada evento de `/cliente/painel` |

## Antes de importar

**n8n 1.60 ou mais novo** — o workflow usa Switch v3.2, If v2.2 e passa os
parâmetros do Postgres como array (`={{ [a, b] }}`), o que versões antigas do nó
não aceitam.

Duas variáveis de ambiente **no serviço do n8n** (não no do site):

```
NODE_FUNCTION_ALLOW_BUILTIN=crypto
WEBHOOK_LOGIN_TOKEN=<a mesma string do WEBHOOK_LOGIN_TOKEN do site>
```

**`NODE_FUNCTION_ALLOW_BUILTIN` não é opcional.** O Code node do n8n roda num
sandbox que bloqueia os módulos nativos do Node, e seis nós deste workflow usam
`crypto` — a assinatura, o código, o token e as duas pontas da senha. Sem essa
variável o primeiro deles falha com `Module 'crypto' is disallowed`, e os outros
cinco falhariam em seguida.

**`WEBHOOK_LOGIN_TOKEN`** precisa ser byte a byte igual à do site — é com ela que
a assinatura é recalculada, e um caractere de diferença recusa tudo. Atenção ao
prefixo: aqui vai **só o token**, sem `Bearer`. O `Bearer ` entra apenas na
credencial Header Auth do nó Webhook, e é o site que o acrescenta ao chamar.

As duas só são lidas na inicialização: depois de adicioná-las, **reinicie o
serviço do n8n**. E se ele roda com `N8N_BLOCK_ENV_ACCESS_IN_NODE=true`, os nós
de código não enxergam nenhuma variável de ambiente; deixe em `false` (o padrão).

Rode o `schema.sql` no Postgres. Só a view `clientes_web` precisa ser adaptada:
ela é o único ponto em que o workflow toca no seu cadastro.

## Depois de importar

**1. Credencial do Webhook (Header Auth).** No nó `Webhook Login`, crie uma
credencial _Header Auth_ com nome `authorization` e valor
`Bearer <WEBHOOK_LOGIN_TOKEN>`. Sem isso o webhook aceita qualquer chamada.

**2. Path do webhook.** Troque `TROQUE-POR-UM-UUID-SEU` (campos _Path_ e
_Webhook ID_) por um UUID seu. A URL resultante vai no `WEBHOOK_LOGIN_URL` do
site — use o endereço **interno** da rede Docker, como
`http://n8n:5678/webhook/<seu-uuid>`.

**3. Raw Body.** Já vem ligado no nó `Webhook Login`. Não desligue: a assinatura
é calculada sobre os bytes originais do corpo, e reserializar o JSON muda esses
bytes.

**4. Credencial do Postgres** nos nós de banco.

**5. Os três `CONFIGURE AQUI`.** São nós vazios (No-Op) de propósito, para o
workflow importar e rodar de ponta a ponta antes de você plugar o que é seu:

- `Enviar código — CONFIGURE AQUI` — seu envio de SMS, WhatsApp e e-mail. O
  canal está em `$json.metodo` e o código em claro em `$json.codigo`, vindos do
  nó `Gerar código`. O usual é um Switch por `metodo` com três saídas.
- `Enviar dados de acesso — CONFIGURE AQUI` — a mensagem do "Esqueci minha
  senha". As credenciais estão em `$('Preparar credencial').first().json`, nos
  campos `acesso_sac` e `senha_sac`.
- `Consultar seção — CONFIGURE AQUI` — as consultas do painel. A seção pedida
  está em `$('Validar assinatura').first().json.dados.secao` e o cliente
  autenticado em `$('Validar token').first().json.id_cliente`. Devolva um item
  com `{ dados: { ... } }`; é isso que chega à tela.

⚠️ Enquanto o primeiro for No-Op, **o cliente nunca recebe o código** e o site
mesmo assim diz "código enviado". É o primeiro sintoma a procurar se o login
travar na tela do código.

## Os eventos

O nó `Rotear evento` separa por `evento`; cada ramo termina num
_Respond to Webhook_. Um evento desconhecido responde `status: "erro"` — nunca
fica sem resposta, senão o site espera os 15s de timeout à toa.

### Login

| Evento               | O que o ramo faz                                                        |
| -------------------- | ----------------------------------------------------------------------- |
| `documento_cliente`  | Busca o cliente pelo documento; devolve `id_cliente`, canais e contatos |
| `envio_codigo`       | Gera um código de 6 dígitos, guarda o hash (5 min) e manda enviar       |
| `verificacao_codigo` | Confere o código, conta a tentativa e, se bater, **emite o token**      |
| `acesso_senha`       | Confere o login e a senha do SAC e, se bater, **emite o token**         |
| `solicitacao_login`  | Busca o acesso_sac/senha_sac do cadastro e manda ao cliente             |

Os dois logins convergem nos mesmos nós `Gerar token` → `Guardar token` →
`Responder login`. É o mesmo token, com o mesmo formato, venha o cliente do
código ou da senha.

### Painel (só depois do login)

O workflow importado traz dois ramos genéricos, que atendem qualquer chamada do
painel:

| Evento              | O que o ramo faz                                            |
| ------------------- | ----------------------------------------------------------- |
| `consulta_painel`   | Valida o token e devolve a seção pedida                     |
| `formulario_painel` | Valida o token e registra o formulário em `web_formularios` |

A tela, porém, manda **um evento por assunto** — `painel_bootstrap` para o
carregamento inicial, `painel_abrir_chamado` para o suporte, `painel_segunda_via`
para o boleto, e assim por diante. São 7 consultas e 14 formulários, todos
listados em **`painel-cliente.md`**, junto do JSON que cada um envia e do JSON
que a resposta precisa ter.

Duas formas de atender, as duas válidas:

1. **Um ramo por evento** — acrescente as saídas ao Switch `Rotear evento`. É o
   caminho natural quando cada assunto fala com um sistema diferente.
2. **Um ramo só** — como `dados.formulario` e `dados.secao` continuam no corpo
   de todos eles, um Switch interno por esse campo resolve tudo dentro do ramo
   genérico que já existe.

O importante é responder: um evento sem ramo devolve `status: "erro"`, e a tela
mostra esse erro ao cliente. Comece pelo `painel_bootstrap` — só ele já monta a
página inteira.

Os dois passam antes pelo nó `Validar token`.

## Decisões que valem conhecer antes de mexer

**A assinatura, não só o Bearer.** O nó `Validar assinatura` recalcula
`HMAC_SHA256(token, "<timestamp>.<corpo cru>")`, compara em tempo constante e
recusa timestamp com mais de 5 minutos. O Bearer prova que quem chamou conhece o
token; a assinatura prova que o corpo não foi alterado no caminho e que a
requisição não é a repetição de uma anterior capturada. É por isso que o token
de acesso viaja no corpo, e não num header: no header ficaria fora da assinatura.

**O token é opaco, não um JWT.** São 32 bytes aleatórios apontando para uma
linha em `web_sessoes`. Isso é o que permite **revogar** uma sessão na hora — um
JWT autoassinado continua válido até expirar, por mais que você queira derrubá-lo.
Para derrubar alguém agora:

```sql
UPDATE public.web_sessoes SET revogada_em = now()
 WHERE id_cliente = '9911' AND revogada_em IS NULL;
```

**O token manda, não o `id_cliente`.** O nó `Validar token` exige que os dois
batam. Sem essa conferência, quem tivesse um token válido poderia trocar o
`id_cliente` do corpo e ler os dados de outro cliente.

**A sessão desliza, com teto.** Cada uso empurra a expiração para 30 minutos à
frente, e a resposta devolve o prazo novo — o site atualiza o dele. Mas há um
teto absoluto de 12h desde a criação: deslizar sem teto daria uma sessão eterna,
que é o oposto de um token temporário.

**Códigos e tokens vão ao banco como SHA-256.** Uma cópia da tabela não entrega
código vivo nem sessão de ninguém.

**A senha digitada não entra em query nenhuma.** O SQL busca a senha do
cadastro, e a comparação acontece no nó `Conferir senha`, em tempo constante.
Duas razões: a senha digitada não aparece em log de banco nem em
`pg_stat_statements`, e os parâmetros do nó Postgres são uma lista — uma senha
com vírgula viraria dois parâmetros, um bug que só apareceria com o cliente
errado, no pior momento.

**A senha do SAC fica em claro no cadastro**, porque é assim que o SAC a guarda
— o site apenas a lê. É o ponto mais frágil do desenho, e não dá para consertar
só deste lado: enquanto a fonte for texto puro, um vazamento do banco entrega as
senhas. Se um dia o SAC passar a guardar hash, o único nó a mudar é
`Conferir senha`.

**Uma instrução SQL por decisão.** Escolher o código, contar a tentativa e
marcá-lo como usado acontecem num único comando. Em comandos separados haveria a
janela em que dois envios simultâneos gastam o mesmo código.

**Mensagens de erro vagas, de propósito.** Documento não encontrado, código
errado, código expirado, usuário inexistente e senha errada respondem quase a
mesma coisa. A diferença não muda nada para o cliente e entrega bastante para
quem está testando CPFs e e-mails. Pelo mesmo motivo, o `solicitacao_login`
responde `ok` mesmo quando o documento não existe.

## Testando

Com o workflow ativo, o teste honesto é pelo site: abra `/cliente`, informe um
CPF do seu cadastro e siga até o código. O log do n8n mostra cada nó.

Para testar um evento isolado, o corpo precisa ir assinado:

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

Mude um caractere do `BODY` sem refazer a assinatura: deve vir `401` com
`{"status":"erro","mensagem":"Requisição não autorizada."}`.

Para uma primeira senha de teste, gere salt e hash com o mesmo scrypt do
workflow e grave em `web_credenciais`:

```bash
node -e '
const c = require("crypto");
const senha = process.argv[1], salt = c.randomBytes(16).toString("hex");
console.log(`senha: ${senha}\nsalt:  ${salt}\nhash:  ${c.scryptSync(senha, salt, 64).toString("hex")}`);
' "minha-senha-de-teste"
```
