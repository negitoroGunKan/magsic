// Judgment evaluation logic
// Extracted from magusic.ts L1081-1085 (thresholds), L3895-3943 (evaluation)

import { JudgmentType } from './types';

/** Timing thresholds in milliseconds (absolute error) */
export const JUDGMENT_THRESHOLDS = {
  critical: 40,
  great: 80,
  good: 133,
  fail: 150,
  miss: 180,
} as const;

export interface JudgmentResult {
  type: JudgmentType;
  absError: number;
}

/**
 * Evaluate a timing error into a judgment type.
 *
 * The caller is responsible for subtracting globalOffset before calling this.
 * i.e., msError = (currentTime - noteScheduledTime) - globalOffset
 *
 * @param msError - Signed timing error in ms (positive = late, negative = early)
 * @returns JudgmentResult if within the miss window, or null if outside
 */
export function evaluateJudgment(msError: number): JudgmentResult | null {
  const absError = Math.abs(msError);

  if (absError >= JUDGMENT_THRESHOLDS.miss) return null;

  let type: JudgmentType;
  if (absError < JUDGMENT_THRESHOLDS.critical) {
    type = 'critical';
  } else if (absError < JUDGMENT_THRESHOLDS.great) {
    type = 'great';
  } else if (absError < JUDGMENT_THRESHOLDS.good) {
    type = 'good';
  } else if (absError < JUDGMENT_THRESHOLDS.fail) {
    type = 'fail';
  } else {
    type = 'miss';
  }

  return { type, absError };
}
