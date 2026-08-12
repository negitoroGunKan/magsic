import { describe, it, expect } from 'vitest';
import { applyGaugeHit, getInitialHealth, isTrackCleared, GAUGE_RECOVERY } from './gauge';
import { JudgmentType, GaugeType } from './types';

describe('GAUGE_RECOVERY', () => {
  it('has correct norma_easy values', () => {
    expect(GAUGE_RECOVERY.norma_easy.critical).toBe(1.0);
    expect(GAUGE_RECOVERY.norma_easy.great).toBe(0.5);
    expect(GAUGE_RECOVERY.norma_easy.good).toBe(0.5);
    expect(GAUGE_RECOVERY.norma_easy.fail).toBe(-1.0);
    expect(GAUGE_RECOVERY.norma_easy.miss).toBe(-3.0);
  });

  it('has correct norma values', () => {
    expect(GAUGE_RECOVERY.norma.critical).toBe(0.5);
    expect(GAUGE_RECOVERY.norma.great).toBe(0.2);
    expect(GAUGE_RECOVERY.norma.good).toBe(0.2);
    expect(GAUGE_RECOVERY.norma.fail).toBe(-2.0);
    expect(GAUGE_RECOVERY.norma.miss).toBe(-6.0);
  });

  it('has correct life values', () => {
    expect(GAUGE_RECOVERY.life.critical).toBe(0.5);
    expect(GAUGE_RECOVERY.life.great).toBe(0.2);
    expect(GAUGE_RECOVERY.life.good).toBe(0.2);
    expect(GAUGE_RECOVERY.life.fail).toBe(-6.0);
    expect(GAUGE_RECOVERY.life.miss).toBe(-8.0);
  });

  it('has correct life_hard values', () => {
    expect(GAUGE_RECOVERY.life_hard.critical).toBe(0.5);
    expect(GAUGE_RECOVERY.life_hard.great).toBe(0.2);
    expect(GAUGE_RECOVERY.life_hard.good).toBe(0.2);
    expect(GAUGE_RECOVERY.life_hard.fail).toBe(-10.0);
    expect(GAUGE_RECOVERY.life_hard.miss).toBe(-15.0);
  });

  it('has correct life_ex values', () => {
    expect(GAUGE_RECOVERY.life_ex.critical).toBe(0.5);
    expect(GAUGE_RECOVERY.life_ex.great).toBe(0.2);
    expect(GAUGE_RECOVERY.life_ex.good).toBe(0.2);
    expect(GAUGE_RECOVERY.life_ex.fail).toBe(-25.0);
    expect(GAUGE_RECOVERY.life_ex.miss).toBe(-50.0);
  });

  it('has correct sudden_death values', () => {
    expect(GAUGE_RECOVERY.sudden_death.critical).toBe(0.0);
    expect(GAUGE_RECOVERY.sudden_death.great).toBe(0.0);
    expect(GAUGE_RECOVERY.sudden_death.good).toBe(0.0);
    expect(GAUGE_RECOVERY.sudden_death.fail).toBe(-100.0);
    expect(GAUGE_RECOVERY.sudden_death.miss).toBe(-100.0);
  });
});

describe('applyGaugeHit', () => {
  // --- Norma gauge ---
  it('norma: critical adds 0.5', () => {
    const result = applyGaugeHit(50, 'critical', 'norma');
    expect(result.health).toBe(50.5);
    expect(result.isDead).toBe(false);
  });

  it('norma: miss subtracts 6.0', () => {
    const result = applyGaugeHit(10, 'miss', 'norma');
    expect(result.health).toBe(4.0);
    expect(result.isDead).toBe(false);
  });

  it('norma: health clamps at 0 (no negative)', () => {
    const result = applyGaugeHit(3, 'miss', 'norma');
    expect(result.health).toBe(0);
    expect(result.isDead).toBe(false); // Norma never dies
  });

  it('norma: health clamps at 100', () => {
    const result = applyGaugeHit(99.8, 'critical', 'norma');
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

  it('life: fail subtracts 6.0', () => {
    const result = applyGaugeHit(50, 'fail', 'life');
    expect(result.health).toBe(44.0);
    expect(result.isDead).toBe(false);
  });

  it('life: critical adds only 0.5', () => {
    const result = applyGaugeHit(50, 'critical', 'life');
    expect(result.health).toBeCloseTo(50.5);
  });

  // --- Life Hard gauge ---
  it('life_hard: miss subtracts 15.0', () => {
    const result = applyGaugeHit(20, 'miss', 'life_hard');
    expect(result.health).toBe(5.0);
    expect(result.isDead).toBe(false);
  });

  it('life_hard: miss at 9 health → isDead', () => {
    const result = applyGaugeHit(9, 'miss', 'life_hard');
    expect(result.health).toBe(0);
    expect(result.isDead).toBe(true);
  });

  it('life_hard: fail subtracts 10.0', () => {
    const result = applyGaugeHit(5, 'fail', 'life_hard');
    expect(result.health).toBe(0);
    expect(result.isDead).toBe(true);
  });

  // --- Sudden Death ---
  it('sudden_death: fail subtracts 100.0 → isDead', () => {
    const result = applyGaugeHit(100, 'fail', 'sudden_death');
    expect(result.health).toBe(0);
    expect(result.isDead).toBe(true);
  });

  // --- Sequence simulation ---
  it('simulates a sequence of hits on norma gauge', () => {
    let health = 80;
    const sequence: JudgmentType[] = ['critical', 'critical', 'great', 'good', 'miss', 'critical'];
    // 80 + 0.5 + 0.5 + 0.2 + 0.2 - 6.0 + 0.5 = 75.9

    for (const j of sequence) {
      const result = applyGaugeHit(health, j, 'norma');
      health = result.health;
    }
    expect(health).toBeCloseTo(75.9);
  });
});

describe('getInitialHealth', () => {
  it('norma_easy starts at 65', () => {
    expect(getInitialHealth('norma_easy')).toBe(65);
  });

  it('norma starts at 80', () => {
    expect(getInitialHealth('norma')).toBe(80);
  });

  it('life starts at 100', () => {
    expect(getInitialHealth('life')).toBe(100);
  });

  it('life_hard starts at 100', () => {
    expect(getInitialHealth('life_hard')).toBe(100);
  });

  it('life_ex starts at 100', () => {
    expect(getInitialHealth('life_ex')).toBe(100);
  });

  it('sudden_death starts at 100', () => {
    expect(getInitialHealth('sudden_death')).toBe(100);
  });
});

describe('isTrackCleared', () => {
  it('norma_easy: cleared at health 65', () => {
    expect(isTrackCleared('norma_easy', 65, false)).toBe(true);
  });

  it('norma_easy: not cleared at health 64', () => {
    expect(isTrackCleared('norma_easy', 64, false)).toBe(false);
  });

  it('norma: cleared at health 80', () => {
    expect(isTrackCleared('norma', 80, false)).toBe(true);
  });

  it('norma: not cleared at health 79', () => {
    expect(isTrackCleared('norma', 79, false)).toBe(false);
  });

  it('life: cleared if survived (not dead)', () => {
    expect(isTrackCleared('life', 50, false)).toBe(true);
  });

  it('life: not cleared if died', () => {
    expect(isTrackCleared('life', 0, true)).toBe(false);
  });
});
