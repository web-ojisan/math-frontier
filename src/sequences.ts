// 数列の定義。「列の定義(次の項の求め方、表示形式、逆引きの有無)」をデータとして持つ。
// 問題はすべてここからプログラム生成する(市販教材・LLMは使わない)。
//
// 項目=遷移: index n の項目は「term(n-1) から term(n) を出す」出題を表す。
// フロンティア(端を暗算で伸ばす)も高速想起(内側を即答で引く)も同じ形式で、
// 違いは反応時間に表れる(CLAUDE.md「計測・推定の規約」参照)。

export type SequenceDef = {
  id: string;
  titleJa: string;
  /** 出題できる最小のindex(この項目は前提なしでいつでも出題可能) */
  firstIndex: number;
  /** 出題できる最大のindex */
  lastIndex: number;
  /** index番目の項の値(=そのindexの出題の正解) */
  term: (index: number) => number;
  /** 出題文。ふりがな前提の短い文にする(6歳が読める字が少ない前提) */
  promptJa: (index: number) => string;
  /** 逆引き出題(「289はなにの平方?」等)を将来持つか。データモデル上の考慮のみで現在は未実装 */
  hasReverse: boolean;
};

/** 最初の30個の素数(素数列はプログラムで判定するより表の方が単純で確実) */
const PRIMES = [
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97,
  101, 103, 107, 109, 113,
];

/** 分数と小数の対応(1/2系・1/4系・1/5系・1/8系。1/3系は循環小数のため将来検討) */
const FRACTIONS: { label: string; value: number }[] = [
  { label: '1/2', value: 0.5 },
  { label: '1/4', value: 0.25 },
  { label: '3/4', value: 0.75 },
  { label: '1/5', value: 0.2 },
  { label: '2/5', value: 0.4 },
  { label: '3/5', value: 0.6 },
  { label: '4/5', value: 0.8 },
  { label: '1/8', value: 0.125 },
  { label: '3/8', value: 0.375 },
  { label: '5/8', value: 0.625 },
  { label: '7/8', value: 0.875 },
];

export const SEQUENCES: SequenceDef[] = [
  {
    // 2のべき乗(順方向)。index n の項は 2^n。出題は「2^(n-1) を 2ばい」
    id: 'pow2_up',
    titleJa: '2ばい の れつ',
    firstIndex: 1,
    lastIndex: 20, // 2^20 = 1,048,576 まで
    term: (index) => 2 ** index,
    promptJa: (index) => `${2 ** (index - 1)} を 2ばい すると?`,
    hasReverse: true,
  },
  {
    // 2のべき乗(半分にしていく逆方向)。index n の項は 2^(20-n)。出題は「2^(21-n) の はんぶん」
    id: 'pow2_down',
    titleJa: 'はんぶん の れつ',
    firstIndex: 1,
    lastIndex: 20,
    term: (index) => 2 ** (20 - index),
    promptJa: (index) => `${2 ** (21 - index)} の はんぶんは?`,
    hasReverse: false,
  },
  {
    // 平方数。index n の項は n^2(1〜19。仕様上 11〜19 を重視するのは出題選択側の将来課題)
    id: 'squares',
    titleJa: 'しかくの かず(n×n)',
    firstIndex: 1,
    lastIndex: 19,
    term: (index) => index * index,
    promptJa: (index) => `${index} × ${index} は?`,
    hasReverse: true,
  },
  {
    // 3.14の倍数(×1〜×9)
    id: 'pi_multiples',
    titleJa: '3.14 の だん',
    firstIndex: 1,
    lastIndex: 9,
    term: (index) => Math.round(3.14 * index * 100) / 100,
    promptJa: (index) => `3.14 × ${index} は?`,
    hasReverse: false,
  },
  {
    // 分数と小数の対応
    id: 'fractions',
    titleJa: 'ぶんすうと しょうすう',
    firstIndex: 0,
    lastIndex: FRACTIONS.length - 1,
    term: (index) => FRACTIONS[index]!.value,
    promptJa: (index) => `${FRACTIONS[index]!.label} を しょうすうで いうと?`,
    hasReverse: true,
  },
  {
    // 素数列。index n の項は n番目の素数。出題は「◯のつぎの そすうは?」
    id: 'primes',
    titleJa: 'そすうの れつ',
    firstIndex: 1,
    lastIndex: PRIMES.length - 1,
    term: (index) => PRIMES[index]!,
    promptJa: (index) => `${PRIMES[index - 1]} の つぎの そすうは?`,
    hasReverse: false,
  },
];

export function getSequence(id: string): SequenceDef {
  const seq = SEQUENCES.find((s) => s.id === id);
  if (!seq) throw new Error(`未知の数列IDです: ${id}`);
  return seq;
}
