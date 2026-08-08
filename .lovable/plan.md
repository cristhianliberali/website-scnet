Validação do segundo telefone no assistente de contratação

Objetivo
Tornar o campo "2° telefone para contato" obrigatório no 3° passo (Cadastro) e impedir que o usuário informe o mesmo número usado no telefone principal.

Alterações previstas

1. Ajustar o rótulo do campo
   - Remover o texto "(opcional)" do label.
   - Deixar o label como "2° telefone para contato" para indicar que é obrigatório, como os demais campos do passo.

2. Reforçar a validação no passo 2 (Cadastro)
   - No método `validate(target === 2)`, exigir que `person.telefone2` seja preenchido e válido.
   - Se `person.telefone2` estiver vazio, exibir erro: "Informe um segundo telefone".
   - Se `person.telefone2` for igual a `person.telefone` (após normalizar para somente dígitos), exibir erro: "Deve ser diferente do telefone principal".
   - A validação de formato existente (DDD + 8 ou 9 dígitos) continua valendo.

3. Manter o feedback visual
   - O erro deve ativar a borda vermelha e a mensagem em vermelho abaixo do campo, seguindo o padrão atual do componente.

4. Ajustar o placeholder (opcional de UX)
   - Mudar o placeholder de "(49) 3333-3333" para algo que reforce o caráter de "segundo número", por exemplo "(49) 3333-3333" permanece aceitável; o foco é mesmo na validação e no label.

Arquivo afetado
- `src/components/scnet/contract-wizard.tsx`: alterações na label (linha ~568) e no bloco de validação `if (target === 2)` (linha ~286).

Validação pós-implementação
- Enviar o formulário sem preencher o 2° telefone e confirmar que o campo fica em vermelho com a mensagem de obrigatoriedade.
- Preencher o 2° telefone com o mesmo número do telefone principal e confirmar que o erro de "diferente do principal" aparece.
- Preencher com um número válido e diferente e confirmar que a contratação continua normalmente.
