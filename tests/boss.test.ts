// ボスHP逆算とダメージ計算の単体テスト。
import { describe, expect, it } from 'vitest';
import { computeBossHp, damageFor, FIRST_BOSS_HP } from '../src/boss';
import { getSequence } from '../src/sequences';
import { itemKey, type ItemState } from '../src/state-estimator';

const seq = getSequence('pow2_up');

function statesUpTo(maxIndex: number, state: ItemState): Map<string, ItemState> {
  const states = new Map<string, ItemState>();
  for (let index = 1; index <= maxIndex; index++) {
    states.set(itemKey(seq.id, index), state);
  }
  return states;
}

describe('damageFor', () => {
  it('正答は答えの数がそのままダメージになる', () => {
    expect(damageFor(16384, 5000)).toEqual({ damage: 16384, critical: false });
  });

  it('速答(自動化閾値以内)なら1.5倍のクリティカル', () => {
    expect(damageFor(16384, 1500)).toEqual({ damage: 24576, critical: true });
  });
});

describe('computeBossHp', () => {
  it('記録がなければ初心者用の弱いボス', () => {
    expect(computeBossHp(seq, new Map())).toBe(FIRST_BOSS_HP);
  });

  it('実力(既知の項)が伸びるほどボスHPも増える', () => {
    const small = computeBossHp(seq, statesUpTo(6, 'auto'));
    const big = computeBossHp(seq, statesUpTo(14, 'auto'));
    expect(big).toBeGreaterThan(small);
  });

  it('フロンティア14の子には「十数問で倒せる」規模のHPになる', () => {
    const hp = computeBossHp(seq, statesUpTo(13, 'auto'));
    // 既知の項の平均ダメージ(上位支配的で概ね2^13の数分の一)×12問 の範囲に収まること
    const maxDamagePerQuestion = seq.term(13) * 1.5;
    expect(hp).toBeGreaterThan(seq.term(13)); // 1問では倒せない
    expect(hp).toBeLessThan(maxDamagePerQuestion * 12); // 12問のクリティカルで確実に倒せる
  });
});
