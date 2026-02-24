// Chart note modifier logic
// Extracted from magusic.ts L3464-3560

import { ChartNote, KeyMode } from './types';

export type RandomMode = 'none' | 'shuffle_color' | 'shuffle_chaos';
export type AssistMode = 'none' | 'blue_to_white' | 'space_boost' | 'auto_space';

/**
 * Fisher-Yates shuffle with injectable RNG.
 */
function fisherYatesShuffle(arr: number[], rng: () => number): number[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Apply random and assist modifiers to chart notes.
 * Returns a deep copy; original array is not mutated.
 *
 * Control flow matches the original exactly:
 * - Random is applied first (shuffle lanes)
 * - Then assist: blue_to_white, OR 6key remap (if not blue_to_white), OR space_boost
 *   (these are mutually exclusive via else-if chain in original)
 *
 * @param notes - Original chart notes
 * @param assist - Assist modifier
 * @param random - Random modifier
 * @param keyMode - Current key mode (affects 6key remap)
 * @param rng - Optional random function for deterministic testing (default: Math.random)
 */
export function applyModifiers(
  notes: ChartNote[],
  assist: AssistMode,
  random: RandomMode,
  keyMode: KeyMode,
  rng: () => number = Math.random,
): ChartNote[] {
  const modified: ChartNote[] = JSON.parse(JSON.stringify(notes));

  // 1. Random (Lane Shuffle)
  const laneMap = [0, 1, 2, 3, 4, 5, 6, 7, 8];

  if (random === 'shuffle_color') {
    // Shuffle Blues [0, 2, 5, 7] and Whites [1, 3, 6, 8] independently
    const blues = [0, 2, 5, 7];
    const whites = [1, 3, 6, 8];
    const newBlues = fisherYatesShuffle([...blues], rng);
    const newWhites = fisherYatesShuffle([...whites], rng);
    blues.forEach((original, i) => { laneMap[original] = newBlues[i]; });
    whites.forEach((original, i) => { laneMap[original] = newWhites[i]; });
  } else if (random === 'shuffle_chaos') {
    // Shuffle all except Space (4)
    const lanes = [0, 1, 2, 3, 5, 6, 7, 8];
    const newLanes = fisherYatesShuffle([...lanes], rng);
    lanes.forEach((original, i) => { laneMap[original] = newLanes[i]; });
  }

  // Apply Shuffle
  if (random !== 'none') {
    modified.forEach(n => {
      if (n.lane !== 4) {
        n.lane = laneMap[n.lane];
      }
    });
  }

  // 2. Assist (mutually exclusive via else-if, matching original L3521-3557)
  if (assist === 'blue_to_white') {
    const map: Record<number, number> = { 0: 1, 2: 3, 5: 6, 7: 8 };
    modified.forEach(n => {
      if (map[n.lane] !== undefined) {
        n.lane = map[n.lane];
      }
      // Original has this check duplicated (L3529-3531), but it's a no-op
      // because after first mapping, the lane is already a white lane (1,3,6,8)
      // which won't be in the map. Preserved for behavioral parity.
      if (map[n.lane] !== undefined) {
        n.lane = map[n.lane];
      }
    });
  } else if (keyMode === '6key') {
    // Remap 8key inner lanes to 6key: 2(r)->3(f), 5(u)->6(j)
    const map: Record<number, number> = { 2: 3, 5: 6 };
    modified.forEach(n => {
      if (map[n.lane] !== undefined) {
        n.lane = map[n.lane];
      }
    });
  } else if (assist === 'space_boost') {
    // Convert ~25% of non-space notes to space
    modified.forEach(n => {
      if (n.lane !== 4) {
        if (rng() < 0.25) {
          n.lane = 4;
        }
      }
    });
  }

  return modified;
}
