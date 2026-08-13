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
`ordem_grade`. Sem banco configurado (ou se a consulta falhar) o site cai na
lista de fallback de `src/lib/plans.ts`.

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
- `codigo_mk`, `composicao_resumo` — não aparecem no card; `codigo_mk` e
  `composicao` seguem no webhook dos dois formulários, junto de
  `valor_primeiras_faturas` e `quant_meses_desconto`.

This project was built with [Lovable](https://lovable.dev).

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
