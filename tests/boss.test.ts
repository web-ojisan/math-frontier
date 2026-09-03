// ボスHP逆算とダメージ計算の単体テスト。
import { describe, expect, it } from 'vitest';
import { computeBossHp, computeStageBossHp, damageFor, FIRST_BOSS_HP } from '../src/boss';
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

  it('初回プレイ(記録ゼロ)でも敵は登り位置に追従して強くなる(コールドスタート対策)', () => {
    const empty = new Map<string, ItemState>();
    // 1体目: 登り始め(pos=0)。3歩先まで(2+4+8=14)か記録配分の大きい方 → 弱い
    const stage1 = computeStageBossHp(seq, empty, 0, 1);
    expect(stage1).toBeLessThanOrEqual(30);
    // 3体目: 64まで登った状態(pos=6)。次の3歩 128+256+512=896 に追従して強くなる
    const stage3 = computeStageBossHp(seq, empty, 6, 3);
    expect(stage3).toBeGreaterThanOrEqual(896);
    expect(stage3).toBeGreaterThan(stage1);
  });

  it('記録が溜まった子には段階が上がるほど配分が増える', () => {
    const states = statesUpTo(13, 'auto');
    const stage1 = computeStageBossHp(seq, states, 0, 1);
    const stage2 = computeStageBossHp(seq, states, 0, 2);
    const stage3 = computeStageBossHp(seq, states, 0, 3);
    expect(stage2).toBeGreaterThan(stage1);
    expect(stage3).toBeGreaterThan(stage2);
    // 3体合計は記録ベースの総量(登り切り+一歩)の1.1倍=従来の1体分と同水準
    const total = stage1 + stage2 + stage3;
    const base = computeBossHp(seq, states);
    expect(total).toBeGreaterThan(base);
    expect(total).toBeLessThan(base * 1.3);
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
