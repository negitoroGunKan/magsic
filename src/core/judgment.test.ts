import { describe, it, expect } from 'vitest';
import { evaluateJudgment, JUDGMENT_THRESHOLDS } from './judgment';

describe('evaluateJudgment', () => {
  it('returns perfect for exact hit (0ms)', () => {
    const result = evaluateJudgment(0);
    expect(result).toEqual({ type: 'perfect', absError: 0 });
  });

  // --- PERFECT boundaries (< 40ms) ---
  it('returns perfect at 39ms', () => {
    expect(evaluateJudgment(39)!.type).toBe('perfect');
  });

  it('returns great at exactly 40ms (not perfect)', () => {
    expect(evaluateJudgment(40)!.type).toBe('great');
  });

  // --- GREAT boundaries (40-79ms) ---
  it('returns great at 79ms', () => {
    expect(evaluateJudgment(79)!.type).toBe('great');
  });

  it('returns nice at exactly 80ms (not great)', () => {
    expect(evaluateJudgment(80)!.type).toBe('nice');
  });

  // --- NICE boundaries (80-132ms) ---
  it('returns nice at 132ms', () => {
    expect(evaluateJudgment(132)!.type).toBe('nice');
  });

  it('returns bad at exactly 133ms (not nice)', () => {
    expect(evaluateJudgment(133)!.type).toBe('bad');
  });

  // --- BAD boundaries (133-149ms) ---
  it('returns bad at 149ms', () => {
    expect(evaluateJudgment(149)!.type).toBe('bad');
  });

  it('returns miss at exactly 150ms (not bad)', () => {
    expect(evaluateJudgment(150)!.type).toBe('miss');
  });

  // --- MISS boundaries (150-179ms) ---
  it('returns miss at 179ms', () => {
    expect(evaluateJudgment(179)!.type).toBe('miss');
  });

  it('returns null at exactly 180ms (outside window)', () => {
    expect(evaluateJudgment(180)).toBeNull();
  });

  it('returns null for large positive error', () => {
    expect(evaluateJudgment(500)).toBeNull();
  });

  // --- Negative errors (early hits) ---
  it('handles negative error (early hit) using absolute value', () => {
    expect(evaluateJudgment(-30)!.type).toBe('perfect');
    expect(evaluateJudgment(-50)!.type).toBe('great');
    expect(evaluateJudgment(-100)!.type).toBe('nice');
    expect(evaluateJudgment(-140)!.type).toBe('bad');
    expect(evaluateJudgment(-160)!.type).toBe('miss');
    expect(evaluateJudgment(-200)).toBeNull();
  });

  it('returns correct absError for negative input', () => {
    const result = evaluateJudgment(-50);
    expect(result).toEqual({ type: 'great', absError: 50 });
  });
});

describe('JUDGMENT_THRESHOLDS', () => {
  it('has correct threshold values matching magusic.ts', () => {
    expect(JUDGMENT_THRESHOLDS.perfect).toBe(40);
    expect(JUDGMENT_THRESHOLDS.great).toBe(80);
    expect(JUDGMENT_THRESHOLDS.nice).toBe(133);
    expect(JUDGMENT_THRESHOLDS.bad).toBe(150);
    expect(JUDGMENT_THRESHOLDS.miss).toBe(180);
  });
});
