// Score calculation and rank determination
// Extracted from magusic.ts L1176 (SCORE_WEIGHTS), L1198-1201 (maxScore), L2449-2476 (score/rank)

import { JudgmentType } from './types';

/** Weight of each judgment type for scoring. Max per note = 10. */
export const SCORE_WEIGHTS: Record<JudgmentType, number> = {
  critical: 10,
  great: 6,
  good: 2,
  fail: 1,
  miss: 0,
};

export type Rank = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface ScoreResult {
  scaledScore: number;  // 0 to 1,000,000
  ratio: number;        // 0.0 to 1.0
  rank: Rank;
}

/**
 * Calculate the max possible score for a chart.
 * All notes = 10 pts.
 * Returns 1 for empty arrays to avoid division by zero (matches original behavior).
 */
export function calculateMaxScore(notes: { duration: number }[]): number {
  if (notes.length === 0) return 1;
  return notes.length * 10;
}

/**
 * Calculate the score loss for a single judgment.
 * Loss = maxWeightPerNote(10) - actualWeight
 */
export function calculateLoss(judgmentType: JudgmentType): number {
  return 10 - SCORE_WEIGHTS[judgmentType];
}

/**
 * Calculate final score (0-1,000,000) and rank.
 *
 * @param totalMaxScore - Max possible score from calculateMaxScore
 * @param lostScore - Cumulative lost points (sum of calculateLoss for each hit)
 * @param isClear - Whether the player cleared the track (not failed)
 */
export function calculateScore(
  totalMaxScore: number,
  lostScore: number,
  isClear: boolean,
): ScoreResult {
  const ratio = totalMaxScore > 0
    ? (totalMaxScore - lostScore) / totalMaxScore
    : 0;
  const scaledScore = Math.floor(ratio * 1000000);

  let rank: Rank;
  if (!isClear) {
    rank = 'F';
  } else if (ratio >= 0.95) {
    rank = 'S';
  } else if (ratio >= 0.9) {
    rank = 'A';
  } else if (ratio >= 0.8) {
    rank = 'B';
  } else if (ratio >= 0.7) {
    rank = 'C';
  } else {
    rank = 'D';
  }

  return { scaledScore, ratio, rank };
}
