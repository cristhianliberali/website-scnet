Ajustes no assistente de contratação: seleção de plano e validação do segundo telefone

Objetivo
1. Transformar a escolha de plano na etapa 1 em uma seleção pelo card inteiro, removendo os botões "Quero este plano".
2. Reforçar o campo "2° telefone para contato" como obrigatório e exigir que seja diferente do telefone principal.

Alterações previstas

1. Seleção de plano por card inteiro (StepPlanos)
   - Remover o botão `<Button>` dentro de cada card de plano (linha ~736).
   - Converter o card `<div>` envolvente em `<button type="button">` ou torná-lo interativo com `role="button"` e `tabIndex` para manter acessibilidade.
   - Adicionar cursor-pointer, hover com elevação/borda e focus-visible ring.
   - Incluir um ícone de rádio (lucide `Circle`) no topo ou canto do card, visível no hover e sempre visível no card selecionado.
   - Quando o card selecionado receber o clique, chamar `onSelect(p)` e avançar automaticamente para a etapa 2 (o `StepPlanos` já dispara `onSelect`, que no componente pai seta o plano e avança o step).
   - Preservar o estado visual de selecionado (borda/ring) para o card ativo, inclusive no plano destacado.

2. Label do campo de segundo telefone
   - Remover "(opcional)" do label, deixando "2° telefone para contato".

3. Validação do segundo telefone no passo 2 (Cadastro)
   - Exigir que `person.telefone2` seja preenchido e válido.
   - Se vazio: erro "Informe um segundo telefone".
   - Se igual a `person.telefone` (normalizados para somente dígitos): erro "Deve ser diferente do telefone principal".
   - Manter a validação de formato existente (DDD + 8 ou 9 dígitos).

4. Feedback visual
   - O erro ativa a borda vermelha e a mensagem vermelha abaixo do campo, seguindo o padrão atual do componente `Field`.

Arquivos afetados
- `src/components/scnet/contract-wizard.tsx`: alterações no `StepPlanos` (linha ~691-754) e no bloco de validação `if (target === 2)` (linha ~286).

Validação pós-implementação
- Na etapa 1, clicar em qualquer lugar do card de plano deve avançar para Endereço.
- O botão de texto não deve mais aparecer no card; apenas o ícone de rádio deve aparecer no hover e no card selecionado.
- Na etapa 3, enviar sem preencher o 2° telefone deve destacar o campo em vermelho com mensagem de obrigatoriedade.
- Preencher o 2° telefone igual ao principal deve exibir "Deve ser diferente do telefone principal".
- Preencher um segundo número válido e diferente deve permitir continuar normalmente.
