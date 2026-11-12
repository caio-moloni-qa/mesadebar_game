import { describe, expect, it } from 'vitest';
import { admitFloat, MAX_VISIBLE, PRIO, visibleFloats, type FloatText } from './BattleFeedback';

const word = (over: Partial<FloatText>): FloatText => ({ text: 'x', color: '#fff', x: 0, y: 100, at: 0, size: 28, life: 800, lane: 'hero', prio: PRIO.damage, ...over });

describe('the duel text budget', () => {
  it('never overlays replaced statuses or centre callouts during their transition', () => {
    for (const lane of ['hero', 'callout']) {
      let list = admitFloat([], word({ lane, text: 'ENVENENADO', prio: PRIO.status }));
      list = admitFloat(list, word({ lane, text: 'MARCADO', at: 10, prio: PRIO.status }));
      list = admitFloat(list, word({ lane, text: 'ATORDOADO', at: 20, prio: PRIO.big }));
      expect(visibleFloats(list, 21).map(f => f.text)).toEqual(['ATORDOADO']);
    }
  });
  it('merges numbers of the same kind in the same slot', () => {
    let list = admitFloat([], word({ text: '-4', merge: { kind: 'damage', value: 4 } }));
    list = admitFloat(list, word({ text: '-6', at: 300, merge: { kind: 'damage', value: 6 } }));
    expect(list.map((f) => f.text)).toEqual(['-10']);
    // Too far apart: the newer one takes the slot instead.
    list = admitFloat(list, word({ text: '-2', at: 750, merge: { kind: 'damage', value: 2 } }));
    expect(visibleFloats(list, 760).map((f) => f.text)).toEqual(['-2']);
    expect(visibleFloats(list, 880).map((f) => f.text)).toEqual(['-2']);
  });

  it('pairs a status with the number landing with it, status on top', () => {
    let list = admitFloat([], word({ text: '-9', at: 100, merge: { kind: 'damage', value: 9 } }));
    list = admitFloat(list, word({ text: 'DESEQUILIBROU', prio: PRIO.status, at: 0, y: 80, size: 22 }));
    const shown = visibleFloats(list, 150);
    expect(shown.map((f) => f.text)).toEqual(['DESEQUILIBROU', '-9']);
    expect(shown[1].y).toBeGreaterThan(shown[0].y);
  });

  it('lets a stronger word take the slot and makes a weaker one wait, or drops it', () => {
    let list = admitFloat([], word({ text: 'ESQUIVA', prio: PRIO.info, life: 700 }));
    list = admitFloat(list, word({ text: 'PERFEITO!', prio: PRIO.big, at: 300 }));
    expect(visibleFloats(list, 450).map((f) => f.text)).toEqual(['PERFEITO!']);
    list = admitFloat(list, word({ text: '+3', prio: PRIO.heal, at: 600 }));
    expect(list.find((f) => f.text === '+3')?.at).toBe(1100);
    list = admitFloat(list, word({ text: '+1 FICHA', prio: PRIO.info, at: 610, life: 900 }));
    expect(list.some((f) => f.text === '+1 FICHA')).toBe(false);
  });

  it('keeps one centre callout: a stronger one cuts it, a weaker one queues or drops', () => {
    let list = admitFloat([], word({ lane: 'callout', text: 'Facada', prio: PRIO.damage, life: 1100 }));
    list = admitFloat(list, word({ lane: 'callout', text: 'HORA DE FECHAR', prio: PRIO.big, at: 200, life: 1300 }));
    expect(visibleFloats(list, 400).map((f) => f.text)).toEqual(['HORA DE FECHAR']);
    list = admitFloat(list, word({ lane: 'callout', text: 'Rodada 3', prio: PRIO.info, at: 300 }));
    expect(list.some((f) => f.text === 'Rodada 3')).toBe(false);
    list = admitFloat(list, word({ lane: 'callout', text: 'Rodada 4', prio: PRIO.info, at: 1100 }));
    expect(list.find((f) => f.text === 'Rodada 4')?.at).toBe(1500);
  });

  it(`shows at most ${MAX_VISIBLE} fighter slots, the strongest, and leaves speech alone`, () => {
    let list: FloatText[] = [];
    ['a', 'b', 'c', 'd'].forEach((lane, i) => { list = admitFloat(list, word({ lane, text: lane, prio: i === 0 ? PRIO.tick : PRIO.damage })); });
    list = admitFloat(list, word({ lane: 'speech', text: '"Saúde!"' }));
    expect(visibleFloats(list, 10).map((f) => f.text).sort()).toEqual(['"Saúde!"', 'b', 'c', 'd']);
  });
});
