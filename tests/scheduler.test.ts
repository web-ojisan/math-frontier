// 出題選択(scheduler)の単体テスト。
import { describe, expect, it } from 'vitest';
import { createRng, frontierIndex, pickQuestion } from '../src/scheduler';
import { getSequence } from '../src/sequences';
import { itemKey, type ItemState } from '../src/state-estimator';

const seq = getSequence('pow2_up');

function statesOf(entries: [number, ItemState][]): Map<string, ItemState> {
  return new Map(entries.map(([index, state]) => [itemKey(seq.id, index), state]));
}

describe('frontierIndex', () => {
  it('未着手ならfirstIndexがフロンティア', () => {
    expect(frontierIndex(seq, new Map())).toBe(seq.firstIndex);
  });

  it('既知の項目の次がフロンティアになる', () => {
    const states = statesOf([
      [1, 'auto'],
      [2, 'auto'],
      [3, 'mental'],
    ]);
    expect(frontierIndex(seq, states)).toBe(4);
  });

  it('列を最後まで到達したらnull(高速想起のみ)', () => {
    const states = statesOf(
      Array.from({ length: seq.lastIndex }, (_, i) => [i + 1, 'mental'] as [number, ItemState]),
    );
    expect(frontierIndex(seq, states)).toBeNull();
  });
});

describe('pickQuestion', () => {
  it('既知の項目がなければ必ずフロンティアを出す', () => {
    const rng = createRng(1);
    const question = pickQuestion(seq, new Map(), [], rng);
    expect(question).toEqual({ item: { sequenceId: seq.id, index: 1 }, kind: 'frontier' });
  });

  it('直前に出した項目は続けて出さない', () => {
    const states = statesOf([
      [1, 'auto'],
      [2, 'auto'],
      [3, 'auto'],
    ]);
    const rng = createRng(2);
    for (let i = 0; i < 50; i++) {
      const question = pickQuestion(seq, states, [2], rng);
      if (question.kind === 'recall') {
        expect(question.item.index).not.toBe(2);
      }
    }
  });

  it('フロンティアはおよそ3割で混ざる', () => {
    const states = statesOf([
      [1, 'auto'],
      [2, 'auto'],
      [3, 'mental'],
      [4, 'mental'],
    ]);
    const rng = createRng(3);
    let frontierCount = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      if (pickQuestion(seq, states, [], rng).kind === 'frontier') frontierCount += 1;
    }
    expect(frontierCount / trials).toBeGreaterThan(0.2);
    expect(frontierCount / trials).toBeLessThan(0.4);
  });

  it('高速想起では昇格が近いmental項目がauto項目より出やすい', () => {
    const states = statesOf([
      [1, 'auto'],
      [2, 'mental'],
    ]);
    const rng = createRng(4);
    let mentalCount = 0;
    let autoCount = 0;
    for (let i = 0; i < 1000; i++) {
      const question = pickQuestion(seq, states, [], rng);
      if (question.kind !== 'recall') continue;
      if (question.item.index === 2) mentalCount += 1;
      if (question.item.index === 1) autoCount += 1;
    }
    expect(mentalCount).toBeGreaterThan(autoCount);
  });
});
