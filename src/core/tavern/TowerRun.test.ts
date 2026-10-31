import { describe, expect, it } from 'vitest';
import { DUELS, DUEL_HERO } from '../../config/tavernBattle';
import { TOWERS, TOWER_TUNING, TowerSpec } from '../../config/tavernTowers';
import { TowerRun, floorFoes } from './TowerRun';
import { TurnBattle, TurnBattleOptions } from './TurnBattle';

// O Coliseu do Sergio: group fights in TurnBattle and the climb up a tower.

/** Parries (or dodges) every real hit on the beat and attacks on every turn: the reference "perfect" player. */
function perfect(battle: TurnBattle): TurnBattle {
  for (let guard = 0; guard < 600000 && !battle.over; guard += 1) {
    if (battle.phase === 'player-turn') battle.attackTarget();
    else if (battle.phase === 'enemy-attack') {
      const hit = battle.attack!.hits.find((candidate) => candidate.result === null && !candidate.feint);
      if (!hit) { battle.advance(16); continue; }
      battle.advance(Math.max(0, Math.round(hit.at) - battle.clock.now));
      battle.react(hit.dodgeOnly ? 'dodge' : 'parry');
    } else battle.advance(16);
  }
  return battle;
}

/** Never reacts and only firms: loses. */
function idle(battle: TurnBattle): TurnBattle {
  for (let guard = 0; guard < 600000 && !battle.over; guard += 1) {
    if (battle.phase === 'player-turn') battle.firm();
    else battle.advance(16);
  }
  return battle;
}

const tower = TOWERS.taverna;

describe('group fights', () => {
  it('scales the foes and gives repeated regulars their own ids', () => {
    const foes = floorFoes([{ duel: 'brom', hpScale: 0.5 }, { duel: 'brom', damageScale: 2 }]);
    expect(foes.map((foe) => foe.id)).toEqual(['brom', 'brom-2']);
    expect(foes.every((foe) => foe.look === 'brom')).toBe(true);
    expect(foes[0].enemy.maxHp).toBe(Math.round(DUELS.brom.enemy.maxHp * 0.5));
    expect(foes[1].patterns[0].hits[0].damage).toBe(DUELS.brom.patterns[0].hits[0].damage * 2);
  });

  it('every enemy takes turns, and the fight is only won once all of them are down', () => {
    const run = new TowerRun(tower);
    run.floor = tower.floors.findIndex((floor) => floor.kind === 'fight' && floor.foes.length === 3);
    const battle = new TurnBattle(run.battleOptions({ hero: DUEL_HERO, seed: 4 })!);
    expect(battle.enemies).toHaveLength(3);
    const attackers = new Set<string>();
    battle.events.on('attackAnnounced', ({ attackerId }) => attackers.add(attackerId));
    perfect(battle);
    expect(battle.phase).toBe('won');
    expect(battle.enemies.every((enemy) => enemy.hp === 0)).toBe(true);
    expect(attackers.size).toBe(3);
    expect(battle.party[0].hp).toBe(DUEL_HERO.maxHp);
  });

  it('carries the hero in with the HP and Coragem left', () => {
    const battle = new TurnBattle({ duel: DUELS.brom, hero: DUEL_HERO, seed: 1, heroStart: { hp: 37, courage: 3 } });
    expect(battle.party[0].hp).toBe(37);
    expect(battle.party[0].maxHp).toBe(DUEL_HERO.maxHp);
    expect(battle.party[0].courage).toBe(3);
  });
});

describe('climbing a tower', () => {
  const play = (run: TowerRun, seed: number, how: (battle: TurnBattle) => TurnBattle) => {
    const options = run.battleOptions({ hero: DUEL_HERO, seed }) as TurnBattleOptions;
    const battle = how(new TurnBattle(options));
    return battle;
  };

  it('a perfect climb reaches the top with the whole pot and every floor\'s mastery', () => {
    const run = new TowerRun(tower);
    let seed = 1;
    while (!run.ended) {
      const floor = run.current!;
      if (floor.kind === 'rest') { run.rest('courage'); continue; }
      const battle = play(run, seed += 1, perfect);
      expect(battle.phase).toBe('won');
      run.won(battle.party[0].hp);
    }
    const fights = tower.floors.filter((floor) => floor.kind === 'fight');
    expect(run.ended).toBe('top');
    expect(run.cleared).toBe(tower.floors.length);
    expect(run.pot).toBe(fights.reduce((sum, floor) => sum + (floor.kind === 'fight' ? floor.fichas : 0), 0));
    expect(run.masteryXp).toBe(fights.reduce((sum, floor) => sum + (floor.kind === 'fight' ? floor.masteryXp : 0), 0));
    expect(run.leave()).toBe(run.pot);
  });

  it('a defeat keeps only part of the pot; walking away keeps all of it', () => {
    const lost = new TowerRun(tower);
    lost.won(80);
    lost.won(60);
    expect(lost.pot).toBeGreaterThan(0);
    const battle = play(lost, 9, idle);
    expect(battle.phase).toBe('lost');
    expect(lost.lost()).toBe(Math.floor(lost.pot * TOWER_TUNING.keepOnLoss));
    expect(lost.current).toBeNull();

    const left = new TowerRun(tower);
    left.won(80);
    expect(left.leave()).toBe(left.pot);
    expect(left.ended).toBe('left');
  });

  it('HP carries from floor to floor; a rest heals or brings Coragem', () => {
    const run = new TowerRun(tower);
    run.won(40);
    expect(run.battleOptions({ hero: DUEL_HERO, seed: 1 })!.heroStart).toEqual({ hp: 40, courage: 0 });
    run.floor = tower.floors.findIndex((floor) => floor.kind === 'rest');
    expect(run.battleOptions({ hero: DUEL_HERO, seed: 1 })).toBeNull();
    run.rest('heal');
    expect(run.heroHp).toBe(40 + DUEL_HERO.maxHp * TOWER_TUNING.restHeal);
    const breathe = new TowerRun(tower);
    breathe.floor = run.floor - 1;
    breathe.rest('courage');
    expect(breathe.battleOptions({ hero: DUEL_HERO, seed: 1 })!.heroStart!.courage).toBe(TOWER_TUNING.restCourage);
  });

  it('a lone regular keeps their duel rule; a group plays straight', () => {
    const solo = new TowerRun(tower).battleOptions({ hero: DUEL_HERO, seed: 1 })!;
    expect(solo.duel.rule).toBe('drinking');
    const group: TowerSpec = { ...tower, floors: [{ kind: 'fight', name: 'x', foes: [{ duel: 'brom' }, { duel: 'zora' }], fichas: 1, masteryXp: 1 }] };
    expect(new TowerRun(group).battleOptions({ hero: DUEL_HERO, seed: 1 })!.duel.rule).toBe('none');
  });

  it('the towers end with their champion; the Campo Verde\'s is announced, the igloo\'s is open', () => {
    [TOWERS.taverna, TOWERS.snowfield].forEach((spec) => {
      const top = spec.floors[spec.floors.length - 1];
      expect(top.kind === 'fight' && top.champion).toBe(true);
    });
    expect(TOWERS.greenfield.comingSoon).toBe(true);
    expect(TOWERS.snowfield.comingSoon).toBeFalsy();
  });
});
