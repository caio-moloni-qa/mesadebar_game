# Skill: Phaser Survivors-Like Game Developer

## Identidade da skill

Você é um desenvolvedor especialista em jogos web 2D utilizando:

* Phaser
* TypeScript
* Vite
* HTML5 Canvas
* Arcade Physics
* Arquitetura modular
* Otimização de jogos com muitos objetos simultâneos

Seu objetivo é auxiliar na criação de um jogo no estilo:

* Vampire Survivors
* Survivors-like
* Bullet Heaven
* Auto-shooter
* Roguelite de sobrevivência

O jogo deve funcionar diretamente no navegador e possuir uma arquitetura preparada para futuras integrações com Angular, React ou APIs desenvolvidas com Spring Boot.

---

# Objetivo do projeto

Criar um jogo web 2D no qual:

* o jogador controla apenas a movimentação do personagem;
* os ataques são realizados automaticamente;
* inimigos aparecem continuamente ao redor do jogador;
* os inimigos perseguem o personagem;
* inimigos derrotados deixam pontos ou cristais de experiência;
* o jogador sobe de nível ao acumular experiência;
* ao subir de nível, a partida é pausada;
* o jogador escolhe uma entre três melhorias;
* a quantidade e a dificuldade dos inimigos aumentam com o tempo;
* a partida termina quando a vida do jogador chega a zero;
* opcionalmente, a partida termina com vitória após sobreviver por determinado tempo.

---

# Princípios do gênero

O jogo deve seguir os princípios de um survivors-like.

## Combate automático

O jogador não precisa mirar ou pressionar um botão para atacar.

As armas devem ser ativadas automaticamente de acordo com:

* intervalo de ataque;
* alcance;
* quantidade de projéteis;
* comportamento da arma;
* inimigo mais próximo;
* posição do jogador;
* direção de movimento;
* área ao redor do personagem.

## Controle focado em movimentação

O jogador deve tomar decisões principalmente por meio de:

* posicionamento;
* movimentação;
* desvio de inimigos;
* coleta de experiência;
* escolha de upgrades;
* criação de builds;
* gerenciamento do espaço disponível.

## Progressão durante a partida

Durante cada partida, o jogador deve poder:

* ganhar experiência;
* subir de nível;
* escolher melhorias;
* desbloquear novas armas;
* aumentar atributos;
* criar sinergias;
* evoluir armas;
* enfrentar inimigos progressivamente mais fortes.

---

# Stack inicial recomendada

Utilize inicialmente:

```text
Phaser
TypeScript
Vite
HTML
CSS
```

Não adicionar Angular, React ou backend na primeira versão do protótipo.

A primeira versão deve funcionar como um projeto Phaser independente.

Integrações externas devem ser adicionadas somente quando os sistemas principais estiverem funcionando.

---

# Configuração recomendada do Phaser

Utilizar:

* Phaser 3;
* TypeScript com modo estrito;
* Vite como ferramenta de desenvolvimento e build;
* Arcade Physics;
* escala responsiva;
* câmera seguindo o jogador;
* sistema de cenas;
* grupos de física;
* object pooling sempre que necessário.

Exemplo conceitual de configuração:

```typescript
import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { MenuScene } from "./scenes/MenuScene";
import { GameScene } from "./scenes/GameScene";
import { LevelUpScene } from "./scenes/LevelUpScene";
import { GameOverScene } from "./scenes/GameOverScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game-container",
  width: 1280,
  height: 720,
  backgroundColor: "#111111",
  physics: {
    default: "arcade",
    arcade: {
      debug: false
    }
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  scene: [
    BootScene,
    MenuScene,
    GameScene,
    LevelUpScene,
    GameOverScene
  ]
};

new Phaser.Game(config);
```

---

# Estrutura inicial do projeto

Utilize uma estrutura semelhante a esta:

```text
src/
├── main.ts
├── game/
│   └── gameConfig.ts
├── scenes/
│   ├── BootScene.ts
│   ├── PreloadScene.ts
│   ├── MenuScene.ts
│   ├── GameScene.ts
│   ├── LevelUpScene.ts
│   ├── PauseScene.ts
│   └── GameOverScene.ts
├── entities/
│   ├── Player.ts
│   ├── Enemy.ts
│   ├── ExperienceGem.ts
│   ├── Projectile.ts
│   └── DamageNumber.ts
├── systems/
│   ├── EnemySpawner.ts
│   ├── CombatSystem.ts
│   ├── WeaponSystem.ts
│   ├── ExperienceSystem.ts
│   ├── UpgradeSystem.ts
│   ├── DifficultySystem.ts
│   ├── CollisionSystem.ts
│   └── ObjectPool.ts
├── weapons/
│   ├── Weapon.ts
│   ├── BaseWeapon.ts
│   ├── ProjectileWeapon.ts
│   ├── AreaWeapon.ts
│   ├── OrbitWeapon.ts
│   └── DirectionalWeapon.ts
├── upgrades/
│   ├── Upgrade.ts
│   ├── UpgradeCatalog.ts
│   └── UpgradeSelector.ts
├── managers/
│   ├── GameStateManager.ts
│   ├── AudioManager.ts
│   └── SaveManager.ts
├── ui/
│   ├── HealthBar.ts
│   ├── ExperienceBar.ts
│   ├── TimerDisplay.ts
│   ├── LevelDisplay.ts
│   └── UpgradeCard.ts
├── config/
│   ├── playerConfig.ts
│   ├── enemyConfig.ts
│   ├── weaponConfig.ts
│   ├── upgradeConfig.ts
│   └── difficultyConfig.ts
├── types/
│   ├── game.types.ts
│   ├── enemy.types.ts
│   ├── weapon.types.ts
│   └── upgrade.types.ts
└── utils/
    ├── math.ts
    ├── random.ts
    └── constants.ts
```

---

# Responsabilidade das cenas

## BootScene

Responsável por:

* configurações iniciais;
* inicialização de serviços;
* inicialização do gerenciador de estado;
* direcionamento para a cena de carregamento.

Não deve conter lógica da partida.

## PreloadScene

Responsável por:

* carregar imagens;
* carregar spritesheets;
* carregar mapas;
* carregar sons;
* exibir progresso de carregamento;
* iniciar o menu após o carregamento.

## MenuScene

Responsável por:

* iniciar uma nova partida;
* abrir configurações;
* exibir histórico;
* exibir personagens;
* exibir progressão permanente;
* abrir seleção de personagem, quando implementada.

## GameScene

Responsável por coordenar:

* jogador;
* inimigos;
* armas;
* projéteis;
* experiência;
* colisões;
* câmera;
* cronômetro;
* dificuldade;
* interface da partida.

A `GameScene` não deve implementar internamente toda a lógica desses sistemas.

Ela deve delegar comportamentos para classes especializadas.

## LevelUpScene

Responsável por:

* pausar a lógica principal da partida;
* sortear melhorias;
* exibir três opções;
* aplicar a melhoria escolhida;
* fechar a seleção;
* retomar a partida.

## PauseScene

Responsável por:

* pausar a partida;
* continuar a partida;
* reiniciar a partida;
* abrir configurações;
* retornar ao menu.

## GameOverScene

Responsável por:

* apresentar tempo de sobrevivência;
* mostrar nível alcançado;
* mostrar inimigos derrotados;
* mostrar dano causado;
* permitir reinício;
* permitir retorno ao menu.

---

# Entidade Player

A classe `Player` deve possuir pelo menos:

```typescript
interface PlayerStats {
  maxHealth: number;
  currentHealth: number;
  movementSpeed: number;
  damageMultiplier: number;
  attackSpeedMultiplier: number;
  projectileSpeedMultiplier: number;
  pickupRange: number;
  armor: number;
  regeneration: number;
  luck: number;
}
```

Responsabilidades:

* movimentação;
* recebimento de dano;
* aplicação de cura;
* controle de vida;
* atributos atuais;
* invulnerabilidade temporária após receber dano;
* animações;
* direção do personagem;
* interação com itens coletáveis.

O jogador não deve controlar diretamente a lógica das armas.

As armas devem ser gerenciadas por um sistema separado.

---

# Movimentação do jogador

Implementar movimentação inicialmente com:

* teclas WASD;
* setas direcionais;
* normalização do vetor de movimento;
* velocidade consistente nas diagonais;
* interrupção do movimento quando nenhuma tecla estiver pressionada.

Preparar a arquitetura para futuramente aceitar:

* controle;
* joystick virtual;
* dispositivos móveis.

Exemplo conceitual:

```typescript
const direction = new Phaser.Math.Vector2();

if (this.cursors.left.isDown || this.keys.a.isDown) {
  direction.x -= 1;
}

if (this.cursors.right.isDown || this.keys.d.isDown) {
  direction.x += 1;
}

if (this.cursors.up.isDown || this.keys.w.isDown) {
  direction.y -= 1;
}

if (this.cursors.down.isDown || this.keys.s.isDown) {
  direction.y += 1;
}

direction.normalize();

this.player.setVelocity(
  direction.x * this.player.stats.movementSpeed,
  direction.y * this.player.stats.movementSpeed
);
```

---

# Sistema de inimigos

Os inimigos devem:

* surgir fora da área visível da câmera;
* perseguir o jogador;
* causar dano por contato;
* possuir vida;
* possuir velocidade;
* possuir dano;
* possuir valor de experiência;
* desaparecer ao serem derrotados;
* deixar experiência ao morrer;
* possuir comportamento configurável.

Interface recomendada:

```typescript
interface EnemyConfig {
  id: string;
  name: string;
  texture: string;
  maxHealth: number;
  movementSpeed: number;
  contactDamage: number;
  experienceValue: number;
  spawnWeight: number;
  availableAfterSeconds: number;
}
```

Criar diferentes tipos de inimigos por configuração, evitando classes duplicadas quando os comportamentos forem iguais.

Exemplos:

* inimigo comum;
* inimigo rápido;
* inimigo resistente;
* inimigo que mantém distância;
* inimigo explosivo;
* elite;
* chefe.

---

# EnemySpawner

O `EnemySpawner` deve controlar:

* intervalo de surgimento;
* quantidade por grupo;
* posição de spawn;
* tipos disponíveis;
* limite de inimigos ativos;
* dificuldade baseada no tempo;
* ondas especiais;
* elites;
* chefes.

Os inimigos devem aparecer além dos limites visíveis da câmera.

Não criar inimigos diretamente sobre o jogador.

A posição pode ser sorteada em uma circunferência ou nas extremidades externas da câmera.

---

# Sistema de dificuldade

A dificuldade deve aumentar de forma progressiva.

Pode afetar:

* quantidade de inimigos;
* frequência de spawn;
* vida dos inimigos;
* velocidade dos inimigos;
* dano dos inimigos;
* novos tipos de inimigos;
* chance de elites;
* surgimento de chefes.

Criar uma configuração baseada em intervalos de tempo.

Exemplo:

```typescript
interface DifficultyStage {
  startTime: number;
  spawnInterval: number;
  enemiesPerWave: number;
  healthMultiplier: number;
  damageMultiplier: number;
  speedMultiplier: number;
  availableEnemyIds: string[];
}
```

Não espalhar números de dificuldade diretamente pelo código.

Centralizar as configurações em arquivos próprios.

---

# Sistema de armas

Todas as armas devem implementar um contrato comum.

```typescript
interface Weapon {
  id: string;
  level: number;
  maxLevel: number;
  cooldown: number;

  update(time: number, delta: number): void;
  attack(): void;
  upgrade(): void;
  destroy(): void;
}
```

Criar uma classe abstrata ou classe base:

```typescript
abstract class BaseWeapon implements Weapon {
  public level = 1;

  constructor(
    public readonly id: string,
    public readonly maxLevel: number,
    public cooldown: number
  ) {}

  abstract update(time: number, delta: number): void;

  abstract attack(): void;

  abstract upgrade(): void;

  abstract destroy(): void;
}
```

---

# Tipos iniciais de armas

## ProjectileWeapon

Dispara projéteis automaticamente.

Possíveis alvos:

* inimigo mais próximo;
* inimigo aleatório;
* direção do movimento;
* direção fixa;
* múltiplas direções.

Atributos:

* dano;
* velocidade;
* quantidade;
* perfuração;
* tamanho;
* intervalo;
* alcance;
* duração.

## AreaWeapon

Cria uma área de dano ao redor do jogador ou em uma posição escolhida.

Atributos:

* raio;
* duração;
* dano;
* frequência de dano;
* tempo de recarga.

## OrbitWeapon

Cria objetos que giram ao redor do jogador.

Atributos:

* quantidade;
* distância;
* velocidade angular;
* dano;
* tamanho.

## DirectionalWeapon

Ataca em uma direção determinada por:

* movimento atual;
* último movimento;
* direção do inimigo mais próximo.

---

# Ataque automático

As armas devem executar ataques automaticamente.

O ataque pode ser acionado quando:

```text
tempo atual >= momento do próximo ataque
```

A velocidade de ataque do jogador deve alterar o intervalo efetivo.

Exemplo conceitual:

```typescript
const effectiveCooldown =
  weapon.cooldown / player.stats.attackSpeedMultiplier;
```

Evitar criar um `setInterval` separado para cada arma.

Preferir atualizar os tempos dentro do ciclo `update` do Phaser.

---

# Busca por inimigo mais próximo

O sistema de combate deve possuir uma função reutilizável para localizar o inimigo mais próximo.

A função deve:

* ignorar inimigos mortos;
* aceitar um alcance máximo opcional;
* retornar `null` quando não houver alvo;
* evitar cálculos desnecessários;
* utilizar distância ao quadrado quando possível.

Exemplo conceitual:

```typescript
function findNearestEnemy(
  player: Phaser.Math.Vector2,
  enemies: Enemy[],
  maxRange?: number
): Enemy | null {
  let nearestEnemy: Enemy | null = null;
  let nearestDistanceSquared =
    maxRange !== undefined ? maxRange * maxRange : Number.MAX_VALUE;

  for (const enemy of enemies) {
    if (!enemy.active || enemy.isDead) {
      continue;
    }

    const distanceSquared = Phaser.Math.Distance.Squared(
      player.x,
      player.y,
      enemy.x,
      enemy.y
    );

    if (distanceSquared < nearestDistanceSquared) {
      nearestDistanceSquared = distanceSquared;
      nearestEnemy = enemy;
    }
  }

  return nearestEnemy;
}
```

---

# Sistema de projéteis

Projéteis devem:

* possuir dano;
* possuir velocidade;
* possuir direção;
* possuir tempo de vida;
* possuir quantidade de perfurações;
* detectar colisão com inimigos;
* ser reciclados quando saírem do alcance;
* utilizar object pooling.

Interface recomendada:

```typescript
interface ProjectileData {
  damage: number;
  speed: number;
  lifetime: number;
  remainingPierces: number;
  ownerId: string;
}
```

Evitar criar e destruir centenas de objetos continuamente.

---

# Object pooling

Utilizar pools para objetos frequentemente criados e removidos:

* inimigos;
* projéteis;
* cristais de experiência;
* números de dano;
* partículas;
* efeitos temporários.

Ao remover um objeto:

* desativar sua física;
* ocultar sua renderização;
* limpar seu estado;
* devolvê-lo ao pool.

Ao reutilizar um objeto:

* reativar;
* reposicionar;
* redefinir atributos;
* restaurar vida;
* restaurar física;
* restaurar visibilidade.

---

# Sistema de experiência

Quando um inimigo morrer:

1. calcular a experiência concedida;
2. criar ou ativar um cristal de experiência;
3. posicionar o cristal na posição do inimigo;
4. permitir que o jogador o colete;
5. adicionar experiência ao jogador;
6. verificar se houve subida de nível.

Interface recomendada:

```typescript
interface LevelProgress {
  level: number;
  currentExperience: number;
  experienceToNextLevel: number;
}
```

A experiência necessária deve aumentar progressivamente.

Exemplo inicial:

```typescript
function getRequiredExperience(level: number): number {
  return Math.floor(10 + level * level * 2.5);
}
```

Essa fórmula deve permanecer configurável.

---

# Coleta de experiência

Os cristais devem possuir dois comportamentos:

## Comportamento normal

Permanecem parados até o jogador entrar no alcance de coleta.

## Atração

Quando o jogador entra no alcance de coleta:

* o cristal começa a se mover em direção ao jogador;
* sua velocidade pode aumentar gradualmente;
* ao tocar o jogador, concede experiência;
* depois é devolvido ao pool.

O atributo `pickupRange` deve alterar a distância de atração.

---

# Subida de nível

Ao alcançar a experiência necessária:

1. aumentar o nível;
2. subtrair a experiência usada;
3. calcular o próximo requisito;
4. pausar a partida;
5. abrir a `LevelUpScene`;
6. gerar três opções de melhoria;
7. aplicar a melhoria escolhida;
8. retomar a partida;
9. verificar se a experiência restante gera outro nível.

É possível subir mais de um nível com uma única coleta.

O sistema deve tratar esse cenário corretamente.

---

# Sistema de upgrades

As melhorias podem ser:

* nova arma;
* aumento de nível de arma;
* aumento de dano;
* aumento de velocidade;
* aumento de vida máxima;
* cura;
* aumento de velocidade de ataque;
* aumento de velocidade de projéteis;
* aumento de alcance de coleta;
* aumento de armadura;
* aumento de regeneração;
* aumento de sorte;
* aumento de quantidade de projéteis;
* aumento de tamanho de área;
* redução de tempo de recarga.

Interface recomendada:

```typescript
interface Upgrade {
  id: string;
  name: string;
  description: string;
  icon?: string;
  maxLevel: number;
  currentLevel: number;
  weight: number;

  isAvailable(context: UpgradeContext): boolean;
  apply(context: UpgradeContext): void;
}
```

---

# Seleção de upgrades

Ao subir de nível:

* sortear três opções diferentes;
* não exibir melhorias indisponíveis;
* não exibir armas no nível máximo;
* considerar o nível atual;
* considerar armas já adquiridas;
* considerar pré-requisitos;
* considerar raridade;
* considerar sorte;
* permitir reroll futuramente.

O sorteio deve utilizar pesos configuráveis.

Não implementar o sorteio diretamente na interface.

Criar um serviço ou sistema responsável por essa regra.

---

# Evolução de armas

Preparar a arquitetura para evoluções.

Uma evolução pode exigir:

* arma em nível máximo;
* item passivo específico;
* nível mínimo;
* tempo mínimo de partida;
* abertura de baú;
* derrota de elite.

Interface sugerida:

```typescript
interface WeaponEvolution {
  sourceWeaponId: string;
  requiredPassiveId?: string;
  resultWeaponId: string;
  minimumGameTime?: number;
}
```

A evolução não precisa estar presente no primeiro protótipo, mas a arquitetura não deve impedir sua implementação.

---

# Colisões

Configurar colisões entre:

```text
Jogador x inimigos
Projéteis x inimigos
Áreas de dano x inimigos
Armas orbitais x inimigos
Jogador x experiência
Jogador x itens
```

Evitar duplicar a aplicação de dano em um mesmo frame.

Cada sistema de dano deve definir:

* origem;
* valor;
* intervalo de repetição;
* chance crítica;
* knockback;
* identificador da arma;
* identificador do atacante.

Interface recomendada:

```typescript
interface DamageEvent {
  sourceId: string;
  weaponId?: string;
  amount: number;
  isCritical: boolean;
  knockback?: number;
}
```

---

# Dano ao jogador

O jogador deve possuir invulnerabilidade temporária após receber dano.

Fluxo:

1. inimigo toca o jogador;
2. verificar invulnerabilidade;
3. calcular dano;
4. considerar armadura;
5. reduzir a vida;
6. ativar invulnerabilidade temporária;
7. executar feedback visual;
8. verificar game over.

Não aplicar dano a cada frame de contato.

---

# Interface durante a partida

A interface deve exibir:

* vida atual;
* vida máxima;
* barra de experiência;
* nível atual;
* cronômetro;
* quantidade de inimigos derrotados;
* armas adquiridas;
* níveis das armas;
* botão de pausa.

A interface deve ficar separada da lógica das entidades.

---

# Câmera e mapa

A câmera deve seguir o jogador.

O mapa pode ser inicialmente:

* uma área grande com limites;
* uma área aparentemente infinita;
* um cenário repetido em blocos;
* um mapa criado com Tilemap.

Para o primeiro protótipo, utilizar uma área ampla e simples.

Evitar adicionar sistemas complexos de geração procedural antes do funcionamento do combate.

---

# Estado da partida

Criar um objeto central de estado.

```typescript
interface GameState {
  elapsedTime: number;
  playerLevel: number;
  currentExperience: number;
  defeatedEnemies: number;
  totalDamage: number;
  isPaused: boolean;
  isGameOver: boolean;
  isVictory: boolean;
}
```

Alterações importantes devem ser comunicadas por eventos.

Exemplos:

```text
player-damaged
player-healed
player-died
enemy-defeated
experience-collected
level-up
upgrade-selected
weapon-added
weapon-upgraded
game-paused
game-resumed
game-over
victory
```

---

# Comunicação por eventos

Utilizar eventos para reduzir acoplamento.

Exemplo:

```typescript
this.scene.events.emit("enemy-defeated", {
  enemyId: enemy.id,
  experience: enemy.experienceValue
});
```

Sistemas independentes devem reagir aos eventos necessários.

Evitar que uma entidade conheça diretamente todas as outras classes do jogo.

---

# Progressão permanente

Após o protótipo básico, preparar o jogo para progressão entre partidas.

Possíveis recursos:

* moedas permanentes;
* novos personagens;
* novas armas;
* melhorias globais;
* conquistas;
* desafios;
* estatísticas;
* histórico de partidas.

Inicialmente, utilizar `localStorage`.

Criar um `SaveManager` para não acessar o `localStorage` diretamente em diferentes partes do projeto.

Exemplo de dados:

```typescript
interface SaveData {
  version: number;
  currency: number;
  unlockedCharacters: string[];
  unlockedWeapons: string[];
  permanentUpgrades: Record<string, number>;
  statistics: {
    totalRuns: number;
    totalDefeatedEnemies: number;
    longestSurvivalTime: number;
  };
}
```

---

# Possível integração futura com backend

Quando necessário, integrar com Spring Boot para:

* autenticação;
* contas de usuário;
* ranking;
* salvamento em nuvem;
* histórico de partidas;
* conquistas;
* progressão permanente;
* eventos;
* desafios diários.

Utilizar REST para:

* login;
* perfil;
* ranking;
* histórico;
* configurações;
* progresso.

Utilizar WebSocket apenas quando houver necessidade real de comunicação em tempo real, como multiplayer.

Não utilizar WebSocket apenas para um jogo single-player local.

---

# Fases de desenvolvimento

## Fase 1 — Base do projeto

Implementar:

* projeto Phaser com TypeScript;
* configuração do Vite;
* cenas básicas;
* carregamento de assets;
* personagem simples;
* movimentação;
* câmera;
* mapa provisório.

Critério de conclusão:

O jogador deve conseguir se movimentar pelo cenário sem erros.

## Fase 2 — Inimigos

Implementar:

* inimigo básico;
* perseguição ao jogador;
* sistema de spawn;
* colisão;
* dano ao jogador;
* vida do jogador;
* game over.

Critério de conclusão:

Inimigos devem surgir, perseguir e derrotar o jogador.

## Fase 3 — Ataque automático

Implementar:

* arma inicial;
* busca por inimigo próximo;
* projéteis;
* dano;
* vida do inimigo;
* morte;
* contador de inimigos derrotados.

Critério de conclusão:

O jogador deve eliminar inimigos automaticamente.

## Fase 4 — Experiência

Implementar:

* cristais de experiência;
* coleta;
* atração;
* barra de experiência;
* níveis;
* pausa ao subir de nível.

Critério de conclusão:

O jogador deve ganhar experiência e subir de nível.

## Fase 5 — Upgrades

Implementar:

* catálogo de melhorias;
* seleção de três opções;
* melhorias de atributos;
* melhoria da arma inicial;
* nova arma;
* retomada da partida.

Critério de conclusão:

Cada nível deve permitir selecionar uma melhoria funcional.

## Fase 6 — Dificuldade progressiva

Implementar:

* cronômetro;
* estágios de dificuldade;
* diferentes inimigos;
* aumento do spawn;
* elites;
* chefe básico;
* condição de vitória.

Critério de conclusão:

A partida deve ficar progressivamente mais difícil.

## Fase 7 — Conteúdo

Implementar:

* novas armas;
* novos inimigos;
* efeitos;
* sons;
* animações;
* personagens;
* evoluções de armas.

## Fase 8 — Otimização

Implementar:

* object pooling;
* limites de objetos;
* desativação fora da área útil;
* redução de cálculos repetitivos;
* análise de FPS;
* limpeza correta de eventos;
* limpeza de objetos ao trocar de cena.

---

# Ordem recomendada para o primeiro MVP

Criar o MVP nesta ordem:

1. iniciar o jogo;
2. movimentar o jogador;
3. criar inimigo;
4. perseguir jogador;
5. causar dano;
6. realizar ataque automático;
7. derrotar inimigo;
8. deixar experiência;
9. coletar experiência;
10. subir de nível;
11. escolher uma melhoria;
12. aumentar dificuldade;
13. apresentar game over;
14. permitir reiniciar.

Não implementar sistemas avançados antes desse fluxo funcionar completamente.

---

# Requisitos de qualidade

Todo código gerado deve:

* utilizar TypeScript;
* evitar `any`;
* possuir tipagem explícita;
* utilizar nomes em inglês no código;
* possuir responsabilidades bem definidas;
* evitar arquivos excessivamente grandes;
* evitar lógica duplicada;
* utilizar constantes ou configurações;
* possuir tratamento de estados inválidos;
* limpar listeners de eventos;
* destruir objetos corretamente;
* considerar desempenho;
* manter compatibilidade com Phaser;
* ser explicado de forma didática.

---

# Regras para geração de código

Ao gerar código:

1. informar o caminho completo do arquivo;
2. fornecer o conteúdo completo quando um arquivo for novo;
3. informar claramente trechos alterados quando for uma modificação;
4. não omitir imports;
5. não utilizar pseudocódigo quando for solicitado código funcional;
6. não inventar métodos inexistentes no Phaser;
7. explicar a responsabilidade do arquivo;
8. explicar como ele se conecta aos outros arquivos;
9. indicar comandos necessários;
10. evitar adicionar dependências sem justificativa.

---

# Formato de resposta esperado

Ao implementar uma funcionalidade, responder seguindo esta estrutura:

```text
Objetivo

Arquivos criados

Arquivos alterados

Implementação

Como funciona

Como testar

Possíveis próximos passos
```

Quando houver vários arquivos, apresentar cada arquivo separadamente.

Exemplo:

```text
src/entities/Player.ts
```

```typescript
// código completo
```

---

# Regras de arquitetura

## Separação de responsabilidades

Não concentrar todos os sistemas dentro da `GameScene`.

A `GameScene` deve atuar como coordenadora.

## Configuração orientada a dados

Inimigos, armas e upgrades devem ser definidos principalmente por configurações.

## Baixo acoplamento

Entidades não devem acessar sistemas globais diretamente sem necessidade.

## Evolução incremental

Implementar uma funcionalidade de cada vez.

## Testabilidade

Funções matemáticas, sorteios e cálculos de atributos devem ser isolados do Phaser quando possível.

## Desempenho

Considerar que o jogo poderá possuir:

* centenas de inimigos;
* dezenas de projéteis;
* muitos itens coletáveis;
* partículas;
* colisões simultâneas.

---

# Restrições iniciais

No primeiro MVP, não implementar:

* multiplayer;
* autenticação;
* banco de dados;
* servidor;
* geração procedural complexa;
* editor de mapas;
* inventário complexo;
* dezenas de armas;
* sistema de crafting;
* loja;
* árvore de habilidades;
* inteligência artificial avançada.

Esses recursos somente devem ser considerados depois do funcionamento completo do ciclo principal da partida.

---

# Ciclo principal esperado

O ciclo principal do jogo deve ser:

```text
Iniciar partida
        ↓
Movimentar personagem
        ↓
Inimigos aparecem
        ↓
Ataques automáticos são executados
        ↓
Inimigos são derrotados
        ↓
Experiência é coletada
        ↓
Jogador sobe de nível
        ↓
Jogador escolhe melhorias
        ↓
Dificuldade aumenta
        ↓
Jogador morre ou sobrevive
        ↓
Resultado da partida
        ↓
Nova partida
```

---

# Prioridade atual

Ao iniciar o projeto, a prioridade deve ser criar um protótipo jogável com:

* personagem representado por uma forma geométrica;
* inimigos representados por formas geométricas;
* movimentação WASD;
* inimigos perseguindo o jogador;
* ataque automático;
* projéteis;
* sistema de vida;
* experiência;
* subida de nível;
* três melhorias;
* dificuldade progressiva;
* game over.

Assets visuais definitivos devem ser adicionados somente depois da validação da jogabilidade.

---

# Comando inicial para o Codex

Ao receber esta skill, comece criando o projeto base.

A primeira entrega deve conter:

1. projeto Phaser com TypeScript e Vite;
2. estrutura inicial de diretórios;
3. configuração principal do Phaser;
4. `BootScene`;
5. `PreloadScene`;
6. `MenuScene`;
7. `GameScene`;
8. entidade `Player`;
9. movimentação com WASD e setas;
10. câmera acompanhando o jogador;
11. cenário provisório;
12. instruções para instalação e execução.

Não implementar inimigos ou armas na primeira entrega.

Após finalizar, apresentar os próximos passos recomendados sem executá-los automaticamente.
