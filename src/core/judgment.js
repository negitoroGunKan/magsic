// Judgment evaluation logic
// Extracted from magusic.ts L1081-1085 (thresholds), L3895-3943 (evaluation)
/** Timing thresholds in milliseconds (absolute error) */
export const JUDGMENT_THRESHOLDS = {
    perfect: 40,
    great: 80,
    nice: 133,
    bad: 150,
    miss: 180,
};
/**
 * Evaluate a timing error into a judgment type.
 *
 * The caller is responsible for subtracting globalOffset before calling this.
 * i.e., msError = (currentTime - noteScheduledTime) - globalOffset
 *
 * @param msError - Signed timing error in ms (positive = late, negative = early)
 * @returns JudgmentResult if within the miss window, or null if outside
 */
export function evaluateJudgment(msError) {
    const absError = Math.abs(msError);
    if (absError >= JUDGMENT_THRESHOLDS.miss)
        return null;
    let type;
    if (absError < JUDGMENT_THRESHOLDS.perfect) {
        type = 'perfect';
    }
    else if (absError < JUDGMENT_THRESHOLDS.great) {
        type = 'great';
    }
    else if (absError < JUDGMENT_THRESHOLDS.nice) {
        type = 'nice';
    }
    else if (absError < JUDGMENT_THRESHOLDS.bad) {
        type = 'bad';
    }
    else {
        type = 'miss';
    }
    return { type, absError };
}
