// 出題選択: フロンティア(列の端を暗算で伸ばす)と高速想起(内側を即答で引く)の混ぜ方。
//
// 設計の根拠:
// - フロンティアは約3割で混ぜる。毎回フロンティアだと「大きい数の計算」ばかりになって疲れ、
//   全部想起だと列が伸びない。3割は「1セッション(十数問)で1〜2歩は前に進む」感覚の初期値で、
//   定数を変えるだけで調整できるようにする。
// - 高速想起の候補は mental / auto の項目。重み付け:
//   - mental項目は重め(×3): あと少しで自動化に昇格する項目に反復を集める
//   - auto項目のうち最近出題していないものは+1: 保持できているかの抜き打ち確認
// - 直前に出した項目は出さない(同じ問題の連打を防ぐ)。
// - 乱数はシード付き(テスト・シミュレーションで再現可能にするため)。

import type { SequenceDef } from './sequences';
import { itemKey, type ItemState } from './state-estimator';

export type ItemRef = { sequenceId: string; index: number };
export type QuestionKind = 'frontier' | 'recall';
export type Question = { item: ItemRef; kind: QuestionKind };

export type SchedulerConfig = {
  /** フロンティアを出す確率(フロンティアが存在する場合) */
  frontierRatio: number;
  /** auto項目が「最近出ていない」とみなす、直近出題リストの長さ */
  staleWindow: number;
};

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  frontierRatio: 0.3,
  staleWindow: 8,
};

/** シード付き乱数(mulberry32)。UIでも同じものを使う */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * フロンティア = 最初に unknown になる index。
 * firstIndex は前提なしで出題可能。それ以降は「直前の項目が unknown でない」ことが条件。
 * 列を最後まで到達済みなら null(高速想起だけになる)。
 */
export function frontierIndex(seq: SequenceDef, states: Map<string, ItemState>): number | null {
  for (let index = seq.firstIndex; index <= seq.lastIndex; index++) {
    const state = states.get(itemKey(seq.id, index)) ?? 'unknown';
    if (state === 'unknown') return index;
  }
  return null;
}

/**
 * 次の1問を選ぶ。
 * recentIndices: この列で直近に出題した index の列(新しい順でなくてよい。末尾が直前の出題)
 */
export function pickQuestion(
  seq: SequenceDef,
  states: Map<string, ItemState>,
  recentIndices: number[],
  rng: () => number,
  config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG,
): Question {
  const frontier = frontierIndex(seq, states);
  const lastIndex = recentIndices[recentIndices.length - 1];

  // 高速想起の候補(フロンティアと直前の出題を除く、mental/auto の項目)
  type Candidate = { index: number; weight: number };
  const candidates: Candidate[] = [];
  const recentWindow = new Set(recentIndices.slice(-config.staleWindow));
  for (let index = seq.firstIndex; index <= seq.lastIndex; index++) {
    if (index === frontier || index === lastIndex) continue;
    const state = states.get(itemKey(seq.id, index)) ?? 'unknown';
    if (state === 'unknown') continue;
    // mentalは昇格が近いので重め、autoは保持確認として最近出ていなければ少し重め
    const weight = state === 'mental' ? 3 : recentWindow.has(index) ? 1 : 2;
    candidates.push({ index, weight });
  }

  // フロンティアを出すか(候補が無ければ必ずフロンティア、フロンティアが無ければ必ず想起)
  const useFrontier =
    frontier !== null && (candidates.length === 0 || rng() < config.frontierRatio);

  if (useFrontier && frontier !== null) {
    return { item: { sequenceId: seq.id, index: frontier }, kind: 'frontier' };
  }

  if (candidates.length === 0) {
    // 列が未着手でフロンティアも無い、はあり得ないが、保険としてfirstIndexを返す
    return { item: { sequenceId: seq.id, index: seq.firstIndex }, kind: 'frontier' };
  }

  const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
  let roll = rng() * totalWeight;
  for (const candidate of candidates) {
    roll -= candidate.weight;
    if (roll <= 0) {
      return { item: { sequenceId: seq.id, index: candidate.index }, kind: 'recall' };
    }
  }
  const last = candidates[candidates.length - 1]!;
  return { item: { sequenceId: seq.id, index: last.index }, kind: 'recall' };
}
