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

/** 1体のボスを倒すまでの目標問数(1セッション=数分で終わる長さの調整弁) */
const TARGET_QUESTIONS = 12;

/** 正答かつ速答ならボーナス。それ以外の正答は等倍(暗算パートを潰さない) */
export function damageFor(answerValue: number, firstKeyMs: number): { damage: number; critical: boolean } {
  const critical = firstKeyMs <= DEFAULT_ESTIMATOR_CONFIG.autoFirstKeyMs;
  return { damage: critical ? Math.round(answerValue * 1.5) : answerValue, critical };
}

/**
 * ボスHPをフロンティアと既知項目から逆算する。
 * 期待ダメージ/問 = 高速想起(7割) + フロンティア(3割・成功率補正)の加重平均。
 * 想起候補の重みはスケジューラと同じ考え方(mental重め)で概算する。
 */
export function computeBossHp(seq: SequenceDef, states: Map<string, ItemState>): number {
  const frontier = frontierIndex(seq, states);

  let weightSum = 0;
  let weightedValueSum = 0;
  for (let index = seq.firstIndex; index <= seq.lastIndex; index++) {
    const state = states.get(itemKey(seq.id, index)) ?? 'unknown';
    if (state === 'unknown') continue;
    const weight = state === 'mental' ? 3 : 1.5;
    weightSum += weight;
    weightedValueSum += weight * seq.term(index);
  }

  if (weightSum === 0) return FIRST_BOSS_HP;

  const expectedRecall = weightedValueSum / weightSum;
  // フロンティアは成功率6割・速答ボーナスなしとして概算
  const expectedFrontier = frontier === null ? expectedRecall : seq.term(frontier) * 0.6;
  const expectedPerQuestion = expectedRecall * 0.7 + expectedFrontier * 0.3;

  const rawHp = expectedPerQuestion * TARGET_QUESTIONS;
  // 読みやすいきりのいい数に丸める(上位2桁)
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(rawHp)) - 1);
  return Math.max(FIRST_BOSS_HP, Math.round(rawHp / magnitude) * magnitude);
}
