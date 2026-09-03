// ボスHPの逆算とダメージ計算(純粋関数)。
//
// 設計の根拠:
// - ボスHPは「その子の現在の実力での期待ダメージ × 目標問数(約12問)」から逆算する。
//   習熟度適応を難易度設定ではなくボスHPに埋め込む(仕様)。列が伸びるほど期待ダメージが
//   指数的に増えるので、ボスも自然に大きくなり「ちょっと頑張れば倒せる」が保たれる。
// - ダメージは答えた数そのもの。学習の価値(大きい数を出せる)とゲームの価値(強い)を一致させる。
//   正答かつ速答(自動化済み相当の思考時間)なら1.5倍。

import { DEFAULT_ESTIMATOR_CONFIG, itemKey, type ItemState } from './state-estimator';
import { frontierIndex } from './scheduler';
import type { SequenceDef } from './sequences';

/** 初めて遊ぶとき(記録なし)のボスHP。2+4+8+...と伸ばせば7問程度で倒せる弱さ */
export const FIRST_BOSS_HP = 100;

/** 正答かつ速答ならボーナス。それ以外の正答は等倍(暗算パートを潰さない) */
export function damageFor(answerValue: number, firstKeyMs: number): { damage: number; critical: boolean } {
  const critical = firstKeyMs <= DEFAULT_ESTIMATOR_CONFIG.autoFirstKeyMs;
  return { damage: critical ? Math.round(answerValue * 1.5) : answerValue, critical };
}

/**
 * ボスHPを「列を最初から登り切る1回分+ちょい」から逆算する。
 * 出題は固定の昇順(2→4→8→…)なので、既知の項を全部答えたダメージ合計(knownSum)が
 * 1回の登りの基本ダメージ。HPをそれより少し大きくすることで、
 * 「自己ベストを超える一歩(フロンティアの数)がとどめになる」体験を作る。
 * 係数は実機チューニングの調整弁(速答1.5倍がどれだけ混ざるかで体感が変わる)。
 */
export function computeBossHp(seq: SequenceDef, states: Map<string, ItemState>): number {
  const frontier = frontierIndex(seq, states);

  let knownSum = 0;
  for (let index = seq.firstIndex; index <= seq.lastIndex; index++) {
    const state = states.get(itemKey(seq.id, index)) ?? 'unknown';
    if (state === 'unknown') continue;
    knownSum += seq.term(index);
  }

  if (knownSum === 0) return FIRST_BOSS_HP;

  const frontierValue = frontier === null ? 0 : seq.term(frontier);
  const rawHp = knownSum * 1.25 + frontierValue * 0.5;
  return Math.max(FIRST_BOSS_HP, roundNice(rawHp));
}

/** 読みやすいきりのいい数に丸める(上位2桁) */
function roundNice(value: number): number {
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(value)) - 1);
  return Math.round(value / magnitude) * magnitude;
}

/** 1バトルに登場する敵の数(小物→中ボス→大ボスの3段階) */
export const STAGE_COUNT = 3;

/** 記録ベースの総量(computeBossHp)を3体に配分する割合 */
const STAGE_SHARES = [0.25, 0.35, 0.5] as const;

/**
 * stage番目(1〜3)の敵のHP。
 * HP = max(「今の登り位置から3歩先まで登った量」, 記録ベースの配分)。
 * - 前者があるので、初回プレイ(記録ゼロ)でも敵がその場の登りに追従して強くなり、
 *   実力があれば初日から先へ進める(コールドスタート対策)。
 * - 後者があるので、記録が溜まった子には3体合計で「登り切り+一歩」の総量になる。
 * climbPos: 直前に正解した項のindex(バトル開始時は firstIndex - 1)
 */
export function computeStageBossHp(
  seq: SequenceDef,
  states: Map<string, ItemState>,
  climbPos: number,
  stage: number,
): number {
  let nextStepsSum = 0;
  for (let step = 1; step <= 3; step++) {
    const index = climbPos + step;
    if (index > seq.lastIndex) break;
    nextStepsSum += seq.term(index);
  }
  const share = STAGE_SHARES[Math.min(stage, STAGE_COUNT) - 1] ?? 1;
  const shareHp = computeBossHp(seq, states) * share;
  return roundNice(Math.max(nextStepsSum, shareHp, 10));
}
