# Agentes no Discord

O Claude Code e o Codex trabalham juntos num canal de texto do Discord. O contato é só pela API do Discord, sem outras APIs: cada agente roda na sua própria sessão local, com o seu login. As regras de convivência estão em [PROTOCOL.md](PROTOCOL.md).

## 1. Criar os dois bots (uma vez)

Para cada agente, em <https://discord.com/developers/applications>:

1. **New Application:** dê um nome, por exemplo `Claude (Mesa)` e `Codex (Mesa)`.
2. **Aba Bot:**
   - **Reset Token:** copie o token direto para o `.env`. Não cole em chat nenhum.
   - **Privileged Gateway Intents:** ative **Message Content Intent**. Sem ela, o bot não lê o texto das mensagens.
3. **Aba OAuth2 → URL Generator:**
   - Em scopes, marque `bot`.
   - Em permissões, marque **View Channels**, **Send Messages** e **Read Message History**.
   - Abra a URL gerada e adicione o bot ao seu servidor. Para isso você precisa ser dono ou ter "Gerenciar servidor".
4. **Opcional:** para o bot ver só o canal de trabalho, tire a permissão dele nos outros canais (nas permissões do canal ou do cargo do bot).

## 2. Preencher o `.env`

Na raiz do repo (o arquivo já está no `.gitignore`):

```
DISCORD_GUILD_ID=...
DISCORD_CHANNEL_ID=...
DISCORD_OWNER_ID=...
DISCORD_TOKEN_CLAUDE=...
DISCORD_TOKEN_CODEX=...
DISCORD_LEAD=claude
```

**IDs:** ligue o Modo Desenvolvedor no Discord (Configurações → Avançado). Depois clique com o botão direito no servidor, no canal e no seu próprio nome → **Copiar ID**.

## 3. Testar

```
node tools/discord/discord.mjs claude check
node tools/discord/discord.mjs codex check
```

O resultado de cada um precisa ser `{"ok":true,...}`, com o nome do bot e do canal.

## 4. Trabalhar

1. Abra uma sessão do Claude Code e outra do Codex, de preferência cada uma no seu git worktree.
2. Diga em cada uma: **"inicie seu trabalho no Discord"**.
3. Para parar, escreva **`!parar`** no canal, ou interrompa as sessões.

## Comandos do script

| Comando | O que faz |
|---|---|
| `check` | Mostra qual é o bot e confere que o canal é o configurado, no servidor configurado |
| `read [n]` | Mostra as últimas n mensagens (padrão 20), da mais antiga para a mais nova |
| `wait [s]` | Espera até chegar mensagem nova (padrão 240 s) e devolve só o que é novo |
| `send <texto>` / `send --file <arq>` | Posta no canal; textos longos são divididos em partes |

**Formato da saída:** é JSON, uma mensagem por linha, com estes campos:

- `from`: `owner` (você), `bot` (o outro agente) ou `other` (qualquer outra pessoa);
- `mentionsMe`: se a mensagem menciona este bot;
- `stop`: se você mandou `!parar`;
- `content`: o texto da mensagem.

**Onde fica o estado:** o ponto de leitura de cada agente fica em `tools/discord/.state/`, ignorado pelo git.
