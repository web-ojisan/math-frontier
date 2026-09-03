// 最小UI(MVP): 2のべき乗のみ・ボス1体・一人プレイ。
// ホーム → バトル(テンキーで回答、ダメージ=答えた数、速答は1.5倍+派手な演出)→ 勝利。
// 反応時間は「出題表示から最初のタップまで」をfirstKeyMsとして記録する(CLAUDE.md 計測規約)。
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadAttempts, saveAttempt } from './attempt-store';
import { computeStageBossHp, damageFor, STAGE_COUNT } from './boss';
import { getSequence } from './sequences';
import { estimateAllStates, type Attempt } from './state-estimator';

// MVPは2のべき乗のみ(他の列は次のステップで解放)
const seq = getSequence('pow2_up');

type Screen = 'loading' | 'home' | 'battle' | 'victory';
type VictoryInfo = { totalDamage: number; questions: number; newlyAuto: number };

function countAuto(states: Map<string, string>): number {
  return [...states.values()].filter((state) => state === 'auto').length;
}

/** 完全オリジナルの単純なボスたち(既存ゲームのキャラクターに寄せない)。3段階で強そうになる */
function BossFigure({ stage = 2 }: { stage?: number }) {
  if (stage === 1) {
    // 小物: まるい緑のスライム風(ツノなし)
    return (
      <svg viewBox="0 0 100 80" className="boss-figure boss-stage-1" role="img" aria-label="てき">
        <ellipse cx="50" cy="50" rx="26" ry="22" fill="#5ec26a" />
        <circle cx="42" cy="46" r="5" fill="#fff" />
        <circle cx="58" cy="46" r="5" fill="#fff" />
        <circle cx="43" cy="47" r="2.2" fill="#1b1035" />
        <circle cx="59" cy="47" r="2.2" fill="#1b1035" />
        <path d="M44 58 Q50 62 56 58" stroke="#1b1035" stroke-width="2.5" fill="none" stroke-linecap="round" />
      </svg>
    );
  }
  if (stage >= 3) {
    // 大ボス: 赤い巨体・ツノ3本・きば
    return (
      <svg viewBox="0 0 100 90" className="boss-figure boss-stage-3" role="img" aria-label="大ボス">
        <ellipse cx="50" cy="52" rx="36" ry="32" fill="#e2504c" />
        <circle cx="37" cy="44" r="7" fill="#fff" />
        <circle cx="63" cy="44" r="7" fill="#fff" />
        <circle cx="39" cy="46" r="3" fill="#1b1035" />
        <circle cx="65" cy="46" r="3" fill="#1b1035" />
        <path d="M30 40 L44 44" stroke="#1b1035" stroke-width="2.5" stroke-linecap="round" />
        <path d="M70 40 L56 44" stroke="#1b1035" stroke-width="2.5" stroke-linecap="round" />
        <path d="M36 66 Q50 74 64 66" stroke="#1b1035" stroke-width="3" fill="none" stroke-linecap="round" />
        <path d="M42 66 L45 72 L48 66 Z" fill="#fff" />
        <path d="M52 66 L55 72 L58 66 Z" fill="#fff" />
        <path d="M22 26 L30 8 L38 26 Z" fill="#ffd94d" />
        <path d="M44 22 L50 4 L56 22 Z" fill="#ffd94d" />
        <path d="M62 26 L70 8 L78 26 Z" fill="#ffd94d" />
      </svg>
    );
  }
  // 中ボス: 紫のツノ2本(従来のキャラ)
  return (
    <svg viewBox="0 0 100 80" className="boss-figure boss-stage-2" role="img" aria-label="ボス">
      <ellipse cx="50" cy="46" rx="32" ry="28" fill="#7c5cff" />
      <circle cx="39" cy="40" r="6.5" fill="#fff" />
      <circle cx="61" cy="40" r="6.5" fill="#fff" />
      <circle cx="40.5" cy="41.5" r="2.8" fill="#1b1035" />
      <circle cx="62.5" cy="41.5" r="2.8" fill="#1b1035" />
      <path d="M40 58 Q50 66 60 58" stroke="#1b1035" stroke-width="3" fill="none" stroke-linecap="round" />
      <path d="M28 22 L35 8 L42 22 Z" fill="#ffd94d" />
      <path d="M58 22 L65 8 L72 22 Z" fill="#ffd94d" />
    </svg>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('loading');
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [victory, setVictory] = useState<VictoryInfo | null>(null);

  useEffect(() => {
    loadAttempts()
      .then((loaded) => {
        setAttempts(loaded);
        setScreen('home');
      })
      .catch(() => {
        // 読み込みに失敗しても遊べるようにする(記録はベストエフォート)
        setScreen('home');
      });
  }, []);

  // 自己ベストは「一度でも正答した最大の項」。決して下がらない(推定は変動・表示は単調)
  const personalBest = useMemo(() => {
    let best = 0;
    for (const attempt of attempts) {
      if (attempt.sequenceId === seq.id && attempt.correct) best = Math.max(best, attempt.index);
    }
    return best;
  }, [attempts]);

  if (screen === 'loading') {
    return (
      <main className="app">
        <p className="loading">じゅんびちゅう…</p>
      </main>
    );
  }

  if (screen === 'battle') {
    return (
      <Battle
        pastAttempts={attempts}
        onFinish={(sessionAttempts, info) => {
          setAttempts((prev) => [...prev, ...sessionAttempts]);
          setVictory(info);
          setScreen('victory');
        }}
      />
    );
  }

  if (screen === 'victory' && victory) {
    return (
      <main className="app center">
        <p className="victory-title">ぜんぶの てきを たおした!</p>
        <BossFigure stage={3} />
        <p className="victory-line">あたえた ダメージ: <strong>{victory.totalDamage}</strong></p>
        {victory.newlyAuto > 0 && (
          <p className="victory-line">そくとうできる かずが <strong>+{victory.newlyAuto}</strong> ふえた!</p>
        )}
        {personalBest > 0 && (
          <p className="victory-line">じこベスト: <strong>{seq.term(personalBest)}</strong></p>
        )}
        <button className="big-button" type="button" onClick={() => setScreen('home')}>
          ホームへ
        </button>
      </main>
    );
  }

  return (
    <main className="app center">
      <h1 className="title">かずの フロンティア</h1>
      <BossFigure />
      {personalBest > 0 ? (
        <p className="best">
          じこベスト: <strong>{seq.term(personalBest)}</strong>
          <br />
          <span className="best-sub">(2を {personalBest}かい かけたかず)</span>
        </p>
      ) : (
        <p className="best">きょうから ぼうけんが はじまる!</p>
      )}
      <button className="big-button" type="button" onClick={() => setScreen('battle')}>
        たたかう!
      </button>
    </main>
  );
}

type Effect = { kind: 'hit' | 'critical' | 'miss' | 'guard' | 'defeat'; damage: number; key: number };

function Battle({
  pastAttempts,
  onFinish,
}: {
  pastAttempts: Attempt[];
  onFinish: (sessionAttempts: Attempt[], info: VictoryInfo) => void;
}) {
  // 敵は3段階(小物→中ボス→大ボス)。HPは登り位置と記録から逆算する(boss.ts参照)
  const [stage, setStage] = useState(1);
  const [bossMaxHp, setBossMaxHp] = useState(() =>
    computeStageBossHp(seq, estimateAllStates(pastAttempts), seq.firstIndex - 1, 1),
  );
  const [bossHp, setBossHp] = useState(bossMaxHp);
  const [sessionAttempts, setSessionAttempts] = useState<Attempt[]>([]);
  const [typed, setTyped] = useState('');
  const [effect, setEffect] = useState<Effect | null>(null);
  const [missStreak, setMissStreak] = useState(0);
  const [totalDamage, setTotalDamage] = useState(0);

  const shownAtRef = useRef(performance.now());
  const firstKeyAtRef = useRef<number | null>(null);
  const effectKeyRef = useRef(0);
  const finishedRef = useRef(false);

  // 出題は完全固定の昇順(2→4→8→…)。毎バトル、列の最初から登る。
  // 序盤の簡単な数は即答クリティカルでサクサク進むウォームアップになり、
  // 観察された遊び方(最初から唱えて伸ばす)とも一致する。
  // ランダムな高速想起の出題(scheduler.ts)は将来の「そくとうモード」で使う。
  const [questionIndex, setQuestionIndex] = useState(seq.firstIndex);

  const showQuestion = (index: number) => {
    setQuestionIndex(index);
    setTyped('');
    firstKeyAtRef.current = null;
    shownAtRef.current = performance.now();
  };

  // 最初のタップの時刻=思考終了の信号(けす・数字どちらでも)
  const markFirstKey = () => {
    if (firstKeyAtRef.current === null) firstKeyAtRef.current = performance.now();
  };

  const tapDigit = (digit: string) => {
    if (finishedRef.current) return;
    markFirstKey();
    // 答えの最大は 2^20 = 1048576 の7桁
    setTyped((t) => (t.length >= 7 ? t : t + digit));
  };


  const attack = () => {
    if (finishedRef.current || typed === '') return;
    const value = parseInt(typed, 10);
    const now = performance.now();
    const firstKeyMs = Math.round((firstKeyAtRef.current ?? now) - shownAtRef.current);
    const totalMs = Math.round(now - shownAtRef.current);
    const correctAnswer = seq.term(questionIndex);
    const correct = value === correctAnswer;

    const attempt: Attempt = {
      sequenceId: seq.id,
      index: questionIndex,
      answer: value,
      correct,
      firstKeyMs,
      totalMs,
      answeredAt: new Date().toISOString(),
    };
    // 保存失敗でもゲームは続行する(ローカル記録はベストエフォート)
    saveAttempt(attempt).catch(() => {});
    const updated = [...sessionAttempts, attempt];
    setSessionAttempts(updated);

    effectKeyRef.current += 1;
    if (correct) {
      const { damage, critical } = damageFor(correctAnswer, firstKeyMs);
      const newHp = Math.max(0, bossHp - damage);
      const newTotal = totalDamage + damage;
      setBossHp(newHp);
      setTotalDamage(newTotal);
      setMissStreak(0);
      setEffect({ kind: critical ? 'critical' : 'hit', damage, key: effectKeyRef.current });

      if (newHp <= 0) {
        if (stage < STAGE_COUNT) {
          // 次の敵が登場。登りは続きから(HPは今の登り位置と記録から逆算)
          const nextStage = stage + 1;
          const statesNow = estimateAllStates([...pastAttempts, ...updated]);
          const nextHp = computeStageBossHp(seq, statesNow, questionIndex, nextStage);
          setStage(nextStage);
          setBossMaxHp(nextHp);
          setBossHp(nextHp);
          setEffect({ kind: 'defeat', damage, key: effectKeyRef.current });
          showQuestion(questionIndex >= seq.lastIndex ? seq.firstIndex : questionIndex + 1);
          return;
        }
        finishedRef.current = true;
        const beforeAuto = countAuto(estimateAllStates(pastAttempts));
        const afterAuto = countAuto(estimateAllStates([...pastAttempts, ...updated]));
        // 倒した演出を見せてから勝利画面へ
        setTimeout(() => {
          onFinish(updated, {
            totalDamage: newTotal,
            questions: updated.length,
            newlyAuto: Math.max(0, afterAuto - beforeAuto),
          });
        }, 1100);
        return;
      }
      // 正解したら次の項へ。列を登り切ったら最初からもう1周
      showQuestion(questionIndex >= seq.lastIndex ? seq.firstIndex : questionIndex + 1);
    } else if (missStreak + 1 >= 2) {
      // 壁(2連続ミス)に当たったら最初から登り直し(知らない数をスキップして詰まないように)
      setMissStreak(0);
      setEffect({ kind: 'guard', damage: 0, key: effectKeyRef.current });
      showQuestion(seq.firstIndex);
    } else {
      // 1回のミスは軽いペナルティ(外れただけ)。同じ問題を解き直す
      setMissStreak(missStreak + 1);
      setEffect({ kind: 'miss', damage: 0, key: effectKeyRef.current });
      setTyped('');
      firstKeyAtRef.current = null;
      shownAtRef.current = performance.now();
    }
  };

  // 物理キーボード対応(ノートPC・iPad+キーボード): 数字キー、Backspace=1文字消す、Enter=こうげき。
  // ハンドラは毎レンダーの最新をrefで参照し、リスナー登録は1回だけにする
  const keyHandlersRef = useRef({ tapDigit, attack, backspace: () => {} });
  keyHandlersRef.current = {
    tapDigit,
    attack,
    backspace: () => {
      if (finishedRef.current) return;
      markFirstKey();
      setTyped((t) => t.slice(0, -1));
    },
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key >= '0' && event.key <= '9') {
        event.preventDefault();
        keyHandlersRef.current.tapDigit(event.key);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        keyHandlersRef.current.backspace();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        keyHandlersRef.current.attack();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <main className="app battle">
      <div className="boss-area" key={effect?.kind === 'critical' ? `shake-${effect.key}` : 'still'}>
        <p className="stage-label">てき {stage} / {STAGE_COUNT}</p>
        <div className="hpbar">
          <div className="hpfill" style={{ width: `${(bossHp / bossMaxHp) * 100}%` }} />
        </div>
        <div className={effect?.kind === 'critical' ? 'shake' : ''}>
          <BossFigure stage={stage} />
        </div>
        {effect && (effect.kind === 'hit' || effect.kind === 'critical') && (
          <p key={effect.key} className={`damage-pop ${effect.kind}`}>
            {effect.damage}
            {effect.kind === 'critical' && '!!'}
          </p>
        )}
        {effect && effect.kind === 'miss' && (
          <p key={effect.key} className="miss-pop">こうげきが はずれた!</p>
        )}
        {effect && effect.kind === 'guard' && (
          <p key={effect.key} className="miss-pop">ガードされた! さいしょから もういちど!</p>
        )}
        {effect && effect.kind === 'defeat' && (
          <p key={effect.key} className="defeat-pop">たおした! つぎのてきが あらわれた!</p>
        )}
      </div>

      <div className="question-area">
        <p className="prompt">{seq.promptJa(questionIndex)}</p>
        <p className="typed">{typed === '' ? ' ' : typed}</p>
      </div>

      <div className="keypad">
        {/* 電卓と同じ配列(789が上段)。机に置いたiPadで打ちやすい */}
        {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((digit) => (
          <button key={digit} type="button" className="key" onClick={() => tapDigit(digit)}>
            {digit}
          </button>
        ))}
        <button
          type="button"
          className="key key-sub"
          onClick={() => {
            markFirstKey();
            setTyped('');
          }}
        >
          けす
        </button>
        <button type="button" className="key" onClick={() => tapDigit('0')}>
          0
        </button>
        <button type="button" className="key key-attack" onClick={attack} disabled={typed === ''}>
          こうげき
        </button>
      </div>
    </main>
  );
}
