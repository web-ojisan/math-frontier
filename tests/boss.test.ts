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

  it('「1回登り切り+フロンティアへの一歩」で倒せる規模のHPになる', () => {
    const hp = computeBossHp(seq, statesUpTo(13, 'auto'));
    const knownSum = 2 ** 14 - 2; // 2+4+...+2^13
    // 既知の項だけの1周(全部クリティカルでも1.5倍)では倒しきれない
    // → 自己ベストを超える一歩(フロンティアの数)がとどめになる
    expect(hp).toBeGreaterThan(knownSum * 1.5);
    // 1周+フロンティア1問(クリティカル)なら確実に倒せる
    expect(hp).toBeLessThanOrEqual(knownSum * 1.5 + seq.term(14) * 1.5);
  });
});
