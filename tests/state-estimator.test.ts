// 3状態推定(state-estimator)の単体テスト。昇格・降級・ヒステリシスの仕様を固定する。
import { describe, expect, it } from 'vitest';
import { estimateState, type Attempt } from '../src/state-estimator';

function attempt(correct: boolean, firstKeyMs: number): Attempt {
  return {
    sequenceId: 'pow2_up',
    index: 5,
    answer: 32,
    correct,
    firstKeyMs,
    totalMs: firstKeyMs + 1500,
    answeredAt: new Date().toISOString(),
  };
}

const fast = () => attempt(true, 1200); // 速答(2秒以内の正答)
const slow = () => attempt(true, 5000); // 暗算での正答
const miss = () => attempt(false, 1500); // 誤答

describe('estimateState', () => {
  it('試行がなければ未到達(unknown)', () => {
    expect(estimateState([])).toBe('unknown');
  });

  it('一度でも正答すれば暗算で出せる(mental)', () => {
    expect(estimateState([slow()])).toBe('mental');
  });

  it('速答3連続で自動化済み(auto)に昇格する', () => {
    expect(estimateState([slow(), fast(), fast()])).toBe('mental');
    expect(estimateState([slow(), fast(), fast(), fast()])).toBe('auto');
  });

  it('速い誤答は昇格に数えない(当てずっぽう対策)', () => {
    expect(estimateState([fast(), fast(), miss(), fast()])).toBe('mental');
  });

  it('autoは非速答1回では落ちない(誤タップ耐性)が、2連続でmentalに降級する', () => {
    const toAuto = [fast(), fast(), fast()];
    expect(estimateState([...toAuto, slow()])).toBe('auto');
    expect(estimateState([...toAuto, slow(), slow()])).toBe('mental');
  });

  it('誤答2連続で1段階降級する(auto→mental、mental→unknown)', () => {
    const toAuto = [fast(), fast(), fast()];
    expect(estimateState([...toAuto, miss()])).toBe('auto');
    expect(estimateState([...toAuto, miss(), miss()])).toBe('mental');
    expect(estimateState([slow(), miss(), miss()])).toBe('unknown');
  });

  it('降級しても速答を積み直せば再昇格できる', () => {
    const history = [fast(), fast(), fast(), miss(), miss(), fast(), fast(), fast()];
    expect(estimateState(history)).toBe('auto');
  });
});
