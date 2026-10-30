// Taverna em Turnos balance pass (TAVERN_BALANCE_PASS_TEMP.md, venivium-balance §5): the static model of the duels
// and the towers, and seeded bot batches. Skipped by the normal suite.
//   PowerShell: $env:BALANCE=1; npx vitest run tools/balance
//   bash:       BALANCE=1 npx vitest run tools/balance
// Writes tools/balance/out/tavern-<label>.json (gitignored) and prints the tables. BALANCE_LABEL names the batch.

import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { describe, it } from 'vitest';
import { DUELS, DUEL_HERO, DuelId, REACTION_WINDOWS, AttackPattern } from '../../src/config/tavernBattle';
import { SKILL_TREES } from '../../src/config/tavernSkills';
import { ROSTER, ROSTER_ORDER, RosterId } from '../../src/config/tavernRoster';
import { TOWERS, TowerId } from '../../src/config/tavernTowers';
import { activeKit, freshRegular, learn } from '../../src/core/tavern/SkillTree';
import { BattleAlly, TurnBattle } from '../../src/core/tavern/TurnBattle';
import { TowerRun, floorScale } from '../../src/core/tavern/TowerRun';
import { ActionPolicy, BattleStats, PROFILES, playBattle, quantile } from './tavernBots';

const SEEDS = Array.from({ length: Number(process.env.BALANCE_SEEDS ?? 200) }, (_, i) => 1000 + i);
const TOWER_SEEDS = SEEDS.slice(0, Number(process.env.BALANCE_TOWER_SEEDS ?? 100));
const DUEL_ORDER: DuelId[] = ['brom', 'lyra', 'grimbo', 'zora', 'sergio'];
const commit = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return '?'; } })();
const label = process.env.BALANCE_LABEL ?? 'baseline';
const report: string[] = [];
/** A markdown table into the batch report (vitest swallows console output). */
function table(title: string, rows: Record<string, unknown>[]): void {
  const cols = Object.keys(rows[0] ?? {});
  report.push(`\n### ${title.replace(/=+/g, '').trim()}\n`, `| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`,
    ...rows.map((row) => `| ${cols.map((c) => String(row[c] ?? '')).join(' | ')} |`));
}
const pct = (x: number) => `${Math.round(x * 100)}%`;
const r1 = (x: number) => Math.round(x * 10) / 10;

/** The kit a regular's tree gives after learning one whole branch (4 points). */
function branchKit(regular: string, branch: number) {
  const tree = SKILL_TREES[regular];
  const state = tree.branches[branch].nodes.reduce((s, node) => learn(tree, s, node.id) ?? s, { ...freshRegular(), level: 12 });
  return activeKit(tree, state);
}

function summarize(stats: BattleStats[]) {
  const wins = stats.filter((s) => s.won);
  const hits = stats.reduce((acc, s) => { Object.entries(s.tally).forEach(([k, v]) => { acc[k] = (acc[k] ?? 0) + v; }); return acc; }, {} as Record<string, number>);
  const answered = (hits.parry ?? 0) + (hits.dodge ?? 0) + (hits.taken ?? 0);
  const takenBy: Record<string, number> = {};
  stats.forEach((s) => Object.entries(s.takenBy).forEach(([k, v]) => { takenBy[k] = (takenBy[k] ?? 0) + v / stats.length; }));
  return {
    n: stats.length,
    win: wins.length / stats.length,
    durationP50s: quantile(stats.map((s) => s.durationMs / 1000), 0.5),
    durationP90s: quantile(stats.map((s) => s.durationMs / 1000), 0.9),
    roundsP50: quantile(stats.map((s) => s.rounds), 0.5),
    hpLeftWinP50: wins.length ? quantile(wins.map((s) => s.hpLeftRatio), 0.5) : NaN,
    comeback: wins.length ? wins.filter((s) => s.minHpRatio < 0.25).length / wins.length : NaN,
    parryRate: answered ? (hits.parry ?? 0) / answered : 0,
    dodgeRate: answered ? (hits.dodge ?? 0) / answered : 0,
    takenRate: answered ? (hits.taken ?? 0) / answered : 0,
    early: (hits.early ?? 0) / stats.length,
    held: (hits.held ?? 0) / stats.length,
    counters: stats.reduce((a, s) => a + s.counters, 0) / stats.length,
    courageEarned: stats.reduce((a, s) => a + s.courageEarned, 0) / stats.length,
    courageSpent: stats.reduce((a, s) => a + s.courageSpent, 0) / stats.length,
    maxHitRatio: Math.max(...stats.map((s) => s.maxHitRatio)),
    maxAttackRatio: Math.max(...stats.map((s) => s.maxAttackRatio)),
    killedFromHalf: stats.filter((s) => s.killedFromHalf).length / stats.length,
    takenBy: Object.fromEntries(Object.entries(takenBy).map(([k, v]) => [k, r1(v)]))
  };
}

/** Static: per pattern, the lead, the smallest gap between hits, the damage, and the share of the hero's HP. */
function patternRows(owner: string, patterns: AttackPattern[], heroHp: number) {
  return patterns.map((p) => {
    const offsets = p.dice ? Array.from({ length: p.dice.max }, (_, i) => i * p.dice!.intervalMs) : p.hits.map((h) => h.offsetMs);
    const gaps = offsets.slice(1).map((o, i) => o - offsets[i]);
    const real = p.dice ? Array.from({ length: p.dice.max }, () => p.hits[0]) : p.hits.filter((h) => !h.feint);
    const total = real.reduce((a, h) => a + h.damage, 0);
    const maxHit = Math.max(...p.hits.map((h) => h.damage));
    return {
      owner, id: p.id, intent: p.intent, leadMs: p.leadMs, hits: p.dice ? `${p.dice.min}-${p.dice.max}` : p.hits.length,
      minGapMs: gaps.length ? Math.min(...gaps) : null, maxHit, combo: total, maxHitPct: pct(maxHit / heroHp), comboPct: pct(total / heroHp),
      flags: [p.leadMs < 600 ? 'LEAD<600' : '', gaps.length && Math.min(...gaps) < 2 * REACTION_WINDOWS.parryMs ? `GAP<${2 * REACTION_WINDOWS.parryMs}` : '', maxHit / heroHp > 0.25 && p.leadMs < 1500 ? 'HIT>25%' : ''].filter(Boolean).join(' ')
    };
  });
}

describe.runIf(process.env.BALANCE)('Taverna em Turnos balance', () => {
  const out: Record<string, unknown> = { commit, label, seeds: SEEDS.length, towerSeeds: TOWER_SEEDS.length, windows: REACTION_WINDOWS };

  it('static model', () => {
    const rows = DUEL_ORDER.flatMap((id) => patternRows(id, DUELS[id].patterns, DUEL_HERO.maxHp));
    table('\n== Static: duel patterns vs the duel hero (100 HP) ==', rows);
    const ttk = DUEL_ORDER.map((id) => {
      const e = DUELS[id].enemy;
      const avgAttack = DUELS[id].patterns.reduce((a, p) => {
        const real = p.dice ? ((p.dice.min + p.dice.max) / 2) * p.hits[0].damage : p.hits.filter((h) => !h.feint).reduce((s, h) => s + h.damage, 0);
        return a + real * p.weight;
      }, 0) / DUELS[id].patterns.reduce((a, p) => a + p.weight, 0);
      return {
        duel: id, hp: e.maxHp, speed: e.speed, heroSpeed: DUEL_HERO.speed,
        heroHitsToKill: Math.ceil(e.maxHp / DUEL_HERO.attack),
        avgAttackDamage: r1(avgAttack),
        enemyAttacksToKillIfAllTaken: r1(DUEL_HERO.maxHp / avgAttack),
        enemyAttacksPerHeroTurn: r1(e.speed / DUEL_HERO.speed)
      };
    });
    table('== Static: turns to kill ==', ttk);
    const scale = Array.from({ length: 10 }, (_, floor) => ({ floor: floor + 1, ...Object.fromEntries([0, 1, 2].flatMap((a) => { const s = floorScale(floor, a); return [[`hp+${a}`, r1(s.hp)], [`dmg+${a}`, r1(s.damage)]]; })) }));
    table('== Static: tower scaling (× base) by floor and allies ==', scale);
    out.static = { patterns: rows, ttk, scale };
  });

  it('duels: reaction bot × duel, no kit (a first try)', () => {
    const rows: Record<string, unknown>[] = [];
    const result: Record<string, unknown> = {};
    for (const duel of DUEL_ORDER) {
      for (const profile of Object.values(PROFILES)) {
        const stats = SEEDS.map((seed) => playBattle(new TurnBattle({ duel: DUELS[duel], hero: DUEL_HERO, seed, diceRevealed: false }), profile, 'attackOnly', seed));
        const s = summarize(stats);
        result[`${duel}/${profile.id}`] = s;
        rows.push({ duel, bot: profile.id, win: pct(s.win), t50: Math.round(s.durationP50s), rounds: s.roundsP50, hpLeft: pct(s.hpLeftWinP50), parry: pct(s.parryRate), taken: pct(s.takenRate), early: r1(s.early), counters: r1(s.counters), maxAtk: pct(s.maxAttackRatio), kill50: pct(s.killedFromHalf), comeback: pct(s.comeback) });
      }
    }
    table('\n== Duels, no kit, attackOnly ==', rows);
    out.duels = result;
  });

  it('duel rules: does each one teach its lesson?', () => {
    const lesson: Record<string, unknown>[] = [];
    const run = (duel: DuelId, profileId: string, tweak: Partial<typeof PROFILES[string]>, opts: { diceRevealed?: boolean } = {}) => summarize(SEEDS.map((seed) => playBattle(new TurnBattle({ duel: DUELS[duel], hero: DUEL_HERO, seed, ...opts }), { ...PROFILES[profileId], ...tweak, id: `${profileId}*` }, 'attackOnly', seed)));
    for (const bot of ['average', 'skilled']) {
      const zBite = run('zora', bot, { bite: 1 }), zHold = run('zora', bot, { bite: 0 });
      lesson.push({ lesson: 'Zora: bite every feint vs hold', bot, a: pct(zBite.win), b: pct(zHold.win) });
      const lParry = run('lyra', bot, { readsArrows: false, parryRate: 1 }), lDodge = run('lyra', bot, { readsArrows: true });
      lesson.push({ lesson: 'Lyra: parry arrows vs dodge them', bot, a: pct(lParry.win), b: pct(lDodge.win) });
      const gBlind = run('grimbo', bot, {}), gSeen = run('grimbo', bot, {}, { diceRevealed: true });
      lesson.push({ lesson: 'Grimbo: dice hidden vs seen (bet)', bot, a: pct(gBlind.win), b: pct(gSeen.win) });
    }
    table('\n== Lessons (a vs b win rate; note: the bots time every hit, so reading the dice only shows if a miss-count costs) ==', lesson);
    out.lessons = lesson;
  });

  it('duels with a learned branch: policies and trees', () => {
    const rows: Record<string, unknown>[] = [];
    for (const duel of DUEL_ORDER) {
      for (let branch = 0; branch < 3; branch += 1) {
        const kit = branchKit(duel, branch);
        for (const policy of ['attackOnly', 'skillGreedy', 'sensible'] as ActionPolicy[]) {
          for (const bot of ['newcomer', 'average']) {
            const s = summarize(SEEDS.map((seed) => playBattle(new TurnBattle({ duel: DUELS[duel], hero: DUEL_HERO, kit, seed }), PROFILES[bot], policy, seed)));
            rows.push({ duel, branch: SKILL_TREES[duel].branches[branch].name, policy, bot, win: pct(s.win), t50: Math.round(s.durationP50s), hpLeft: pct(s.hpLeftWinP50), courage: `${r1(s.courageEarned)}/${r1(s.courageSpent)}` });
          }
        }
      }
    }
    table('\n== Duels with one full branch of that regular ==', rows);
    out.branches = table;
  });

  it('towers: climbs × squads × leave policies', () => {
    const squads: Record<TowerId, RosterId[][]> = {
      taverna: [...ROSTER_ORDER.filter((id) => TOWERS.taverna.roster.includes(id)).map((id) => [id]), ['barbarian', 'mage', 'zora'], ['mage', 'lyra'], ['brom', 'sergio', 'grimbo']],
      snowfield: [...ROSTER_ORDER.filter((id) => TOWERS.snowfield.roster.includes(id)).map((id) => [id]), ['mage'], ['barbarian'], ['eskimo', 'frostKnight', 'iceSerpent'], ['mage', 'lyra'], ['barbarian', 'bellringer', 'ancientYeti']],
      greenfield: []
    };
    const towers: Record<string, unknown> = {};
    const summary: Record<string, unknown>[] = [];
    const winners: Record<string, number> = {};
    let wins = 0;
    for (const towerId of ['taverna', 'snowfield'] as TowerId[]) {
      const tower = TOWERS[towerId];
      for (const squad of squads[towerId]) {
        for (const bot of ['newcomer', 'newcomerAssisted', 'average', 'skilled']) {
          const climbs = TOWER_SEEDS.map((seed) => {
            const [leader, ...allies] = squad;
            const run = new TowerRun(tower, ROSTER[leader].stats, allies.map((id): BattleAlly => ({ id: `ally-${id}`, look: id, spec: ROSTER[id].stats, kit: ROSTER[id].kit })));
            // Between floors: the pot so far and the squad's HP share, to replay leave policies afterwards.
            const steps: Array<{ floor: number; pot: number; hp: number }> = [];
            let elapsed = 0;
            while (!run.ended) {
              const hpShare = (run.heroHp + run.allies.reduce((a, m) => a + m.hp, 0)) / (run.heroMaxHp + run.allies.reduce((a, m) => a + m.ally.spec.maxHp, 0));
              steps.push({ floor: run.floor, pot: run.pot, hp: hpShare });
              const floor = run.current!;
              if (floor.kind === 'rest') { run.rest('heal'); continue; }
              const options = run.battleOptions({ hero: ROSTER[leader].stats, kit: ROSTER[leader].kit, heroLook: leader, seed: seed + run.floor * 7919 })!;
              const battle = new TurnBattle(options);
              const s = playBattle(battle, PROFILES[bot], 'sensible', seed + run.floor);
              elapsed += s.durationMs;
              if (s.won) run.won(battle.party[0].hp, Object.fromEntries(battle.party.slice(1).map((m) => [m.id, m.hp])));
              else run.lost();
            }
            return { ended: run.ended, endFloor: run.floor, pot: run.pot, payout: run.payout, steps, elapsedMs: elapsed };
          });
          const key = `${towerId}/${squad.join('+')}/${bot}`;
          const floors = tower.floors.length;
          const endAt = Array.from({ length: floors }, (_, f) => climbs.filter((c) => c.ended === 'lost' && c.endFloor === f).length / climbs.length);
          const top = climbs.filter((c) => c.ended === 'top').length / climbs.length;
          // Leave after clearing k floors: the pot then if reached, else what the defeat kept.
          const leaveEv = Array.from({ length: floors + 1 }, (_, k) => climbs.reduce((a, c) => {
            const st = c.steps.find((s) => s.floor === k);
            return a + (st ? st.pot : k === floors && c.ended === 'top' ? c.pot : c.payout);
          }, 0) / climbs.length);
          const hpLeave = (x: number) => climbs.reduce((a, c) => { const st = c.steps.find((s) => s.floor > 0 && s.hp < x); return a + (st ? st.pot : c.payout); }, 0) / climbs.length;
          const minutes = climbs.reduce((a, c) => a + c.elapsedMs, 0) / climbs.length / 60000;
          const always = climbs.reduce((a, c) => a + c.payout, 0) / climbs.length;
          if (bot === 'average' && top > 0) { wins += 1; squad.forEach((id) => { winners[id] = (winners[id] ?? 0) + 1; }); }
          towers[key] = { endAt, top, leaveEv, always, minutes };
          const worst = endAt.reduce((m, v, i) => (v > endAt[m] ? i : m), 0);
          summary.push({ tower: towerId, squad: squad.join('+'), bot, top: pct(top), worstFloor: `${worst + 1} (${pct(endAt[worst])})`, evAlways: r1(always), evLeave3: r1(leaveEv[3]), evLeave6: r1(leaveEv[6]), evHp40: r1(hpLeave(0.4)), min: r1(minutes), fichasPerMin: r1(always / Math.max(0.1, minutes)) });
        }
      }
    }
    table('\n== Towers (sensible policy, rest = eat). endAt = share of climbs that end on that floor ==', summary);
    out.towers = towers;
    out.towerSummary = summary;
    out.squadWinners = { winners, wins };
  });

  it('writes the batch', () => {
    mkdirSync('tools/balance/out', { recursive: true });
    const file = `tools/balance/out/tavern-${label}.json`;
    writeFileSync(file, JSON.stringify(out, null, 1));
    writeFileSync(file.replace(/json$/, 'md'), `# Tavern balance batch: ${label} @ ${commit}\n\nseeds ${SEEDS.length}, tower seeds ${TOWER_SEEDS.length}\n${report.join('\n')}\n`);
  });
});
