// Score calculation and rank determination
// Extracted from magusic.ts L1176 (SCORE_WEIGHTS), L1198-1201 (maxScore), L2449-2476 (score/rank)
/** Weight of each judgment type for scoring. Max per note = 9. */
export const SCORE_WEIGHTS = {
    perfect: 9,
    great: 8,
    nice: 2,
    bad: 1,
    miss: 0,
};
/**
 * Calculate the max possible score for a chart.
 * Regular notes = 9 pts, Long notes (duration > 0) = 18 pts (head 9 + tail 9).
 * Returns 1 for empty arrays to avoid division by zero (matches original behavior).
 */
export function calculateMaxScore(notes) {
    if (notes.length === 0)
        return 1;
    return notes.reduce((acc, n) => acc + (n.duration > 0 ? 18 : 9), 0);
}
/**
 * Calculate the score loss for a single judgment.
 * Loss = maxWeightPerNote(9) - actualWeight
 */
export function calculateLoss(judgmentType) {
    return 9 - SCORE_WEIGHTS[judgmentType];
}
/**
 * Calculate final score (0-1,000,000) and rank.
 *
 * @param totalMaxScore - Max possible score from calculateMaxScore
 * @param lostScore - Cumulative lost points (sum of calculateLoss for each hit)
 * @param isClear - Whether the player cleared the track (not failed)
 */
export function calculateScore(totalMaxScore, lostScore, isClear) {
    const ratio = totalMaxScore > 0
        ? (totalMaxScore - lostScore) / totalMaxScore
        : 0;
    const scaledScore = Math.floor(ratio * 1000000);
    let rank;
    if (!isClear) {
        rank = 'F';
    }
    else if (ratio >= 0.95) {
        rank = 'S';
    }
    else if (ratio >= 0.9) {
        rank = 'A';
    }
    else if (ratio >= 0.8) {
        rank = 'B';
    }
    else if (ratio >= 0.7) {
        rank = 'C';
    }
    else {
        rank = 'D';
    }
    return { scaledScore, ratio, rank };
}
