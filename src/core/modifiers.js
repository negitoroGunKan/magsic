// Chart note modifier logic
// Extracted from magusic.ts L3464-3560
/**
 * Fisher-Yates shuffle with injectable RNG.
 */
function fisherYatesShuffle(arr, rng) {
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
export function applyModifiers(notes, assist, random, keyMode, rng = Math.random) {
    const modified = JSON.parse(JSON.stringify(notes));
    // 1. Random (Lane Shuffle)
    const laneMap = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const ACTIVE_LANES = {
        '4key': [1, 3, 6, 8],
        '6key': [9, 1, 3, 6, 8, 10],
        '8key': [0, 1, 2, 3, 5, 6, 7, 8],
        '12key': [0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12]
    };
    const currentActiveLanes = ACTIVE_LANES[keyMode] || ACTIVE_LANES['8key'];
    if (random === 'shuffle_color') {
        // Shuffle Blues and Whites independently, but ONLY among active lanes
        const allBlues = [0, 2, 5, 7, 11, 12];
        const allWhites = [1, 3, 6, 8, 9, 10];
        const activeBlues = allBlues.filter(lane => currentActiveLanes.includes(lane));
        const activeWhites = allWhites.filter(lane => currentActiveLanes.includes(lane));
        const newBlues = fisherYatesShuffle([...activeBlues], rng);
        const newWhites = fisherYatesShuffle([...activeWhites], rng);
        activeBlues.forEach((original, i) => { laneMap[original] = newBlues[i]; });
        activeWhites.forEach((original, i) => { laneMap[original] = newWhites[i]; });
    }
    else if (random === 'shuffle_chaos') {
        // Shuffle all active (non-space) lanes together
        const newLanes = fisherYatesShuffle([...currentActiveLanes], rng);
        currentActiveLanes.forEach((original, i) => { laneMap[original] = newLanes[i]; });
    }
    else if (random === 'mirror') {
        // Reverse all active (non-space) lanes
        const reversedLanes = [...currentActiveLanes].reverse();
        currentActiveLanes.forEach((original, i) => { laneMap[original] = reversedLanes[i]; });
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
        const map = { 0: 1, 2: 3, 5: 6, 7: 8 };
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
    }
    else if (keyMode === '6key') {
        // Remap 8key inner lanes to 6key: 2(r)->3(f), 5(u)->6(j)
        const map = { 2: 3, 5: 6 };
        modified.forEach(n => {
            if (map[n.lane] !== undefined) {
                n.lane = map[n.lane];
            }
        });
    }
    else if (assist === 'space_boost') {
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
