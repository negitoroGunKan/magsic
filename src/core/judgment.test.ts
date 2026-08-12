import { describe, it, expect } from 'vitest';
import { evaluateJudgment, JUDGMENT_THRESHOLDS } from './judgment';

describe('evaluateJudgment', () => {
  it('returns critical for exact hit (0ms)', () => {
    const result = evaluateJudgment(0);
    expect(result).toEqual({ type: 'critical', absError: 0 });
  });

  // --- PERFECT boundaries (< 40ms) ---
  it('returns critical at 39ms', () => {
    expect(evaluateJudgment(39)!.type).toBe('critical');
  });

  it('returns great at exactly 40ms (not critical)', () => {
    expect(evaluateJudgment(40)!.type).toBe('great');
  });

  // --- GREAT boundaries (40-79ms) ---
  it('returns great at 79ms', () => {
    expect(evaluateJudgment(79)!.type).toBe('great');
  });

  it('returns good at exactly 80ms (not great)', () => {
    expect(evaluateJudgment(80)!.type).toBe('good');
  });

  // --- GOOD boundaries (80-132ms) ---
  it('returns good at 132ms', () => {
    expect(evaluateJudgment(132)!.type).toBe('good');
  });

  it('returns fail at exactly 133ms (not good)', () => {
    expect(evaluateJudgment(133)!.type).toBe('fail');
  });

  // --- FAIL boundaries (133-149ms) ---
  it('returns fail at 149ms', () => {
    expect(evaluateJudgment(149)!.type).toBe('fail');
  });

  it('returns miss at exactly 150ms (not fail)', () => {
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
    expect(evaluateJudgment(-30)!.type).toBe('critical');
    expect(evaluateJudgment(-50)!.type).toBe('great');
    expect(evaluateJudgment(-100)!.type).toBe('good');
    expect(evaluateJudgment(-140)!.type).toBe('fail');
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
    expect(JUDGMENT_THRESHOLDS.critical).toBe(40);
    expect(JUDGMENT_THRESHOLDS.great).toBe(80);
    expect(JUDGMENT_THRESHOLDS.good).toBe(133);
    expect(JUDGMENT_THRESHOLDS.fail).toBe(150);
    expect(JUDGMENT_THRESHOLDS.miss).toBe(180);
  });
});
