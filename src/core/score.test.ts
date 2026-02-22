import { describe, it, expect } from 'vitest';
import { SCORE_WEIGHTS, calculateMaxScore, calculateLoss, calculateScore } from './score';

describe('SCORE_WEIGHTS', () => {
  it('has correct values matching magusic.ts', () => {
    expect(SCORE_WEIGHTS.perfect).toBe(9);
    expect(SCORE_WEIGHTS.great).toBe(8);
    expect(SCORE_WEIGHTS.nice).toBe(2);
    expect(SCORE_WEIGHTS.bad).toBe(1);
    expect(SCORE_WEIGHTS.miss).toBe(0);
  });
});

describe('calculateMaxScore', () => {
  it('returns 1 for empty notes (avoid division by zero)', () => {
    expect(calculateMaxScore([])).toBe(1);
  });

  it('counts regular notes as 9 points each', () => {
    const notes = [
      { duration: 0 },
      { duration: 0 },
      { duration: 0 },
    ];
    expect(calculateMaxScore(notes)).toBe(27); // 3 * 9
  });

  it('counts long notes as 18 points each', () => {
    const notes = [
      { duration: 500 },
      { duration: 1000 },
    ];
    expect(calculateMaxScore(notes)).toBe(36); // 2 * 18
  });

  it('handles mix of regular and long notes', () => {
    const notes = [
      { duration: 0 },     // 9
      { duration: 500 },   // 18
      { duration: 0 },     // 9
      { duration: 1000 },  // 18
    ];
    expect(calculateMaxScore(notes)).toBe(54); // 9 + 18 + 9 + 18
  });
});

describe('calculateLoss', () => {
  it('perfect has 0 loss', () => {
    expect(calculateLoss('perfect')).toBe(0);
  });

  it('great has 1 loss', () => {
    expect(calculateLoss('great')).toBe(1);
  });

  it('nice has 7 loss', () => {
    expect(calculateLoss('nice')).toBe(7);
  });

  it('bad has 8 loss', () => {
    expect(calculateLoss('bad')).toBe(8);
  });

  it('miss has 9 loss', () => {
    expect(calculateLoss('miss')).toBe(9);
  });
});

describe('calculateScore', () => {
  it('returns perfect score for zero loss', () => {
    const result = calculateScore(900, 0, true);
    expect(result.scaledScore).toBe(1000000);
    expect(result.ratio).toBe(1.0);
    expect(result.rank).toBe('S');
  });

  it('returns 0 for total loss', () => {
    const result = calculateScore(900, 900, true);
    expect(result.scaledScore).toBe(0);
    expect(result.ratio).toBe(0);
    expect(result.rank).toBe('D');
  });

  // --- Rank boundary tests ---
  it('S rank at ratio 0.95', () => {
    // totalMaxScore=1000, lostScore=50 → ratio=0.95
    const result = calculateScore(1000, 50, true);
    expect(result.rank).toBe('S');
  });

  it('A rank at ratio just below 0.95', () => {
    // totalMaxScore=10000, lostScore=501 → ratio=0.9499
    const result = calculateScore(10000, 501, true);
    expect(result.ratio).toBeLessThan(0.95);
    expect(result.rank).toBe('A');
  });

  it('A rank at ratio 0.90', () => {
    const result = calculateScore(1000, 100, true);
    expect(result.rank).toBe('A');
  });

  it('B rank at ratio just below 0.90', () => {
    const result = calculateScore(10000, 1001, true);
    expect(result.ratio).toBeLessThan(0.9);
    expect(result.rank).toBe('B');
  });

  it('B rank at ratio 0.80', () => {
    const result = calculateScore(1000, 200, true);
    expect(result.rank).toBe('B');
  });

  it('C rank at ratio just below 0.80', () => {
    const result = calculateScore(10000, 2001, true);
    expect(result.ratio).toBeLessThan(0.8);
    expect(result.rank).toBe('C');
  });

  it('C rank at ratio 0.70', () => {
    const result = calculateScore(1000, 300, true);
    expect(result.rank).toBe('C');
  });

  it('D rank at ratio just below 0.70', () => {
    const result = calculateScore(10000, 3001, true);
    expect(result.ratio).toBeLessThan(0.7);
    expect(result.rank).toBe('D');
  });

  // --- Failed track ---
  it('returns F rank when isClear is false regardless of ratio', () => {
    const result = calculateScore(900, 0, false);
    expect(result.scaledScore).toBe(1000000);
    expect(result.rank).toBe('F');
  });

  it('returns F rank for failed track even with low score', () => {
    const result = calculateScore(900, 800, false);
    expect(result.rank).toBe('F');
  });

  // --- Edge case ---
  it('returns 0 ratio when totalMaxScore is 0', () => {
    const result = calculateScore(0, 0, true);
    expect(result.ratio).toBe(0);
    expect(result.scaledScore).toBe(0);
  });

  it('floors the scaled score (no rounding up)', () => {
    // ratio = 999/1000 = 0.999 → scaledScore = floor(999000) = 999000
    const result = calculateScore(1000, 1, true);
    expect(result.scaledScore).toBe(999000);
  });
});
