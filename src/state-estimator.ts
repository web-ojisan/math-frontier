// 項目ごとの3状態(未到達/暗算で出せる/自動化済み)を試行ログから推定する。
//
// 設計の根拠:
// - 主信号は firstKeyMs(出題表示から最初のキー入力までの「思考時間」)。
//   回答確定までの時間だと桁数が多い項目(16384は5桁)が不利になり誤判定するため。
//   思考時間は「計算して出す(数秒〜)」と「想起する(〜2秒)」で分布が分かれる。
// - 推定は履歴を古い順に畳み込むステートマシンで行う。理由:
//   (a) 昇格・降級のルールを明示的に書けて説明可能(なぜこの状態かを言える)
//   (b) ヒステリシスを入れられる(誤タップ1回で自動化済みを剥奪しない)
// - コールドスタート: データが無い項目は unknown。閾値は固定のプリセットから始める。
//   子ども個人の分布に合わせた補正は、実データが溜まってからの将来課題とする
//   (シミュレーションでは固定閾値で十分に妥当な遷移になることを確認している)。
// - 降級あり: この推定は「ご褒美」ではなく出題選択のための実力の現在値。
//   子どもに見せる数字(自己ベスト等)は別途、下がらない値だけを見せる(CLAUDE.md参照)。

export type ItemState = 'unknown' | 'mental' | 'auto';

export type Attempt = {
  sequenceId: string;
  index: number;
  /** 子が入力した答え */
  answer: number;
  correct: boolean;
  /** 出題表示から最初のキー入力までのミリ秒(思考時間。主信号) */
  firstKeyMs: number;
  /** 出題表示から回答確定までのミリ秒(記録・親サマリ用) */
  totalMs: number;
  answeredAt: string;
};

export type EstimatorConfig = {
  /** これ以下の思考時間での正答を「速答」とみなす */
  autoFirstKeyMs: number;
  /** 速答がこの回数連続したら自動化済みに昇格 */
  promoteStreak: number;
  /** 自動化済みの項目で、速答でない正答がこの回数連続したら暗算段階へ降級 */
  demoteSlowStreak: number;
  /** 誤答がこの回数連続したら1段階降級(auto→mental、mental→unknown) */
  demoteMissStreak: number;
};

export const DEFAULT_ESTIMATOR_CONFIG: EstimatorConfig = {
  // 6歳のタップ操作を考慮して2秒。大人向けに厳しくする場合はプロフィールごとに変える想定
  autoFirstKeyMs: 2000,
  promoteStreak: 3,
  demoteSlowStreak: 2,
  demoteMissStreak: 2,
};

/**
 * 同一項目の試行ログ(古い順)から現在の状態を推定する。
 * - 正答で unknown → mental(一度でも自力で出せたら「暗算で出せる」)
 * - 速答 promoteStreak 連続で → auto
 * - auto中に非速答の正答が demoteSlowStreak 連続で → mental(誤タップ1回では落とさない)
 * - 誤答が demoteMissStreak 連続で1段階降級
 */
export function estimateState(
  attempts: Attempt[],
  config: EstimatorConfig = DEFAULT_ESTIMATOR_CONFIG,
): ItemState {
  let state: ItemState = 'unknown';
  let fastStreak = 0;
  let slowStreak = 0;
  let missStreak = 0;

  for (const attempt of attempts) {
    if (attempt.correct) {
      missStreak = 0;
      const isFast = attempt.firstKeyMs <= config.autoFirstKeyMs;
      if (isFast) {
        fastStreak += 1;
        slowStreak = 0;
      } else {
        fastStreak = 0;
        slowStreak += 1;
      }
      if (state === 'unknown') state = 'mental';
      if (fastStreak >= config.promoteStreak) state = 'auto';
      if (state === 'auto' && slowStreak >= config.demoteSlowStreak) {
        state = 'mental';
        slowStreak = 0;
      }
    } else {
      fastStreak = 0;
      slowStreak = 0;
      missStreak += 1;
      if (missStreak >= config.demoteMissStreak) {
        state = state === 'auto' ? 'mental' : 'unknown';
        missStreak = 0;
      }
    }
  }

  return state;
}

/** 項目キー(ログのグルーピング用) */
export function itemKey(sequenceId: string, index: number): string {
  return `${sequenceId}:${index}`;
}

/** 試行ログ全体から、項目ごとの状態マップを作る(ログは時刻順である前提) */
export function estimateAllStates(
  attempts: Attempt[],
  config: EstimatorConfig = DEFAULT_ESTIMATOR_CONFIG,
): Map<string, ItemState> {
  const byItem = new Map<string, Attempt[]>();
  for (const attempt of attempts) {
    const key = itemKey(attempt.sequenceId, attempt.index);
    const list = byItem.get(key) ?? [];
    list.push(attempt);
    byItem.set(key, list);
  }
  const states = new Map<string, ItemState>();
  for (const [key, list] of byItem) {
    states.set(key, estimateState(list, config));
  }
  return states;
}
