// 学習シミュレーション: 架空の子どもの学習曲線を入れて、状態遷移が妥当に動くことを確認する。
//
// 仮想の子どもモデル:
// - 項目ごとの「露出回数」を持ち、露出が増えるほど思考時間が計算帯から想起帯(約1.1秒)へ
//   縮み、正答率も上がる(検索連合理論の素朴なモデル)。
// - 難易度は答えの桁数でスケールする: 「8を倍にする」は簡単だが「262144を倍にする」は
//   正答率が落ち、思考時間も伸びる。これがフロンティアの自然な制動になる
//   (出題制御で人工的に止めるのではなく、計算の難しさそのものが上限を作る)。
// これをスケジューラ+推定器に食わせ、「遊んでいるだけで状態が unknown→mental→auto と
// 遷移し、フロンティアが実力の上限あたりまで進んで止まる」ことを検証する。
import { describe, expect, it } from 'vitest';
import { createRng, frontierIndex, pickQuestion } from '../src/scheduler';
import { getSequence } from '../src/sequences';
import {
  estimateAllStates,
  itemKey,
  type Attempt,
  type ItemState,
} from '../src/state-estimator';

const seq = getSequence('pow2_up');

type SimChild = {
  exposures: Map<string, number>;
  rng: () => number;
};

/** 露出回数と答えの桁数から仮想の子どもの1試行を生成する */
function simulateAttempt(child: SimChild, index: number, answeredAt: string): Attempt {
  const key = itemKey(seq.id, index);
  const exposures = child.exposures.get(key) ?? 0;
  // 6回の成功露出でほぼ自動化する、という素朴な習得モデル
  const progress = Math.min(1, exposures / 6);
  // 桁数による難易度: この子は4桁までの倍は得意、5桁は五分、6桁以上はほぼ計算できない。
  // (正しい値をまぐれで打つことはできないので、上限を超えた桁の正答率はほぼ0にする)
  const digits = String(seq.term(index)).length;
  const ACCURACY_BY_DIGITS = [0.97, 0.97, 0.95, 0.9, 0.8, 0.5, 0.1, 0.01];
  const baseAccuracy = ACCURACY_BY_DIGITS[Math.min(digits, 7)]!;
  // 反復で少しずつ覚える(観察した6歳が16384を暗記したのはこの経路)
  const accuracy = baseAccuracy + (0.98 - baseAccuracy) * progress;
  const calcTimeMs = 2200 + 900 * digits; // 計算にかかる思考時間(桁数でスケール)
  const firstKeyMs = Math.round(
    calcTimeMs * (1 - progress) + 1100 * progress + (child.rng() - 0.5) * 1000,
  );
  const correct = child.rng() < accuracy;
  if (correct) child.exposures.set(key, exposures + 1);
  return {
    sequenceId: seq.id,
    index,
    answer: correct ? seq.term(index) : seq.term(index) + 2,
    correct,
    firstKeyMs: Math.max(600, firstKeyMs),
    totalMs: Math.max(600, firstKeyMs) + 1200,
    answeredAt,
  };
}

describe('学習シミュレーション(2のべき乗・25セッション)', () => {
  it('遊んでいるだけでフロンティアが進み、自動化済みの項目が積み上がる', () => {
    const child: SimChild = { exposures: new Map(), rng: createRng(42) };
    const schedulerRng = createRng(1234);
    const log: Attempt[] = [];
    const curve: { session: number; frontier: number | null; autoCount: number }[] = [];

    const SESSIONS = 25;
    const QUESTIONS_PER_SESSION = 15; // 1セッションは数分で終わる想定
    let clock = Date.parse('2026-09-01T09:00:00Z');

    for (let session = 1; session <= SESSIONS; session++) {
      const recent: number[] = [];
      for (let q = 0; q < QUESTIONS_PER_SESSION; q++) {
        const states = estimateAllStates(log);
        const question = pickQuestion(seq, states, recent, schedulerRng);
        clock += 8000;
        log.push(simulateAttempt(child, question.item.index, new Date(clock).toISOString()));
        recent.push(question.item.index);
      }
      const states = estimateAllStates(log);
      const autoCount = [...states.values()].filter((state) => state === 'auto').length;
      curve.push({ session, frontier: frontierIndex(seq, states), autoCount });
    }

    // 学習曲線の要約(挙動確認用)
    const summary = curve
      .filter((point) => point.session % 5 === 0)
      .map((point) => `S${point.session}: フロンティア=${point.frontier} 自動化=${point.autoCount}`)
      .join(' / ');
    console.log(`学習曲線: ${summary}`);

    const first = curve[0]!;
    const last = curve[curve.length - 1]!;

    // フロンティアが前に進んでいる(25セッションで8項目以上)
    expect(last.frontier === null || last.frontier >= 9).toBe(true);
    expect((last.frontier ?? seq.lastIndex + 1) > (first.frontier ?? 0)).toBe(true);
    // ただし完走はしない(桁数の壁=実力の上限あたりで自然に止まる)
    expect(last.frontier).not.toBeNull();
    // 自動化済みが積み上がっている
    expect(last.autoCount).toBeGreaterThanOrEqual(6);
    expect(last.autoCount).toBeGreaterThan(first.autoCount);

    // 状態の並びが妥当: フロンティアより先の項目が勝手に既知になっていない
    const states = estimateAllStates(log);
    const frontier = frontierIndex(seq, states);
    if (frontier !== null) {
      for (let index = frontier + 1; index <= seq.lastIndex; index++) {
        expect(states.get(itemKey(seq.id, index)) ?? 'unknown').toBe('unknown');
      }
    }
  });

  it('忘却(遅くなった項目)は降級し、練習し直すと再昇格する', () => {
    // まず自動化させる
    const log: Attempt[] = [];
    let clock = Date.parse('2026-09-01T09:00:00Z');
    const push = (correct: boolean, firstKeyMs: number) => {
      clock += 8000;
      log.push({
        sequenceId: seq.id,
        index: 3,
        answer: 8,
        correct,
        firstKeyMs,
        totalMs: firstKeyMs + 1000,
        answeredAt: new Date(clock).toISOString(),
      });
    };
    push(true, 1200);
    push(true, 1100);
    push(true, 1300);
    expect(estimateAllStates(log).get(itemKey(seq.id, 3))).toBe('auto');

    // 時間が経って遅くなった(=検索できず計算に戻った)
    push(true, 6000);
    push(true, 5500);
    expect(estimateAllStates(log).get(itemKey(seq.id, 3))).toBe('mental');

    // 練習し直して再昇格
    push(true, 1400);
    push(true, 1200);
    push(true, 1000);
    expect(estimateAllStates(log).get(itemKey(seq.id, 3))).toBe('auto');
  });
});

describe('数列定義', () => {
  it('2のべき乗の項と出題文が整合する', () => {
    expect(seq.term(14)).toBe(16384);
    expect(seq.promptJa(14)).toBe('8192 + 8192 は?');
  });

  it('半分の列・3.14の段・分数も正しい値を返す', () => {
    expect(getSequence('pow2_down').term(1)).toBe(2 ** 19);
    expect(getSequence('pi_multiples').term(3)).toBe(9.42);
    expect(getSequence('squares').term(17)).toBe(289);
    expect(getSequence('fractions').term(0)).toBe(0.5);
    expect(getSequence('primes').term(4)).toBe(11);
  });
});
