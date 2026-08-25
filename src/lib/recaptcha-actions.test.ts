/**
 * Os dois lados do reCAPTCHA precisam dizer a MESMA palavra.
 *
 * O token do v3 carrega o nome da ação com que foi gerado, e o servidor recusa
 * um token de ação diferente. Quando a palavra é escrita à mão em dois arquivos,
 * nada avisa que elas divergiram — e o formulário passa a recusar 100% dos
 * envios com `action_mismatch`, gente real inclusive, dizendo "não conseguimos
 * confirmar que você não é um robô".
 *
 * Foi o que aconteceu com o "Contrate agora" da home: o componente gerava o
 * token com `contract_form_submit` e o endpoint conferia `lead_submit`. Nenhum
 * teste quebrou, o TypeScript não tinha o que reclamar (são duas strings
 * válidas) e o log só dizia "blocked by reCAPTCHA".
 *
 * A correção foi a action passar a vir do endpoint. Este teste existe para que
 * ela não volte a ser escrita à mão: ele lê o código-fonte dos formulários,
 * porque o acoplamento que se quer proteger é textual — não há tipo que o
 * expresse.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { RECAPTCHA_ACTION_LEAD } from "./submit-lead";

const raiz = join(import.meta.dir, "..");
const ler = (caminho: string) => readFileSync(join(raiz, caminho), "utf8");

/** Os formulários que enviam para `submitLead`. */
const FORMULARIOS_DE_LEAD = [
  "components/scnet/lead-form.tsx",
  "components/scnet/contract-form.tsx",
];

describe("action do reCAPTCHA nos formulários de lead", () => {
  for (const arquivo of FORMULARIOS_DE_LEAD) {
    test(`${arquivo} usa a constante do endpoint, não uma string própria`, () => {
      const fonte = ler(arquivo);

      // Gera o token com a mesma constante que o servidor confere.
      expect(fonte).toContain("getRecaptchaToken(RECAPTCHA_ACTION_LEAD)");

      // E não com uma string escrita à mão, que é como as duas se separaram.
      const literal = /getRecaptchaToken\(\s*["'`]/.exec(fonte);
      expect(literal).toBeNull();
    });
  }

  test("a action continua sendo um nome que o Google aceita", () => {
    // O reCAPTCHA só aceita letras, números, barra e sublinhado na action;
    // qualquer outro caractere faz o Google descartar o nome silenciosamente —
    // e aí a conferência do servidor reprova tudo.
    expect(RECAPTCHA_ACTION_LEAD).toMatch(/^[A-Za-z0-9/_]+$/);
  });
});

describe("as etapas da contratação", () => {
  test("cliente e servidor montam a action com o mesmo id de etapa", () => {
    // Aqui a action é montada (`contratacao_${id}`) dos dois lados. O que
    // garante o encontro é o id viajar no mesmo envio que o token: o componente
    // manda `etapa_id: stepInfo.id` junto do token gerado com esse mesmo id.
    const componente = ler("components/scnet/contract-wizard.tsx");
    expect(componente).toContain("getRecaptchaToken(`contratacao_${stepInfo.id}`)");
    expect(componente).toContain("etapa_id: stepInfo.id");

    const servidor = ler("lib/submit-contract-step.ts");
    expect(servidor).toContain("`contratacao_${data.etapa_id}`");
  });
});
