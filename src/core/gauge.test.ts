import { describe, it, expect } from 'vitest';
import { applyGaugeHit, getInitialHealth, isTrackCleared, GAUGE_RECOVERY } from './gauge';
import { JudgmentType, GaugeType } from './types';

describe('GAUGE_RECOVERY', () => {
  it('has correct norma values', () => {
    expect(GAUGE_RECOVERY.norma.perfect).toBe(2.0);
    expect(GAUGE_RECOVERY.norma.great).toBe(1.0);
    expect(GAUGE_RECOVERY.norma.nice).toBe(0.2);
    expect(GAUGE_RECOVERY.norma.bad).toBe(-2.0);
    expect(GAUGE_RECOVERY.norma.miss).toBe(-5.0);
  });

  it('has correct life values', () => {
    expect(GAUGE_RECOVERY.life.perfect).toBe(0.2);
    expect(GAUGE_RECOVERY.life.great).toBe(0.1);
    expect(GAUGE_RECOVERY.life.nice).toBe(0.0);
    expect(GAUGE_RECOVERY.life.bad).toBe(-4.0);
    expect(GAUGE_RECOVERY.life.miss).toBe(-5.0);
  });

  it('has correct life_hard values', () => {
    expect(GAUGE_RECOVERY.life_hard.perfect).toBe(0.2);
    expect(GAUGE_RECOVERY.life_hard.great).toBe(0.1);
    expect(GAUGE_RECOVERY.life_hard.nice).toBe(0.0);
    expect(GAUGE_RECOVERY.life_hard.bad).toBe(-5.0);
    expect(GAUGE_RECOVERY.life_hard.miss).toBe(-10.0);
  });
});

describe('applyGaugeHit', () => {
  // --- Norma gauge ---
  it('norma: perfect adds 2.0', () => {
    const result = applyGaugeHit(50, 'perfect', 'norma');
    expect(result.health).toBe(52.0);
    expect(result.isDead).toBe(false);
  });

  it('norma: miss subtracts 5.0', () => {
    const result = applyGaugeHit(10, 'miss', 'norma');
    expect(result.health).toBe(5.0);
    expect(result.isDead).toBe(false);
  });

  it('norma: health clamps at 0 (no negative)', () => {
    const result = applyGaugeHit(3, 'miss', 'norma');
    expect(result.health).toBe(0);
    expect(result.isDead).toBe(false); // Norma never dies
  });

  it('norma: health clamps at 100', () => {
    const result = applyGaugeHit(99, 'perfect', 'norma');
    expect(result.health).toBe(100);
  });

  it('norma: never isDead even at 0 health', () => {
    const result = applyGaugeHit(0, 'miss', 'norma');
    expect(result.health).toBe(0);
    expect(result.isDead).toBe(false);
  });

  // --- Life gauge ---
  it('life: miss brings health to 0 → isDead', () => {
    const result = applyGaugeHit(4, 'miss', 'life');
    expect(result.health).toBe(0);
    expect(result.isDead).toBe(true);
  });

  it('life: bad subtracts 4.0', () => {
    const result = applyGaugeHit(50, 'bad', 'life');
    expect(result.health).toBe(46.0);
    expect(result.isDead).toBe(false);
  });

  it('life: perfect adds only 0.2', () => {
    const result = applyGaugeHit(50, 'perfect', 'life');
    expect(result.health).toBeCloseTo(50.2);
  });

  // --- Life Hard gauge ---
  it('life_hard: miss subtracts 10.0', () => {
    const result = applyGaugeHit(15, 'miss', 'life_hard');
    expect(result.health).toBe(5.0);
    expect(result.isDead).toBe(false);
  });

  it('life_hard: miss at 9 health → isDead', () => {
    const result = applyGaugeHit(9, 'miss', 'life_hard');
    expect(result.health).toBe(0);
    expect(result.isDead).toBe(true);
  });

  it('life_hard: bad subtracts 5.0', () => {
    const result = applyGaugeHit(5, 'bad', 'life_hard');
    expect(result.health).toBe(0);
    expect(result.isDead).toBe(true);
  });

  // --- Sequence simulation ---
  it('simulates a sequence of hits on norma gauge', () => {
    let health = 0;
    const sequence: JudgmentType[] = ['perfect', 'perfect', 'great', 'nice', 'miss', 'perfect'];
    // 0 + 2.0 + 2.0 + 1.0 + 0.2 - 5.0 + 2.0 = 2.2

    for (const j of sequence) {
      const result = applyGaugeHit(health, j, 'norma');
      health = result.health;
    }
    expect(health).toBeCloseTo(2.2);
  });

  it('simulates life gauge death mid-sequence', () => {
    let health = 100;
    let dead = false;
    const sequence: JudgmentType[] = Array(21).fill('miss'); // 21 * -5.0 = -105, but dies at 0

    for (const j of sequence) {
      if (dead) break;
      const result = applyGaugeHit(health, j, 'life');
      health = result.health;
      dead = result.isDead;
    }
    expect(dead).toBe(true);
    expect(health).toBe(0);
  });
});

describe('getInitialHealth', () => {
  it('norma starts at 0', () => {
    expect(getInitialHealth('norma')).toBe(0);
  });

  it('life starts at 100', () => {
    expect(getInitialHealth('life')).toBe(100);
  });

  it('life_hard starts at 100', () => {
    expect(getInitialHealth('life_hard')).toBe(100);
  });
});

describe('isTrackCleared', () => {
  it('norma: cleared at health 70', () => {
    expect(isTrackCleared('norma', 70, false)).toBe(true);
  });

  it('norma: not cleared at health 69', () => {
    expect(isTrackCleared('norma', 69, false)).toBe(false);
  });

  it('norma: not cleared even with high health if isDead (should not happen, but defensive)', () => {
    expect(isTrackCleared('norma', 80, true)).toBe(false);
  });

  it('life: cleared if survived (not dead)', () => {
    expect(isTrackCleared('life', 50, false)).toBe(true);
    expect(isTrackCleared('life', 1, false)).toBe(true);
  });

  it('life: not cleared if died', () => {
    expect(isTrackCleared('life', 0, true)).toBe(false);
  });

  it('life_hard: cleared if survived', () => {
    expect(isTrackCleared('life_hard', 30, false)).toBe(true);
  });

  it('life_hard: not cleared if died', () => {
    expect(isTrackCleared('life_hard', 0, true)).toBe(false);
  });
});
