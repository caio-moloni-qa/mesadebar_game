import { describe, expect, it } from 'vitest';
import { DUELS, DUEL_HERO } from '../../config/tavernBattle';
import { ROSTER, ROSTER_ORDER, SNOW_FOES, foeSpec } from '../../config/tavernRoster';
import { SkillNode } from '../../config/tavernSkills';
import { TOWERS, TOWER_TUNING } from '../../config/tavernTowers';
import { TowerRun, floorFoes, floorScale } from './TowerRun';
import { BattleAlly, TurnBattle } from './TurnBattle';

// The squad (more than one fighter on the player's side), every fighter's own kit, the towers' climbing difficulty
// and the igloo's tower.

/** Parries (or dodges) every real hit on the beat; on a party turn, uses the first skill it can afford or attacks. */
function perfect(battle: TurnBattle, useSkills = false): TurnBattle {
  for (let guard = 0; guard < 900000 && !battle.over; guard += 1) {
    if (battle.phase === 'player-turn') {
      const actor = battle.active!;
      const skill = useSkills ? actor.skills.find((node) => node.cost <= actor.courage) : undefined;
      if (!skill || !battle.useSkill(skill.id)) battle.attackTarget();
    } else if (battle.phase === 'enemy-attack') {
      const hit = battle.attack!.hits.find((candidate) => candidate.result === null && !candidate.feint);
      if (!hit) { battle.advance(16); continue; }
      battle.advance(Math.max(0, Math.round(hit.at) - battle.clock.now));
      battle.react(hit.dodgeOnly ? 'dodge' : 'parry');
    } else battle.advance(16);
  }
  return battle;
}

const ally = (id: keyof typeof ROSTER, kit: SkillNode[] = ROSTER[id].kit): BattleAlly => ({ id: `ally-${id}`, look: id, spec: ROSTER[id].stats, kit });

/** Runs until it's `id`'s turn (answering nothing), or the battle ends. */
function untilTurn(battle: TurnBattle, id: string): void {
  for (let guard = 0; guard < 100000 && !battle.over; guard += 1) {
    if (battle.phase === 'player-turn' && battle.active?.id === id) return;
    if (battle.phase === 'player-turn') battle.firm();
    else battle.advance(16);
  }
}

describe('every fighter\'s kit', () => {
  it('everyone on the roster has two actives, a passive and a finisher', () => {
    ROSTER_ORDER.forEach((id) => {
      const kinds = ROSTER[id].kit.map((skill) => skill.kind).sort();
      expect(kinds, id).toEqual(['active', 'active', 'finisher', 'passive']);
      expect(ROSTER[id].kit.every(Boolean), id).toBe(true);
    });
  });

  it('the igloo\'s people are on the roster, and every tower foe has a fight spec', () => {
    TOWERS.snowfield.roster.forEach((id) => expect(ROSTER[id].region).toBe('snowfield'));
    Object.values(TOWERS).flatMap((tower) => tower.floors).forEach((floor) => {
      if (floor.kind === 'fight') floor.foes.forEach((foe) => expect(foeSpec(foe.duel).patterns.length).toBeGreaterThan(0));
    });
    expect(foeSpec('brom')).toBe(DUELS.brom);
    expect(foeSpec('winterKing')).toBe(SNOW_FOES.winterKing);
  });
});

describe('the squad', () => {
  it('every member takes their own turns, and enemy attacks come at any of them', () => {
    const battle = new TurnBattle({ duel: DUELS.brom, hero: DUEL_HERO, allies: [ally('eskimo'), ally('frostKnight')], seed: 3 });
    expect(battle.party.map((member) => member.id)).toEqual(['hero', 'ally-eskimo', 'ally-frostKnight']);
    const turns = new Set<string>();
    const aimed = new Set<string>();
    battle.events.on('turnStarted', ({ fighterId }) => turns.add(fighterId));
    battle.events.on('attackAnnounced', ({ hits }) => aimed.add(hits[0].targetId));
    perfect(battle);
    expect(battle.phase).toBe('won');
    expect([...turns]).toEqual(expect.arrayContaining(['hero', 'ally-eskimo', 'ally-frostKnight']));
    expect(aimed.size).toBeGreaterThan(1);
  });

  it('a taunt draws every attack until the taunter\'s next turn', () => {
    const battle = new TurnBattle({ duel: DUELS.brom, hero: DUEL_HERO, allies: [ally('ancientYeti')], seed: 5 });
    battle.party[1].courage = 5;
    untilTurn(battle, 'ally-ancientYeti');
    expect(battle.useSkill('rugido')).toBe(true);
    expect(battle.party[1].taunting).toBe(true);
    const aimed: string[] = [];
    battle.events.on('attackAnnounced', ({ hits }) => aimed.push(hits[0].targetId));
    untilTurn(battle, 'ally-ancientYeti');
    expect(aimed.length).toBeGreaterThan(0);
    expect(aimed.every((id) => id === 'ally-ancientYeti')).toBe(true);
    expect(battle.party[1].taunting).toBe(false);
  });

  it('heals and shields the whole squad, and a sweep hits every enemy', () => {
    const foes = floorFoes([{ duel: 'frostSkeleton' }, { duel: 'frostSkeleton' }, { duel: 'frostSpirit' }]);
    const battle = new TurnBattle({ duel: SNOW_FOES.frostSkeleton, foes, hero: ROSTER.eskimo.stats, kit: ROSTER.eskimo.kit, allies: [ally('mage'), ally('ancientYeti')], seed: 7 });
    untilTurn(battle, 'hero');
    battle.party.forEach((member) => { member.hp = 20; member.courage = 5; });
    expect(battle.useSkill('sopa-quentinha')).toBe(true);
    expect(battle.party.every((member) => member.hp === 32)).toBe(true);
    untilTurn(battle, 'ally-mage');
    battle.party.forEach((member) => { member.hp = Math.max(member.hp, 30); member.courage = 5; });
    expect(battle.useSkill('barreira-arcana')).toBe(true);
    expect(battle.party.every((member) => member.shield >= 12)).toBe(true);
    untilTurn(battle, 'ally-ancientYeti');
    const before = battle.enemies.map((enemy) => enemy.hp);
    const splash: number[] = [];
    battle.events.on('skillUsed', (event) => splash.push(event.splash.length));
    expect(battle.useSkill('avalanche')).toBe(true);
    expect(splash[0]).toBe(before.filter((hp) => hp > 0).length);
    battle.enemies.forEach((enemy, i) => { if (before[i] > 0) expect(enemy.hp).toBeLessThan(before[i]); });
  });
});

describe('the towers keep getting harder', () => {
  it('each floor up and each ally make the foes tougher', () => {
    for (let floor = 1; floor < 12; floor += 1) {
      expect(floorScale(floor, 0).hp).toBeGreaterThan(floorScale(floor - 1, 0).hp);
      expect(floorScale(floor, 0).damage).toBeGreaterThan(floorScale(floor - 1, 0).damage);
    }
    expect(floorScale(0, 2).hp).toBeGreaterThan(floorScale(0, 1).hp);
    const solo = floorFoes([{ duel: 'brom' }], 4, 0)[0];
    const squad = floorFoes([{ duel: 'brom' }], 4, 2)[0];
    expect(solo.enemy.maxHp).toBe(Math.round(DUELS.brom.enemy.maxHp * (1 + TOWER_TUNING.hpPerFloor * 4)));
    expect(squad.enemy.maxHp).toBeGreaterThan(solo.enemy.maxHp);
    expect(squad.patterns[0].hits[0].damage).toBeGreaterThan(solo.patterns[0].hits[0].damage);
  });

  it('a squad climbs the igloo to the top, carrying each member\'s HP', () => {
    const tower = TOWERS.snowfield;
    const run = new TowerRun(tower, ROSTER.eskimo.stats, [ally('frostKnight'), ally('iceSerpent')]);
    let seed = 1;
    while (!run.ended) {
      if (run.current!.kind === 'rest') { run.rest('heal'); continue; }
      const options = run.battleOptions({ hero: ROSTER.eskimo.stats, kit: ROSTER.eskimo.kit, seed: seed += 1 })!;
      expect(options.allies).toHaveLength(2);
      const battle = perfect(new TurnBattle(options), true);
      expect(battle.phase).toBe('won');
      run.won(battle.party[0].hp, Object.fromEntries(battle.party.slice(1).map((member) => [member.id, member.hp])));
      run.allies.forEach(({ hp }) => expect(hp).toBeGreaterThanOrEqual(1));
    }
    expect(run.ended).toBe('top');
  });

  it('a fallen ally gets back up with 1 HP for the next floor', () => {
    const run = new TowerRun(TOWERS.snowfield, DUEL_HERO, [ally('bellringer')]);
    run.won(50, { 'ally-bellringer': 0 });
    expect(run.allies[0].hp).toBe(1);
    expect(run.battleOptions({ hero: DUEL_HERO, seed: 1 })!.allies![0].start).toEqual({ hp: 1, courage: 0 });
  });
});
