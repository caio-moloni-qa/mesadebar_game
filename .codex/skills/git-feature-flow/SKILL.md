# Skill: Git Feature Branch and Pull Request Flow

## Identidade da skill

Você é responsável por executar o fluxo Git de cada implementação realizada no projeto.

Seu objetivo é garantir que toda feature, correção ou melhoria:

1. seja iniciada a partir da branch `main` atualizada;
2. seja desenvolvida em uma branch própria;
3. possua commits claros e organizados;
4. seja validada antes da publicação;
5. seja enviada para o repositório remoto;
6. gere um pull request direcionado para a `main`;
7. nunca seja integrada diretamente na `main` sem pull request.

Esta skill cuida exclusivamente do fluxo Git.

Ela não deve alterar as decisões técnicas, regras de negócio ou arquitetura da implementação.

---

# Objetivo principal

Para cada nova implementação solicitada, executar o seguinte fluxo:

```text
Atualizar main
      ↓
Criar branch da implementação
      ↓
Executar a implementação
      ↓
Validar os arquivos alterados
      ↓
Executar testes e verificações
      ↓
Criar commits
      ↓
Enviar branch para o remoto
      ↓
Criar Pull Request para main
      ↓
Apresentar link e resumo do PR
```

---

# Pré-requisitos

Antes de executar o fluxo, verificar se estão disponíveis:

* Git;
* repositório Git inicializado;
* remote configurado;
* acesso ao repositório remoto;
* GitHub CLI, representado pelo comando `gh`;
* autenticação válida no GitHub CLI.

Executar as verificações:

```bash
git --version
git rev-parse --is-inside-work-tree
git remote -v
gh --version
gh auth status
```

Se o GitHub CLI não estiver autenticado, informar que é necessário executar:

```bash
gh auth login
```

Não solicitar, exibir ou armazenar tokens de acesso no código, nos commits ou nos arquivos do projeto.

---

# Premissas padrão

Assumir inicialmente:

```text
Branch principal: main
Remote principal: origin
Plataforma de hospedagem: GitHub
Ferramenta de Pull Request: GitHub CLI
```

Antes de executar comandos destrutivos ou publicar alterações, confirmar essas informações por meio do próprio repositório.

Verificar a branch padrão do remote com:

```bash
git remote show origin
```

Caso a branch principal do repositório não seja `main`, utilizar a branch padrão identificada e informar essa adaptação.

---

# Regras obrigatórias

## Nunca desenvolver diretamente na main

Não realizar alterações intencionais na branch `main`.

A `main` deve ser utilizada apenas para:

* sincronização com o remoto;
* criação de novas branches;
* consulta;
* comparação;
* retorno após o encerramento de um fluxo.

## Toda implementação deve possuir uma branch

Cada feature, correção ou tarefa deve possuir sua própria branch.

Exemplos:

```text
feature/player-movement
feature/enemy-spawner
feature/automatic-attack
feature/experience-system
fix/projectile-collision
fix/player-damage-cooldown
refactor/weapon-system
chore/update-phaser
docs/update-readme
```

## Toda branch deve nascer da main atualizada

Não criar uma nova branch a partir de outra feature, salvo quando isso for explicitamente solicitado.

## Toda alteração deve retornar por Pull Request

Não executar:

```bash
git merge feature/nome-da-feature
```

diretamente na `main`.

Não executar push direto para a `main`.

Não concluir o fluxo sem criar o pull request, exceto quando houver impedimento técnico claramente informado.

## Não fazer merge automático do Pull Request

Por padrão, esta skill deve:

* criar a branch;
* publicar a branch;
* criar o pull request;
* apresentar o PR criado.

Ela não deve aprovar nem fazer merge do próprio pull request.

O merge deve permanecer como uma decisão posterior do usuário ou dos revisores.

---

# Convenção de nomes de branch

Utilizar o formato:

```text
<tipo>/<descricao-curta-em-kebab-case>
```

Tipos permitidos:

| Tipo       | Uso                                           |
| ---------- | --------------------------------------------- |
| `feature`  | Nova funcionalidade                           |
| `fix`      | Correção de erro                              |
| `refactor` | Refatoração sem mudança funcional intencional |
| `chore`    | Configuração, manutenção ou dependências      |
| `docs`     | Documentação                                  |
| `test`     | Criação ou manutenção de testes               |
| `style`    | Formatação ou alteração exclusivamente visual |
| `perf`     | Melhoria de desempenho                        |
| `build`    | Build, empacotamento ou ferramentas           |
| `ci`       | Integração contínua                           |

Exemplos válidos:

```text
feature/player-movement
feature/enemy-spawn-system
fix/enemy-outside-camera
refactor/game-scene
test/weapon-system
docs/setup-instructions
```

Evitar:

```text
minha-branch
teste
nova-feature
alteracoes
giovanni
branch-final
feature1
```

---

# Geração do nome da branch

Ao receber uma tarefa:

1. identificar o tipo da alteração;
2. extrair a responsabilidade principal;
3. gerar uma descrição curta;
4. converter a descrição para inglês;
5. utilizar letras minúsculas;
6. separar palavras com hífen;
7. remover acentos e caracteres especiais.

Exemplo:

```text
Tarefa:
Implementar movimentação do jogador com WASD

Branch:
feature/player-movement
```

Exemplo:

```text
Tarefa:
Corrigir aplicação repetida de dano no jogador

Branch:
fix/player-repeated-damage
```

Caso exista um identificador de tarefa, adicioná-lo quando o projeto utilizar esse padrão:

```text
feature/game-142-player-movement
fix/game-198-projectile-collision
```

Não inventar identificadores de tarefa.

---

# Estado inicial do repositório

Antes de trocar de branch, verificar:

```bash
git status --short
git branch --show-current
```

## Diretório de trabalho limpo

Se não houver alterações pendentes, continuar normalmente.

## Alterações pendentes relacionadas à implementação atual

Caso as alterações já tenham sido produzidas antes da criação da branch:

1. não descartá-las;
2. criar a branch apropriada imediatamente;
3. confirmar que as alterações permaneceram presentes;
4. continuar o fluxo na nova branch.

Exemplo:

```bash
git switch -c feature/player-movement
git status --short
```

## Alterações pendentes não relacionadas

Não incluir alterações de outras tarefas no mesmo pull request.

Não executar automaticamente:

```bash
git reset --hard
git clean -fd
git checkout -- .
git restore .
```

Esses comandos podem remover trabalho existente.

Quando houver alterações não relacionadas:

* preservar os arquivos;
* separar somente as alterações pertencentes à tarefa;
* utilizar `git stash` apenas quando for seguro e necessário;
* identificar claramente qualquer bloqueio.

Exemplo de stash identificado:

```bash
git stash push -u -m "temporary: unrelated changes before feature/player-movement"
```

Após criar a branch correta, restaurar quando apropriado:

```bash
git stash pop
```

Verificar conflitos imediatamente após restaurar o stash.

---

# Atualização da main

Com o diretório de trabalho em estado seguro, executar:

```bash
git switch main
git fetch origin
git pull --ff-only origin main
```

O uso de `--ff-only` evita criar um merge commit inesperado durante a atualização da `main`.

Após a atualização, verificar:

```bash
git status
git log -1 --oneline
```

A branch deve estar sincronizada e sem alterações pendentes antes da criação da feature branch.

---

# Criação da branch

Criar a branch a partir da `main` atualizada:

```bash
git switch -c <branch-name>
```

Exemplo:

```bash
git switch -c feature/player-movement
```

Confirmar:

```bash
git branch --show-current
git status
```

A implementação somente deve prosseguir depois que a branch ativa for confirmada.

---

# Branch já existente localmente

Se a branch já existir, não tentar recriá-la.

Verificar:

```bash
git branch --list <branch-name>
```

Caso exista:

```bash
git switch <branch-name>
```

Depois, verificar a relação da branch com a `main`:

```bash
git merge-base --is-ancestor main HEAD
```

Se a branch estiver desatualizada, sincronizar conforme as regras do projeto.

---

# Branch já existente no remoto

Verificar:

```bash
git ls-remote --heads origin <branch-name>
```

Se a branch existir apenas no remoto:

```bash
git switch --track origin/<branch-name>
```

Não sobrescrever uma branch remota existente sem compreender sua finalidade.

Não executar force push por padrão.

---

# Implementação

Após criar a branch:

1. executar a implementação solicitada;
2. manter as mudanças dentro do escopo da tarefa;
3. evitar refatorações não relacionadas;
4. evitar modificar arquivos sem necessidade;
5. não adicionar arquivos temporários;
6. não adicionar dados sensíveis;
7. manter o projeto executável;
8. atualizar testes e documentação quando necessário.

Durante a implementação, verificar periodicamente:

```bash
git status --short
git diff
```

---

# Escopo da branch

Uma branch deve representar uma única responsabilidade principal.

Exemplo adequado:

```text
feature/player-movement
```

Pode conter:

* entidade do jogador;
* leitura de teclado;
* configuração de velocidade;
* testes relacionados;
* documentação estritamente relacionada.

Não deve conter ao mesmo tempo:

* sistema de inimigos;
* sistema de experiência;
* reformulação completa do menu;
* atualização não relacionada de dependências.

Quando forem encontradas alterações fora do escopo, não incluí-las automaticamente no commit.

---

# Validação antes dos commits

Antes de criar os commits, executar as validações disponíveis no projeto.

Identificar os scripts em:

```text
package.json
pom.xml
build.gradle
Makefile
README.md
```

Para projetos Phaser com TypeScript e Vite, procurar inicialmente por:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Executar apenas scripts que realmente existam no projeto.

Uma sequência comum pode ser:

```bash
npm run lint
npm run test
npm run build
```

Não inventar scripts inexistentes.

Caso o projeto não tenha testes, informar isso no pull request.

Caso alguma validação falhe:

1. investigar;
2. corrigir quando a falha pertencer à implementação;
3. executar novamente;
4. não declarar sucesso enquanto houver falhas relacionadas.

Caso exista uma falha anterior e não relacionada:

* não escondê-la;
* registrar claramente no pull request;
* diferenciar falhas preexistentes de falhas introduzidas pela branch.

---

# Inspeção das alterações

Antes do commit, executar:

```bash
git status --short
git diff
git diff --stat
```

Verificar:

* arquivos alterados;
* arquivos novos;
* arquivos removidos;
* alterações acidentais;
* logs de depuração;
* comentários temporários;
* credenciais;
* arquivos gerados;
* dependências alteradas;
* formatação indevida.

Também verificar arquivos ignorados e potencialmente sensíveis:

```text
.env
.env.local
node_modules/
dist/
coverage/
*.log
tokens
credentials
private keys
```

Não adicionar arquivos sensíveis ao repositório.

---

# Adição de arquivos ao stage

Preferir adicionar somente os arquivos relacionados à tarefa.

Exemplo:

```bash
git add src/entities/Player.ts
git add src/scenes/GameScene.ts
git add src/config/playerConfig.ts
```

Quando todas as alterações do diretório pertencerem comprovadamente à tarefa, pode ser utilizado:

```bash
git add .
```

Depois, revisar obrigatoriamente:

```bash
git diff --cached
git diff --cached --stat
```

Não criar commit sem revisar o conteúdo staged.

---

# Convenção de commits

Utilizar Conventional Commits.

Formato:

```text
<tipo>(<escopo opcional>): <descrição>
```

Tipos principais:

```text
feat
fix
refactor
test
docs
chore
style
perf
build
ci
```

Exemplos:

```text
feat(player): add WASD movement
feat(enemies): add timed enemy spawning
fix(combat): prevent repeated collision damage
refactor(weapons): extract automatic attack logic
test(player): cover movement normalization
docs(readme): add local setup instructions
```

Regras:

* escrever em inglês;
* utilizar verbo no imperativo ou descrição objetiva;
* manter o título curto;
* não terminar com ponto;
* não utilizar mensagens genéricas;
* não mencionar arquivos como única descrição;
* representar claramente a alteração.

Evitar:

```text
update
changes
fix
final
working
new files
commit feature
```

---

# Organização dos commits

Quando a implementação for pequena e coesa, utilizar um único commit.

Quando houver responsabilidades claramente separadas, utilizar múltiplos commits.

Exemplo:

```text
feat(player): add keyboard movement
test(player): cover diagonal movement normalization
docs(readme): document player controls
```

Não criar commits artificiais apenas para aumentar a quantidade.

Não misturar correções não relacionadas no mesmo commit.

---

# Criação do commit

Depois da revisão:

```bash
git commit -m "feat(player): add WASD movement"
```

Para mensagens com descrição adicional:

```bash
git commit \
  -m "feat(player): add WASD movement" \
  -m "Add normalized keyboard movement using WASD and arrow keys."
```

Após o commit:

```bash
git status
git log --oneline --decorate -5
```

O diretório deve estar limpo ou conter apenas alterações conscientemente não incluídas.

---

# Comparação com a main

Antes de publicar a branch, revisar tudo que fará parte do pull request:

```bash
git diff main...HEAD
git diff --stat main...HEAD
git log --oneline main..HEAD
```

Verificar se:

* todos os commits pertencem à tarefa;
* nenhum arquivo inesperado está presente;
* a branch possui diferença real em relação à `main`;
* o histórico é compreensível;
* a implementação está finalizada.

---

# Sincronização com a main antes do PR

Antes da publicação final:

```bash
git fetch origin
```

Verificar se a `main` remota avançou:

```bash
git log --oneline HEAD..origin/main
```

Caso não exista saída, a branch está baseada na versão atual conhecida da `main`.

Caso a `main` tenha novos commits, atualizar a feature branch.

## Estratégia padrão com rebase

Quando a branch ainda pertence apenas ao autor e não é compartilhada:

```bash
git rebase origin/main
```

Resolver conflitos, quando houver:

```bash
git status
git add <arquivo-resolvido>
git rebase --continue
```

Para cancelar o rebase:

```bash
git rebase --abort
```

Após o rebase, executar novamente os testes e validações.

## Branch já publicada ou compartilhada

Não reescrever o histórico de uma branch compartilhada sem necessidade.

Nesse caso, preferir a estratégia definida pelo projeto.

Quando não houver regra definida, realizar merge da `main` na branch:

```bash
git merge origin/main
```

Resolver conflitos e validar novamente.

---

# Push da branch

Na primeira publicação:

```bash
git push -u origin <branch-name>
```

Exemplo:

```bash
git push -u origin feature/player-movement
```

Em publicações posteriores:

```bash
git push
```

Não executar:

```bash
git push --force
```

Force push é proibido por padrão.

Quando um rebase exigir atualização de uma branch remota pertencente exclusivamente ao autor, utilizar somente após avaliação explícita:

```bash
git push --force-with-lease
```

Preferir `--force-with-lease` em vez de `--force`.

---

# Verificação de Pull Request existente

Antes de criar um novo PR, verificar se a branch já possui um pull request:

```bash
gh pr list \
  --head <branch-name> \
  --base main \
  --state open
```

Também pode ser utilizado:

```bash
gh pr view <branch-name>
```

Se já existir um PR aberto:

* não criar outro;
* atualizar a branch;
* apresentar o PR existente;
* atualizar título ou descrição somente quando necessário.

---

# Criação do Pull Request

Criar o pull request com:

```bash
gh pr create \
  --base main \
  --head <branch-name> \
  --title "<titulo>" \
  --body "<descricao>"
```

Exemplo:

```bash
gh pr create \
  --base main \
  --head feature/player-movement \
  --title "feat(player): add keyboard movement" \
  --body "## Summary

- add player movement with WASD
- add support for arrow keys
- normalize diagonal movement
- integrate player movement with GameScene

## Validation

- npm run lint
- npm run test
- npm run build"
```

---

# Título do Pull Request

O título deve representar claramente o resultado da branch.

Preferir o formato Conventional Commit:

```text
feat(player): add keyboard movement
fix(combat): prevent repeated player damage
refactor(game): extract enemy spawning system
```

O título não deve ser:

```text
New PR
Feature
Alterações
Finalização
Player
Update branch
```

---

# Corpo do Pull Request

O corpo deve utilizar a seguinte estrutura:

```markdown
## Summary

- descrição da principal alteração;
- descrição de comportamentos importantes;
- descrição de integrações relevantes.

## Changes

- arquivos ou sistemas principais alterados;
- regras implementadas;
- decisões técnicas relevantes.

## Validation

- [x] lint executado;
- [x] testes executados;
- [x] build executado;
- [x] validação manual executada.

## How to test

1. iniciar o projeto;
2. acessar a funcionalidade;
3. executar as ações necessárias;
4. confirmar o comportamento esperado.

## Notes

- limitações conhecidas;
- decisões deixadas para tarefas futuras;
- falhas preexistentes;
- informações úteis para revisão.
```

Não marcar uma validação como concluída quando ela não tiver sido executada.

Quando não existir uma verificação:

```markdown
- [ ] Tests — project does not currently provide automated tests
```

---

# Geração segura do corpo do PR

Para evitar problemas com quebras de linha e caracteres especiais, preferir um arquivo temporário:

```bash
cat > /tmp/pr-body.md <<'EOF'
## Summary

- add player movement with WASD and arrow keys
- normalize diagonal movement
- connect movement logic to the Phaser player entity

## Validation

- [x] npm run lint
- [x] npm run test
- [x] npm run build

## How to test

1. Start the application.
2. Open the game scene.
3. Move the player using WASD.
4. Move the player using the arrow keys.
5. Confirm that diagonal movement has consistent speed.
EOF
```

Criar o PR:

```bash
gh pr create \
  --base main \
  --head feature/player-movement \
  --title "feat(player): add keyboard movement" \
  --body-file /tmp/pr-body.md
```

Remover o arquivo temporário depois:

```bash
rm -f /tmp/pr-body.md
```

Não criar o arquivo temporário dentro do repositório.

---

# Pull Request em modo draft

Quando a implementação precisar ser publicada, mas ainda não estiver pronta para revisão, utilizar:

```bash
gh pr create \
  --draft \
  --base main \
  --head <branch-name> \
  --title "<titulo>" \
  --body-file <arquivo>
```

Por padrão, ao final de uma implementação considerada concluída, criar um PR pronto para revisão, sem `--draft`.

Não abrir PR como pronto quando:

* testes relevantes estão falhando;
* a implementação está incompleta;
* existem decisões bloqueantes;
* faltam arquivos essenciais;
* o código não compila.

---

# Labels, reviewers e responsáveis

Adicionar labels ou reviewers somente quando:

* o projeto possuir convenções conhecidas;
* os nomes forem fornecidos;
* os dados puderem ser descobertos com segurança no repositório.

Exemplo:

```bash
gh pr create \
  --base main \
  --head feature/player-movement \
  --title "feat(player): add keyboard movement" \
  --body-file /tmp/pr-body.md \
  --label enhancement
```

Exemplo com reviewer:

```bash
gh pr edit <pr-number> --add-reviewer <github-username>
```

Não inventar:

* usernames;
* nomes de equipes;
* labels;
* milestones;
* projetos.

---

# Verificação após criar o PR

Depois da criação, executar:

```bash
gh pr view --web
```

Quando não for apropriado abrir o navegador:

```bash
gh pr view \
  --json number,title,url,state,baseRefName,headRefName
```

Confirmar:

* número do PR;
* título;
* URL;
* branch base;
* branch de origem;
* estado;
* existência dos commits esperados.

---

# Verificação de checks

Após criar o PR, consultar os checks disponíveis:

```bash
gh pr checks
```

Se os checks já tiverem terminado, informar o resultado.

Se estiverem pendentes, informar apenas que foram iniciados ou permanecem pendentes.

Não afirmar que o CI passou antes da conclusão.

Esta skill não deve aguardar indefinidamente os checks.

---

# Resultado esperado ao final

Ao finalizar, apresentar:

```text
Branch criada:
feature/player-movement

Commits:
abc1234 feat(player): add WASD movement
def5678 test(player): cover diagonal movement

Validações:
- lint: aprovado
- testes: aprovados
- build: aprovado

Pull Request:
#12 feat(player): add keyboard movement
https://github.com/organization/repository/pull/12

Base:
main

Head:
feature/player-movement
```

Também informar claramente:

* validações não executadas;
* testes inexistentes;
* falhas conhecidas;
* conflitos;
* arquivos não incluídos;
* qualquer impedimento para criar o PR.

---

# Tratamento de erros

## Main inexistente

Verificar a branch padrão:

```bash
git remote show origin
git branch -a
```

Adaptar o fluxo para a branch principal real.

## Remote origin inexistente

Verificar:

```bash
git remote -v
```

Não inventar a URL do repositório.

Informar que não é possível publicar a branch ou criar o PR sem remote configurado.

## Falha de autenticação

Executar:

```bash
gh auth status
```

Informar que a autenticação precisa ser corrigida.

Não solicitar que o usuário cole um token no chat, código ou terminal registrado.

## Branch sem alterações

Verificar:

```bash
git diff main...HEAD
git log main..HEAD
```

Não criar pull request vazio.

Informar que não existem alterações ou commits para publicar.

## Push rejeitado

Executar:

```bash
git fetch origin
git status
```

Investigar:

* branch remota avançou;
* falta de permissão;
* proteção de branch;
* histórico divergente;
* autenticação;
* remote incorreto.

Não utilizar force push automaticamente como primeira solução.

## Pull Request já existente

Não criar duplicata.

Utilizar:

```bash
gh pr view <branch-name>
```

Apresentar o PR existente.

## Conflitos

Não ignorar conflitos.

Listar:

```bash
git status
```

Resolver apenas conflitos relacionados e compreendidos.

Depois:

```bash
git add <arquivos>
git rebase --continue
```

ou:

```bash
git commit
```

quando o fluxo utilizado for merge.

Executar novamente todas as validações relevantes.

---

# Comandos proibidos por padrão

Não executar automaticamente:

```bash
git reset --hard
git clean -fd
git clean -fdx
git push --force
git branch -D
git checkout -- .
git restore .
git commit --amend
git rebase -i
gh pr merge
gh pr close
```

Esses comandos podem remover trabalho, reescrever histórico ou concluir ações que precisam de decisão explícita.

Também não:

* apagar branches de outros desenvolvedores;
* alterar configuração global do Git;
* alterar autor dos commits;
* armazenar credenciais;
* modificar regras de proteção da `main`;
* fazer merge do próprio PR;
* aprovar o próprio PR.

---

# Fluxo completo obrigatório

Para uma nova implementação chamada `player movement`, executar conceitualmente:

```bash
git status --short
git branch --show-current

git switch main
git fetch origin
git pull --ff-only origin main

git switch -c feature/player-movement

# executar implementação

git status --short
git diff
npm run lint
npm run test
npm run build

git add <arquivos-da-feature>
git diff --cached
git commit -m "feat(player): add keyboard movement"

git fetch origin
git rebase origin/main

npm run lint
npm run test
npm run build

git push -u origin feature/player-movement

gh pr list \
  --head feature/player-movement \
  --base main \
  --state open

gh pr create \
  --base main \
  --head feature/player-movement \
  --title "feat(player): add keyboard movement" \
  --body-file /tmp/pr-body.md

gh pr view \
  --json number,title,url,state,baseRefName,headRefName

gh pr checks
```

Adaptar os comandos às ferramentas e scripts reais do projeto.

---

# Integração com a skill de implementação

Quando utilizada junto com outra skill, como uma skill de desenvolvimento Phaser:

## Antes da implementação

A skill de Git deve:

1. verificar o repositório;
2. atualizar a `main`;
3. criar a branch;
4. confirmar a branch ativa.

## Durante a implementação

A skill técnica deve:

1. produzir o código;
2. executar os testes;
3. informar arquivos criados e alterados.

A skill de Git deve:

1. acompanhar os arquivos modificados;
2. impedir mistura de escopos;
3. preparar commits coerentes.

## Depois da implementação

A skill de Git deve:

1. revisar as alterações;
2. executar ou confirmar as validações;
3. criar commits;
4. sincronizar com a `main`;
5. publicar a branch;
6. criar o pull request;
7. apresentar o resultado.

---

# Responsabilidade entre skills

A skill de Git não deve:

* escolher a arquitetura do jogo;
* implementar regras de gameplay;
* decidir atributos de inimigos;
* criar armas;
* modificar regras de negócio sem solicitação.

A skill de Phaser não deve:

* fazer push direto na `main`;
* criar branches sem seguir esta skill;
* fazer merge automático;
* ignorar validações;
* misturar várias funcionalidades não relacionadas.

---

# Formato de resposta durante o fluxo

## Início

```text
Git flow iniciado.

Base: main
Branch: feature/player-movement
Remote: origin
```

## Antes do commit

```text
Arquivos alterados:
- src/entities/Player.ts
- src/scenes/GameScene.ts
- src/config/playerConfig.ts

Validações:
- lint: aprovado
- testes: aprovado
- build: aprovado
```

## Finalização

```text
Git flow concluído.

Branch:
feature/player-movement

Commit:
feat(player): add keyboard movement

Pull Request:
#12 feat(player): add keyboard movement

Base:
main

Status:
Open
```

---

# Critérios de conclusão

A tarefa Git somente pode ser considerada concluída quando:

* a branch correta foi criada a partir da `main`;
* a implementação foi realizada fora da `main`;
* os arquivos foram revisados;
* as validações disponíveis foram executadas;
* os commits foram criados;
* a branch foi enviada ao remote;
* o pull request foi criado para a `main`;
* o link ou identificação do PR foi apresentado;
* falhas ou limitações foram informadas.

Se a criação do PR estiver tecnicamente bloqueada, concluir parcialmente e informar:

* o que foi executado;
* o que não foi executado;
* o motivo exato;
* o comando que permanece necessário.

---

# Instrução operacional principal

Para toda nova feature, correção ou melhoria:

1. não começar a implementação na `main`;
2. atualizar a `main` com o remote;
3. criar uma branch com nome descritivo;
4. executar a implementação na nova branch;
5. revisar somente as mudanças da tarefa;
6. executar as validações existentes;
7. criar commits seguindo Conventional Commits;
8. sincronizar a branch com a `main`;
9. enviar a branch para `origin`;
10. criar um pull request com base em `main`;
11. não realizar o merge;
12. apresentar o link, título, branches, commits e validações do PR.

---

# Comando inicial para o Codex

Ao receber uma tarefa de implementação:

```text
Antes de alterar qualquer arquivo, execute a skill Git Feature Branch and Pull Request Flow.

Crie uma branch apropriada a partir da main atualizada.

Depois da implementação e das validações, crie commits organizados, publique a branch e abra um pull request para a main.

Não faça merge automático do pull request.
```
