# Website SCNET

Novo projeto "Landing Page SCNET"

Crie uma landing page vibrante, moderna e de alta conversão para a **SCNET**, provedor de internet por fibra óptica que atua no Oeste e Litoral de Santa Catarina há + 20 anos, com cerca de 30 mil clientes na base. O objetivo é gerar leads (formulário de leads) e converter em contratação de planos. O visual deve ser **animado, colorido e energético** — nada de site "institucional parado".

### IDENTIDADE VISUAL

**Paleta de cores (use as 3 de forma ativa, não só como detalhe):**

- Azul vibrante `#0055FF` — cor principal, usar em fundos de seção, botões secundários, ícones, destaques de texto.

- Amarelo vibrante `#FFD200` — cor de energia e ação, reservar para CTAs principais, selos, badges e elementos que precisam "saltar aos olhos".

- Azul profundo `#0025A2` — usar em gradientes com o azul vibrante (transições diagonais ou radiais), fundos de seções de maior contraste e textos sobre fundo claro.

- Branco `#FFFFFF` como respiro entre seções coloridas.

- Pode usar gradiente diagonal `#0025A2 → #0055FF` em backgrounds de hero e seções de destaque, e leves brilhos/glow amarelo atrás de elementos de CTA para dar sensação de energia.

**Tipografia:**

- **Sora** (bold/extrabold) para headlines e números de destaque (ex: preços dos planos) — dá um ar moderno, geométrico e com presença.

- **Raleway** (semibold/medium) para subheadlines, nomes de planos e rótulos de UI (botões, badges, menu).

- **Inter** (regular/medium) para todo o corpo de texto — parágrafos, descrições, FAQ — por ser a mais legível em blocos longos.

**Estilo visual e motion (o site precisa parecer vivo):**

- Elementos gráficos flutuantes (ícones de wifi, roteador, velocímetro, escudo) com leve animação de flutuação (float) ao redor de imagens do hero.

- Botões de CTA em amarelo com efeito de "pulse"/glow sutil e leve scale no hover.

- Cards de planos com efeito de elevação (hover: sobe + sombra colorida com a cor da seção) e microtransição suave.

- Números de destaque (ex: "+30 mil clientes", "4.9/5", preços) animados com contador crescente ao entrar na viewport (count-up).

- Blobs/formas orgânicas animadas sutilmente no fundo (parallax leve ao scroll), reforçando o tom moderno e dinâmico.

- Transições de entrada por seção (fade + slide up) ao rolar a página — perceptível, mas sem exagero que atrapalhe a leitura.

- Evitar visual "corporativo estático": priorizar composições assimétricas, cores em blocos diagonais e bastante contraste entre azul e amarelo.

### REGRAS DE COPY (aplicar em todo o site)

- **Proibido usar a expressão "internet de verdade"** e clichês genéricos do setor como "nunca cai", "sensacional", "milagre", "a mais rápida do mundo".

- Toda copy deve ser **direta, animada e estimular ação imediata** — usar verbos de ação, senso de simplicidade e velocidade na decisão ("assine em minutos", "sem enrolação", "resolve agora").

- Sempre associar o plano a um resultado prático da rotina, mas com tom mais leve e empolgado do que institucional.

- CTA principal sempre priorizando WhatsApp e formulário de verificação de cobertura.

- Nunca citar concorrentes nominalmente nem fazer comparação direta de preço agressiva.

### ESTRUTURA DE SEÇÕES (nesta ordem)

**1. Header fixo**

Logo "SCNET" à esquerda, ao centro, menu rápido com ancoras na própria página [Planos, "Nossas soluções" {Para mim, para minha empresa, Condomínios, Internet rural} Depoimentos, Dúvidas], botão ao lado "Área do cliente" com leve glow, fundo transparente que ganha blur + cor sólida ao rolar.

**2. Hero 

Na esquerda da sessão:

- Headline (Sora extrabold, branco): "Wi-Fi rápido e estável que pega na casa toda!"

- Subheadline (Inter, branco/90% opacidade): "Internet estável e atendimento humano com gente da sua cidade"

- Formulário titulo "Contrate agora": Campo nome (Regex Capitalizando valor) e Telefone/Whatsapp (regex validando 8 ou 9 digitos + ddd (DDI pré preenchido na frente, mas editável))

- Microcopy abaixo do botão: "Venha para a conexão n°1 da região"

Na direita da sessão:

- Imagem de casa com wifi (arquivo: casa-wifi-hero)

- Efeitos visuais modernos no fundo 

**3. Barra de prova social (fundo branco, ícones em azul vibrante)**

- "+ 20 anos conectando o Oeste e Litoral catarinense"

- "+30 mil clientes online"

- "Nota 4.9/5 ⭐⭐⭐⭐⭐ nas avaliações do Google" *(número com efeito count-up)*

- "Suporte e equipe técnica com gente da sua cidade!"

**4. A Promessa (fundo branco ou cinza claríssimo)**

- Headline (Sora): "Chega de esperar a página carregar..."

- Corpo: "Streaming travando, reunião caindo, jogo com lag — a SCNET existe pra resolver isso. Infraestrutura própria, tecnologia fibra óptica de ponta e uma equipe que te atende na hora!"

- CTA: "Quero dar um up na minha conexão"

**5. Diferenciais — grid de 4 cards animados (hover com leve rotação/scale)**

Headline: "Por que a galera daqui escolhe a SCNET"

- ⚡ **Ultra velocidade** — "Planos até 1 GIGA pra quem não abre mão de carregar tudo na hora."

- 📶 **Wi-Fi 7 Mesh** — "Sinal forte e rápido em cada comodo da casa"

- 🛠️ **Suporte rápido, sério!** — "Chamou, a gente escuta e resolve. Sem enrolação, sem robô travado"

- 🏆 **+ 20 anos** — "A internet mais bem avaliada do oeste e litoral catarinense"

**6. ⭐ SEÇÃO DE PLANOS (fundo branco, seção de maior destaque visual — cards em azul com o "mais escolhido" em destaque amarelo)**

Headline (Sora, grande): "Escolhe teu plano e já garante o teu Wi-Fi"

Subheadline: "Fibra própria, roteador incluso e app Skeelo de bônus. Rápido de assinar, mais rápido ainda de usar."

Renderizar 4 cards de preço lado a lado (coluna única no mobile). O card "Infinity" com badge amarelo pulsante "MAIS ESCOLHIDO":

- **Plano 450** — R$ 109,90/mês — "Pra quem quer resolver o dia a dia sem drama: redes sociais, séries e trabalho leve, tudo rodando liso." Inclui fibra própria, roteador, app Skeelo, instalação grátis*. Botão: "Bora assinar"

- **Plano 710** — R$ 129,90/mês — "Casa com mais gente conectada ao mesmo tempo? Esse aguenta o tranco — aula online, chamada de vídeo e streaming juntos, sem travar." Botão: "Bora assinar"

- **Plano Infinity (destaque)** — R$ 139,90/mês — badge "MAIS ESCOLHIDO" — "Várias telas, jogo online, home office e streaming em 4K rodando ao mesmo tempo, sem susto." Botão (maior, amarelo, com glow): "Quero o Infinity"

- **Plano Infinity Duo** — R$ 159,90/mês — "Ideal para ambientes amplos e varios dispositivos conectados — 2 roteadores garantindo Wi-Fi em todo canto." Botão: "Bora assinar"

Texto legal pequeno: "*Instalação gratuita mediante análise de crédito. Fidelidade de 12 meses (CPF) e 24 meses (PJ). Condições podem variar — confirme com um consultor."

CTA de reforço abaixo dos cards: "Não sabe qual plano é o seu? Manda um oi no WhatsApp que a gente resolve rapidinho." Botão: "Chamar no WhatsApp"

**7. Combo de benefícios extras — grid animado**

Headline: "Sua assinatura pode ter mais do que só internet"

- Streaming Sky+ (espaço para logo com breve descrição)

- Paramount+ (espaço para logo com breve descrição)

- Telecine (espaço para logo com breve descrição)

- Disney+ (espaço para logo com breve descrição)

- Premiere (espaço para logo com breve descrição)

- Nosso Futebol (espaço para logo com breve descrição)

- App Skeelo — livros e audiolivros

- Wi-Fi 7 — mais dispositivos conectados, mais alcance, mais velocidade

- Rede Mesh — sinal forte e rápido em qualquer cômodo da casa!

- SC Móvel - Internet móvel com 5G nacional

`[Nota: incluir badge sutil de upsell, como visto no material de campanha da marca: "quer mais um ponto de Wi-Fi? Só +R$ 29,90/mês" — ajuda a aumentar ticket médio sem parecer forçado]`

**8. Como contratar? (linha do tempo horizontal, ícones animados step a step)**

Headline: "Contratar é rápido e simples. Sério."

1. "Escolha seu plano no site (ou peça ajuda no WhatsApp)"

2. "Informe seus dados e assine o contrato digitalmente"

3. "Escolha o dia de instalação da sua nova internet — a gente vai até você"

4. "Pronto. Sua casa agora está conectada com a melhor internet da região!."

CTA: "Quero contratar agora"

**9. Empresas e Condomínios**

Headline: "Seu negócio não pode ficar fora do ar"

Corpo: "Comércio, escritório, indústria ou condomínio — conexão estável pra vender, atender e manter tudo operando, com suporte prioritário quando precisar."

CTA: "Quero um plano pra empresa"

**10. Depoimentos (carrossel com fotos/avatares, estrelas animadas ao entrar na viewport)**

Headline: "Quem testou, não troca"

Usar como referência de tom (adaptar, não copiar literalmente) os depoimentos reais já usados pela marca — pessoas comuns elogiando estabilidade e agilidade no atendimento, avaliação média 4.9/5 no Google. Renderizar 4 cards com nome, cidade/selo do Google e frase curta e espontânea.

**11. FAQ (accordion, ícone + com animação de abertura suave)**

Headline: "Perguntas rápidas, respostas diretas"

- "Como verificar se atendem em meu endereço?" — "Só digitar seu endereço lá em cima que a gente te fala na hora."

- "Tenho contrato com outro provedor, dá pra trocar?" — "Dá sim, e a gente ajuda a organizar isso sem dor de cabeça — garantindo seu upgrade de "

- "Tem custo de instalação?" — "Geralmente é grátis, sujeito a análise de crédito. No Infinity Duo tem uma taxa — um consultor te fala certinho."

- "Qual a diferença entre os planos?" — "Velocidade e cobertura de Wi-Fi pela casa. Na dúvida, chama no WhatsApp que a gente indica o ideal pra tua rotina."

- "Se der problema, quem resolve?" — "Time técnico próprio, local. Nada de fila de call center genérico."

**12. CTA final (fundo gradiente `#0025A2 → #0055FF`, botão amarelo pulsante)**

Headline: "Mude agora para a internet mais rápida e mais bem avaliada da região! (Icone 5 estrelas) Nota 4.9/5 no Google"

Subheadline: "+ 20 anos conectando conectando o Oeste e Litoral Catarinense. Chegou a sua vez!"

Botão 1: "Contratar online"

Botão 2: "Contratar no WhatsApp"

**13. Footer**

Logo, links institucionais (Planos, Empresas, Trabalhe conosco, FAQ, Contratos e Regulamentos, Área do cliente, App SCNET, Segunda via fatura), contato, ícones de redes sociais, botão flutuante fixo de WhatsApp em todas as seções.

### REQUISITOS TÉCNICOS

- Mobile-first e totalmente responsivo (grande parte do tráfego virá de anúncios acessados pelo celular).

- Botão flutuante de WhatsApp fixo, visível em todas as seções, com leve animação de "bounce" periódica pra chamar atenção sem ser irritante.

- Formulário de "verificar cobertura" no Hero e repetido no fechamento (seção 12).

- Botões de plano devem redirecionar para WhatsApp com mensagem pré-preenchida (ex: "Oi! Quero saber mais sobre o Plano Infinity da SCNET").

- Animações de entrada ao rolar (fade + slide), contadores animados nos números de destaque, hover states presentes em todos os botões e cards — o site deve "respirar", não ser estático.

- Use os gradientes e o amarelo com moderação estratégica: ele deve guiar o olho até os CTAs, não estar espalhado por todo lado a ponto de perder força.

### PLANOS NO POSTGRES

Os planos da home e do formulário de contratação vêm de uma tabela no Postgres
(`planos_web` por padrão), consultada só no servidor durante o SSR. As variáveis
de conexão estão documentadas no `.env.example` (`POSTGRES_URL` ou
`POSTGRES_HOST`/`POSTGRES_PORT`/`POSTGRES_DB`/`POSTGRES_USER`/`POSTGRES_PASSWORD`,
mais `POSTGRES_SSL`, `POSTGRES_SCHEMA`, `POSTGRES_PLANOS_TABLE` e
`POSTGRES_PLANOS_CACHE_SECONDS`). São variáveis de runtime — no EasyPanel entram
como Environment Variables do serviço, nunca como Build Args.

Só entram na página os registros com `ativo = true`, ordenados por
`ordem_grade`. O banco é a única fonte — não existe lista embutida de reserva:
sem configuração, sem tabela ou sem plano ativo, a home e a etapa de planos
mostram um aviso com o WhatsApp do atendimento, e o log do servidor diz o
motivo (`Planos carregados do Postgres: N` quando deu certo).

Como cada coluna aparece no site:

- `nome`, `descricao` — título e texto do card.
- `valor` — mensalidade padrão.
- `valor_primeiras_faturas` + `quant_meses_desconto` — quando preenchidos, o
  valor promocional ocupa o lugar do preço e o padrão vai logo abaixo: "nos 3
  primeiros meses, após R$ 139,90".
- `composicao` — itens separados por `;`, um por linha, todos com ícone de check.
- `url_logo_agregados` — URLs separadas por `;`, exibidas abaixo do valor com
  ~30px de altura, sob o título fixo "O que você leva".
- `destaque` + `nome_destaque` — card em destaque e o texto do selo.
- `codigo_oferta` — marca o plano como de campanha: ele **só aparece** quando a
  URL traz `?codigo_oferta=` com o mesmo valor (sem diferenciar maiúsculas ou
  espaços em volta). Plano sem esse código é normal e aparece sempre; com o
  código na URL, o plano da campanha soma-se aos normais, na ordem de
  `ordem_grade`. O parâmetro é repassado da home para `/contratacao`, então o
  plano escolhido continua visível no formulário.
- `codigo_mk`, `codigo_oferta_mk`, `composicao_resumo` — não aparecem no card.
  `codigo_mk`, `codigo_oferta_mk`, `codigo_oferta` e `composicao` seguem no
  webhook dos dois formulários, junto de `valor_primeiras_faturas` e
  `quant_meses_desconto`.

### ÁREA DO CLIENTE (`/cliente`)

Página de login com header e rodapé iguais aos das demais, reCAPTCHA v3 em toda
submissão e dois métodos de acesso, em abas:

1. **Documento do cadastro** (n8n) — CPF ou CNPJ, depois a escolha de onde
   receber um código (SMS, WhatsApp ou e-mail, só os canais que o cadastro
   tiver) e por fim o código. O documento é a referência inicial do cliente: é
   ele que diz ao n8n quais canais existem e para onde o código pode ir.
2. **E-mail ou telefone + senha** (Supabase) — entra direto, sem código. O campo
   aceita os dois: com `@` vai como e-mail, senão o número é normalizado para
   E.164 (`(49) 99999-1234` → `+5549999991234`, que é como o Supabase guarda) e
   vai como telefone. Abaixo há "Esqueci minha senha", que continua no n8n —
   pergunta o documento e manda os dados de acesso pelo WhatsApp ou e-mail do
   cadastro.

Depois do login o cliente vai para `/cliente/painel`, uma rota protegida que
nesta versão está propositalmente vazia: ela existe para receber faturas, dados
cadastrais e chamados sem retrabalho de autenticação.

**Quem decide o quê.** São dois provedores de identidade, cada um no que sabe: o
Supabase guarda e confere as senhas; o n8n conhece o cadastro do provedor, então
é ele que resolve documento, canais e código. A **sessão** não é de nenhum dos
dois — é deste servidor. Os cookies `scnet_cliente` (2h) e
`scnet_cliente_desafio` (10min) usam a sessão selada do TanStack Start: conteúdo
criptografado e assinado com `SESSION_SECRET`, `HttpOnly`, `SameSite=Lax` e
`Secure` quando em https. O navegador não lê nem forja nenhum dos dois, e nada de
sessão fica guardado no servidor — o que importa porque o container do EasyPanel
é efêmero.

O token do Supabase serve só como prova de que a senha confere e é descartado ali
mesmo: não vai ao navegador nem é guardado. Assim os dois caminhos de login
terminam no mesmo cookie, com um só dono de sessão e uma só forma de sair.

**Supabase.** Roda no mesmo EasyPanel, então `SUPABASE_URL` aponta para o
endereço interno da rede Docker (`http://supabase-kong:8000`) e nada disso tem
superfície pública. A única chave configurada é a `anon`, que é a que os
endpoints de autenticação pedem; a `service_role` ignora RLS e vale como senha
mestra do banco — quem precisa dela é o n8n, para criar e redefinir credenciais,
não o site. As variáveis são `SUPABASE_*` sem prefixo `VITE_` de propósito: o
navegador nunca fala com o Supabase (tudo passa por server functions, protegidas
por CSRF) e, na rede interna, nem conseguiria.

No Supabase, ligue "Email" e — para o login por telefone — "Phone" com um
provider de SMS. Em cada usuário, `app_metadata` deve trazer `id_cliente`, `nome`
e `documento`. O site lê `app_metadata` antes de `user_metadata` porque só a
chave de serviço escreve nele: `user_metadata` o próprio usuário altera com um
`updateUser`, e não serve para amarrar a sessão a um cliente do provedor.

**Segurança do webhook de login.** O webhook do n8n costuma ser uma URL pública,
então a defesa é dos dois lados. Do lado do site: o `id_cliente` nunca vem do
formulário (sai do cookie de desafio, selado), o navegador nunca fala com o n8n
(tudo passa por server functions, protegidas por CSRF), e cada POST vai assinado —
`X-SCNET-Timestamp` mais `X-SCNET-Assinatura` = `HMAC_SHA256(token,
"<timestamp>.<corpo>")`. Do lado do n8n, é preciso:

- ligar _Header Auth_ no nó Webhook e recusar requisição sem o Bearer — sem isso
  o token não protege nada;
- recalcular a assinatura num nó Code e recusar o que não bater ou tiver
  timestamp com mais de 5 minutos (é o que impede reenvio de uma requisição
  capturada);
- usar um path com UUID, separado do `WEBHOOK_URL` dos formulários públicos;
- se o n8n roda no mesmo EasyPanel, apontar `WEBHOOK_LOGIN_URL` para a URL
  interna da rede Docker — sem superfície pública não há o que descobrir.

**Falha fechado.** Sem `SESSION_SECRET` (mínimo de 32 caracteres) nenhum login é
aceito. Sem `WEBHOOK_LOGIN_URL` cai o acesso por documento; sem `SUPABASE_URL` ou
`SUPABASE_ANON_KEY` cai o acesso por senha. Em todos os casos o servidor registra
o motivo. É o oposto do `WEBHOOK_URL` dos formulários, que sem configuração deixa
passar: um login que passa por falta de configuração é um login que qualquer um
atravessa.

Vale para o Supabase também: quando ele não responde (rede interna fora do ar ou
timeout), a resposta é "indisponível", não "senha incorreta" — e a tentativa não
é contada. Dizer o contrário mentiria para quem digitou a senha certa e ainda
gastaria uma das três tentativas dessa pessoa.

**Tentativas.** Duas travas independentes valem no `/cliente`, e é bom não
confundi-las:

- `src/lib/tentativas-login.ts` conta só as tentativas que **falharam**, por
  credencial: três erros no mesmo documento, e-mail ou telefone bloqueiam aquele
  acesso por 5 minutos. É a trava contra adivinhar senha, e a chave é o
  identificador já normalizado — do contrário bastaria variar a pontuação do
  telefone para reiniciar o contador. O IP também é contado aqui, com
  limite bem mais folgado (15 falhas), porque no Brasil vários clientes saem
  pelo mesmo IP público (CGNAT das operadoras móveis, NAT de empresas e
  condomínios) — travar o IP em 3 deixaria vizinhos de fora por causa de um só.
- `src/lib/rate-limit.ts` é o throttle de volume por IP descrito em "Limite de
  envios por IP", aplicado pelo middleware a toda server function que muda
  estado, inclusive as de login.

Os dois contadores vivem na memória do processo: reiniciar o container ou rodar
duas instâncias zera a contagem.

Os eventos e o formato das respostas esperadas do n8n estão documentados no
`.env.example`, junto das cinco variáveis da área do cliente — `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `WEBHOOK_LOGIN_URL`, `WEBHOOK_LOGIN_TOKEN` e
`SESSION_SECRET`. Todas são de runtime: no EasyPanel entram como Environment
Variables, nunca como Build Args. (Os nomes antigos `WEBHOOK_PAINEL_CLIENTE` e
`WEBHOOK_PAINEL_CLIENTE_TOKEN` continuam sendo aceitos, para que uma implantação
já no ar não caia ao atualizar.)

This project was built with [Lovable](https://lovable.dev).

## Segurança dos formulários e do webhook

Os dois formulários (lead da home e as 4 etapas de `/contratacao`) são server
functions do TanStack Start, ou seja, endpoints HTTP públicos em `/_serverFn/…`.
Qualquer um pode postar neles direto, sem passar pelo navegador — então nada que
chega do cliente é tratado como confiável.

### Limite de envios por IP

`src/lib/rate-limit.ts`, aplicado em `src/start.ts` antes do parse do corpo:

- **15 envios por minuto por IP** (janela deslizante).
- Ao estourar, **5 minutos de bloqueio** (HTTP 429 + `Retry-After`). O bloqueio
  não é renovado por novas tentativas — expira 5 minutos após o estouro.
- Corpo acima de **30MB** é recusado com 413 sem ser lido.
- Só vale para `serverFn`; navegação e assets não são limitados.
- Dentro de `serverFn`, contam só as que **mudam estado** (POST). As de leitura
  (`fetchPlanos`, `getSessaoCliente`) rodam a cada navegação — home, contratação
  e toda página da área do cliente chamam uma delas —, então contá-las gastaria
  a cota só navegando. Não recebem corpo nem disparam webhook.

O contador vive na memória do processo. A instância única do `Dockerfile` está
coberta; **com réplicas, cada uma teria seu próprio contador** e o store
precisaria ir para um Redis compartilhado. Operadoras móveis usam CGNAT, então
vários clientes podem compartilhar um IP — 15/min tolera isso com folga para um
formulário de 4 etapas, e quem for barrado cai no redirecionamento para o
WhatsApp que já existe.

### Anexos

`src/lib/attachment-validation.ts`, usado pelo servidor e pelo formulário:

- MIME em allowlist (PDF, PNG, JPEG) e **máximo 2 anexos**.
- Tamanho **recalculado do base64**, teto de 10MB — o `tamanho` informado pelo
  cliente é descartado.
- **Magic bytes** conferidos contra o MIME declarado: um `.exe`, HTML ou script
  renomeado para `.pdf` é recusado.
- Nome do arquivo saneado e com a **extensão reescrita a partir do MIME**, o que
  fecha path traversal (`../../shell.php`), dupla extensão (`doc.pdf.exe`),
  caracteres de controle e marcas bidi do Unicode.

### reCAPTCHA

Sem `RECAPTCHA_SECRET_KEY` a verificação fica desligada (dev local). Com a chave
configurada ela é **obrigatória**: requisição sem token, com token inválido ou
com token de outra `action`/hostname é recusada. Só o Google estar fora do ar
libera o envio — ver o comentário em `.env.example`.

### Webhook (n8n)

Em produção o envio **não sai sem `WEBHOOK_TOKEN`**. O nó do n8n precisa exigir
o header `Authorization`, e deve revalidar do seu lado o nome, o tipo e o
tamanho dos anexos antes de gravar qualquer coisa: um webhook alcançável por URL
não pode depender só do bom comportamento de quem chama.

Campos de texto livre que seguem para o n8n recebem um apóstrofo à frente quando
começam com `=`, `+`, `-` ou `@`, para não virarem fórmula se o fluxo gravar em
planilha.

### Testes

```sh
bun run test
```

Cobrem a janela do rate limit, o bloqueio de 5 minutos, o isolamento por IP e
cada vetor de anexo malicioso.

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0d3d8a0e-06f9-43a2-9cb8-7d4d572fbb31).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
