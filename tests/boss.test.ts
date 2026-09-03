// 敵ライン(マイルストーン固定)とダメージ計算の単体テスト。
import { describe, expect, it } from 'vitest';
import { buildEnemies, damageFor } from '../src/boss';
import { getSequence } from '../src/sequences';

const seq = getSequence('pow2_up');

describe('damageFor', () => {
  it('正答は答えの数がそのままダメージになる', () => {
    expect(damageFor(16384, 5000)).toEqual({ damage: 16384, critical: false });
  });

  it('速答(自動化閾値以内)なら1.5倍のクリティカル', () => {
    expect(damageFor(16384, 1500)).toEqual({ damage: 24576, critical: true });
  });
});

describe('buildEnemies', () => {
  const enemies = buildEnemies(seq);

  it('敵は5体で、撃破条件は 8+8 / 64+64 / 512+512 / 8192+8192 / 65536+65536', () => {
    expect(enemies.map((e) => seq.term(e.milestoneIndex))).toEqual([16, 128, 1024, 16384, 131072]);
    expect(enemies.map((e) => e.name)).toEqual(['ざこ1', 'ざこ2', 'ざこ3', 'ざこ4', 'ちゅうボス']);
  });

  it('担当区間は途切れず連続している', () => {
    expect(enemies[0]!.startIndex).toBe(seq.firstIndex);
    for (let i = 1; i < enemies.length; i++) {
      expect(enemies[i]!.startIndex).toBe(enemies[i - 1]!.milestoneIndex + 1);
    }
  });

  it('敵HPは担当区間の項の合計(ざこ1 = 2+4+8+16 = 30)', () => {
    expect(enemies[0]!.hp).toBe(30);
    expect(enemies[1]!.hp).toBe(32 + 64 + 128);
  });

  it('クリティカル込みでもマイルストーン前の項だけではHPが尽きない(とどめは必ずマイルストーン)', () => {
    for (const enemy of enemies) {
      let preMilestoneDamage = 0;
      for (let index = enemy.startIndex; index < enemy.milestoneIndex; index++) {
        preMilestoneDamage += seq.term(index) * 1.5; // 全部クリティカルの最大ダメージ
      }
      expect(preMilestoneDamage).toBeLessThan(enemy.hp);
    }
  });

  it('敵ラインが未定義の数列ではエラーになる', () => {
    expect(() => buildEnemies(getSequence('squares'))).toThrow('敵ラインが未定義');
  });
});
