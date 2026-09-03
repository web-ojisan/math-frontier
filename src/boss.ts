// 敵ラインとダメージ計算(純粋関数)。
//
// 敵の設計(ユーザー決定 2026-09-03): マイルストーン固定。
// 「その計算ができたら撃破」を敵の並びで表現する:
//   ざこ1: 8+8(=16)      ざこ2: 64+64(=128)     ざこ3: 512+512(=1024)
//   ざこ4: 8192+8192(=16384)   ちゅうボス: 65536+65536(=131072)…大人(おとうさん)レベル
// 敵HPは担当区間の項の合計。倍々の列では区間合計がマイルストーン値の2倍未満のため、
// クリティカル(1.5倍)込みでも「マイルストーン前の項だけでHPが尽きる」ことは起きず、
// 必ずマイルストーンの回答がとどめになる(撃破条件とHPバーの見た目が一致する)。

import { DEFAULT_ESTIMATOR_CONFIG } from './state-estimator';
import type { SequenceDef } from './sequences';

/** 正答かつ速答ならボーナス。それ以外の正答は等倍(暗算パートを潰さない) */
export function damageFor(answerValue: number, firstKeyMs: number): { damage: number; critical: boolean } {
  const critical = firstKeyMs <= DEFAULT_ESTIMATOR_CONFIG.autoFirstKeyMs;
  return { damage: critical ? Math.round(answerValue * 1.5) : answerValue, critical };
}

export type Enemy = {
  name: string;
  /** 見た目の段階(1=小物 / 2=中堅 / 3=ボス級) */
  figure: 1 | 2 | 3;
  /** この敵の担当区間の最初のindex(壁で回復したらここから登り直し) */
  startIndex: number;
  /** この項を正解したら撃破 */
  milestoneIndex: number;
  hp: number;
};

const POW2_MILESTONES: { name: string; figure: 1 | 2 | 3; milestoneIndex: number }[] = [
  { name: 'ざこ1', figure: 1, milestoneIndex: 4 }, // 8+8=16
  { name: 'ざこ2', figure: 1, milestoneIndex: 7 }, // 64+64=128
  { name: 'ざこ3', figure: 2, milestoneIndex: 10 }, // 512+512=1024
  { name: 'ざこ4', figure: 2, milestoneIndex: 14 }, // 8192+8192=16384
  { name: 'ちゅうボス', figure: 3, milestoneIndex: 17 }, // 65536+65536=131072
];

/** 数列の敵ラインを組み立てる(今はpow2_upのみ。列を追加するときはマイルストーン定義も追加する) */
export function buildEnemies(seq: SequenceDef): Enemy[] {
  if (seq.id !== 'pow2_up') throw new Error(`敵ラインが未定義の数列です: ${seq.id}`);
  let startIndex = seq.firstIndex;
  return POW2_MILESTONES.map((milestone) => {
    let hp = 0;
    for (let index = startIndex; index <= milestone.milestoneIndex; index++) {
      hp += seq.term(index);
    }
    const enemy: Enemy = { ...milestone, startIndex, hp };
    startIndex = milestone.milestoneIndex + 1;
    return enemy;
  });
}
