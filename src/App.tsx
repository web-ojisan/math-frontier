// 最小UI(MVP): 2のべき乗のみ・ボス1体・一人プレイ。
// ホーム → バトル(テンキーで回答、ダメージ=答えた数、速答は1.5倍+派手な演出)→ 勝利。
// 反応時間は「出題表示から最初のタップまで」をfirstKeyMsとして記録する(CLAUDE.md 計測規約)。
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadAttempts, saveAttempt } from './attempt-store';
import { computeBossHp, damageFor } from './boss';
import { createRng, pickQuestion, type Question } from './scheduler';
import { getSequence } from './sequences';
import { estimateAllStates, type Attempt } from './state-estimator';

// MVPは2のべき乗のみ(他の列は次のステップで解放)
const seq = getSequence('pow2_up');

type Screen = 'loading' | 'home' | 'battle' | 'victory';
type VictoryInfo = { totalDamage: number; questions: number; newlyAuto: number };

function countAuto(states: Map<string, string>): number {
  return [...states.values()].filter((state) => state === 'auto').length;
}

/** 完全オリジナルの単純なボス(既存ゲームのキャラクターに寄せない) */
function BossFigure() {
  return (
    <svg viewBox="0 0 100 80" className="boss-figure" role="img" aria-label="ボス">
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
        <p className="victory-title">ボスを たおした!</p>
        <BossFigure />
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

type Effect = { kind: 'hit' | 'critical' | 'miss' | 'guard'; damage: number; key: number };

function Battle({
  pastAttempts,
  onFinish,
}: {
  pastAttempts: Attempt[];
  onFinish: (sessionAttempts: Attempt[], info: VictoryInfo) => void;
}) {
  // ボスHPはバトル開始時点の実力から逆算して固定
  const bossMaxHp = useMemo(() => computeBossHp(seq, estimateAllStates(pastAttempts)), [pastAttempts]);
  const [bossHp, setBossHp] = useState(bossMaxHp);
  const [sessionAttempts, setSessionAttempts] = useState<Attempt[]>([]);
  const [typed, setTyped] = useState('');
  const [effect, setEffect] = useState<Effect | null>(null);
  const [missStreak, setMissStreak] = useState(0);
  const [totalDamage, setTotalDamage] = useState(0);

  const rngRef = useRef(createRng((Date.now() % 2147483647) >>> 0));
  const recentRef = useRef<number[]>([]);
  const shownAtRef = useRef(performance.now());
  const firstKeyAtRef = useRef<number | null>(null);
  const effectKeyRef = useRef(0);
  const finishedRef = useRef(false);

  const [question, setQuestion] = useState<Question>(() =>
    pickQuestion(seq, estimateAllStates(pastAttempts), [], rngRef.current),
  );

  const showNextQuestion = (updated: Attempt[], lastIndex: number) => {
    recentRef.current = [...recentRef.current, lastIndex].slice(-12);
    const states = estimateAllStates([...pastAttempts, ...updated]);
    setQuestion(pickQuestion(seq, states, recentRef.current, rngRef.current));
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
    const correctAnswer = seq.term(question.item.index);
    const correct = value === correctAnswer;

    const attempt: Attempt = {
      sequenceId: seq.id,
      index: question.item.index,
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
      showNextQuestion(updated, question.item.index);
    } else if (missStreak + 1 >= 2) {
      // 連続ミスでその問題は引っ込める(当てずっぽうの連打が得にならない設計)
      setMissStreak(0);
      setEffect({ kind: 'guard', damage: 0, key: effectKeyRef.current });
      showNextQuestion(updated, question.item.index);
    } else {
      // 1回のミスは軽いペナルティ(外れただけ)。同じ問題を解き直す
      setMissStreak(missStreak + 1);
      setEffect({ kind: 'miss', damage: 0, key: effectKeyRef.current });
      setTyped('');
      firstKeyAtRef.current = null;
      shownAtRef.current = performance.now();
    }
  };

  return (
    <main className="app battle">
      <div className="boss-area" key={effect?.kind === 'critical' ? `shake-${effect.key}` : 'still'}>
        <div className="hpbar">
          <div className="hpfill" style={{ width: `${(bossHp / bossMaxHp) * 100}%` }} />
        </div>
        <div className={effect?.kind === 'critical' ? 'shake' : ''}>
          <BossFigure />
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
          <p key={effect.key} className="miss-pop">ガードされた! つぎのもんだい!</p>
        )}
      </div>

      <div className="question-area">
        <p className="prompt">{seq.promptJa(question.item.index)}</p>
        <p className="typed">{typed === '' ? ' ' : typed}</p>
      </div>

      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
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
