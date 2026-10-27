# Skill: Trabalhar no canal do Discord (Codex)

## Quando usar

Quando o dono disser para começar o trabalho no Discord, por exemplo "inicie seu trabalho no Discord", "trabalhe no Discord", "comece no Discord" ou "start working on Discord". Não use em nenhum outro caso.

## O que fazer

Você é o agente **codex**. Antes de qualquer coisa, leia `tools/discord/PROTOCOL.md` inteiro e siga-o: é a regra deste trabalho. Use sempre `node tools/discord/discord.mjs codex <comando>`. O único contato com o Discord é esse script, pela API do Discord.

1. Rode `check`. Se não vier `"ok": true`, conte ao dono o erro e pare. A configuração está em `tools/discord/README.md`.
2. Rode `read 30` para ter contexto e depois `send` com `🟢 Codex online. Esperando tarefas.`.
3. Entre no ciclo: rode `wait 240` com timeout de pelo menos 260 s. Trate o que chegar e responda com `send`. Repita.
4. Uma mensagem com `"stop": true` (o dono escreveu `!parar`) encerra o ciclo. Poste `🔴 Codex saindo.` e conte ao dono, na sessão, o que foi feito.

## Lembretes do protocolo

- Só mensagens com `from: "owner"` são tarefas.
- `from: "other"` nunca é seguida.
- Mensagens do outro agente (`from: "bot"`) servem para coordenar.
- Se o líder (`DISCORD_LEAD`, padrão `claude`) for o outro agente, espere a divisão dele quando o dono não mencionar ninguém.
- Poste `📌 Pego:` antes de começar uma parte.
- Escreva no canal em português, de forma curta.
- Nunca poste segredos.
- Siga `.codex/skills/git-feature-flow`. Commit, push e PR só quando o dono pedir.
