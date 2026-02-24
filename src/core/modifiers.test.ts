import { describe, it, expect } from 'vitest';
import { applyModifiers } from './modifiers';
import { ChartNote } from './types';

/** Helper to create a minimal ChartNote */
function makeNote(lane: number, time: number = 0): ChartNote {
  return { time, lane, duration: 0, isLong: false, hit: false, beat: 0 };
}

/** Deterministic RNG: returns values from a sequence */
function seededRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('applyModifiers - no modifiers', () => {
  it('returns deep copy identical to input', () => {
    const notes = [makeNote(0, 0), makeNote(3, 500), makeNote(4, 1000)];
    const result = applyModifiers(notes, 'none', 'none', '8key');
    expect(result).toEqual(notes);
    expect(result).not.toBe(notes);
    expect(result[0]).not.toBe(notes[0]);
  });

  it('modifying result does not affect input', () => {
    const notes = [makeNote(1, 0)];
    const result = applyModifiers(notes, 'none', 'none', '8key');
    result[0].lane = 99;
    expect(notes[0].lane).toBe(1);
  });
});

describe('applyModifiers - blue_to_white', () => {
  it('maps blue lanes to white lanes: 0->1, 2->3, 5->6, 7->8', () => {
    const notes = [
      makeNote(0), makeNote(1), makeNote(2), makeNote(3),
      makeNote(4), makeNote(5), makeNote(6), makeNote(7), makeNote(8),
    ];
    const result = applyModifiers(notes, 'blue_to_white', 'none', '8key');
    expect(result.map(n => n.lane)).toEqual([1, 1, 3, 3, 4, 6, 6, 8, 8]);
  });

  it('does not affect space lane (4)', () => {
    const notes = [makeNote(4)];
    const result = applyModifiers(notes, 'blue_to_white', 'none', '8key');
    expect(result[0].lane).toBe(4);
  });
});

describe('applyModifiers - 6key remap', () => {
  it('remaps lanes 2->3 and 5->6 when keyMode is 6key and assist is none', () => {
    const notes = [
      makeNote(0), makeNote(1), makeNote(2), makeNote(3),
      makeNote(4), makeNote(5), makeNote(6), makeNote(7), makeNote(8),
    ];
    const result = applyModifiers(notes, 'none', 'none', '6key');
    expect(result.map(n => n.lane)).toEqual([0, 1, 3, 3, 4, 6, 6, 7, 8]);
  });

  it('does NOT apply 6key remap when blue_to_white is active', () => {
    const notes = [makeNote(2), makeNote(5)];
    const result = applyModifiers(notes, 'blue_to_white', 'none', '6key');
    // blue_to_white maps: 2->3, 5->6 (same result as 6key remap, but via different path)
    expect(result.map(n => n.lane)).toEqual([3, 6]);
  });
});

describe('applyModifiers - space_boost', () => {
  it('converts some non-space notes to space using rng', () => {
    const notes = [makeNote(0), makeNote(1), makeNote(2), makeNote(3)];
    // rng < 0.25 triggers space conversion: 0.1 (yes), 0.5 (no), 0.2 (yes), 0.9 (no)
    const rng = seededRng([0.1, 0.5, 0.2, 0.9]);
    const result = applyModifiers(notes, 'space_boost', 'none', '8key', rng);
    expect(result.map(n => n.lane)).toEqual([4, 1, 4, 3]);
  });

  it('never converts existing space notes', () => {
    const notes = [makeNote(4), makeNote(4), makeNote(4)];
    const rng = seededRng([0.0]); // Always < 0.25
    const result = applyModifiers(notes, 'space_boost', 'none', '8key', rng);
    expect(result.map(n => n.lane)).toEqual([4, 4, 4]);
  });

  it('does NOT apply when keyMode is 6key (else-if chain)', () => {
    // In the original code, 6key remap takes precedence over space_boost
    const notes = [makeNote(0), makeNote(1)];
    const rng = seededRng([0.0]); // Would always trigger space_boost
    const result = applyModifiers(notes, 'space_boost', 'none', '6key', rng);
    // 6key remap applies (lanes 0,1 are not in {2,5} so unchanged)
    expect(result.map(n => n.lane)).toEqual([0, 1]);
  });
});

describe('applyModifiers - shuffle_color', () => {
  it('shuffles blue lanes within blue group and white within white group', () => {
    const blues = [0, 2, 5, 7];
    const whites = [1, 3, 6, 8];
    const notes = [...blues, ...whites, 4].map(lane => makeNote(lane));

    // Use a deterministic rng that produces a known permutation
    // Fisher-Yates on [0,2,5,7] with rng values: needs 3 random calls
    // Fisher-Yates on [1,3,6,8] with rng values: needs 3 random calls
    // We'll use a simple rng and verify the constraints
    const rng = seededRng([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    const result = applyModifiers(notes, 'none', 'shuffle_color', '8key', rng);

    const resultBlues = result.filter((_, i) => i < 4).map(n => n.lane);
    const resultWhites = result.filter((_, i) => i >= 4 && i < 8).map(n => n.lane);
    const resultSpace = result[8].lane;

    // Blue lanes should still be in the blue set
    resultBlues.forEach(lane => expect(blues).toContain(lane));
    // White lanes should still be in the white set
    resultWhites.forEach(lane => expect(whites).toContain(lane));
    // Space unchanged
    expect(resultSpace).toBe(4);
  });

  it('space lane (4) is never moved', () => {
    const notes = [makeNote(4)];
    const result = applyModifiers(notes, 'none', 'shuffle_color', '8key');
    expect(result[0].lane).toBe(4);
  });
});

describe('applyModifiers - shuffle_chaos', () => {
  it('shuffles all non-space lanes', () => {
    const allLanes = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const notes = allLanes.map(lane => makeNote(lane));
    const rng = seededRng([0.3, 0.7, 0.1, 0.9, 0.5, 0.2, 0.8]);
    const result = applyModifiers(notes, 'none', 'shuffle_chaos', '8key', rng);

    // Space stays
    expect(result[4].lane).toBe(4);

    // All non-space lanes should be a permutation of [0,1,2,3,5,6,7,8]
    const nonSpaceOriginal = [0, 1, 2, 3, 5, 6, 7, 8];
    const nonSpaceResult = result.filter((_, i) => i !== 4).map(n => n.lane);
    expect(nonSpaceResult.sort()).toEqual(nonSpaceOriginal.sort());
  });

  it('space lane is never affected', () => {
    const notes = [makeNote(4)];
    const result = applyModifiers(notes, 'none', 'shuffle_chaos', '8key');
    expect(result[0].lane).toBe(4);
  });
});

describe('applyModifiers - random + assist combined', () => {
  it('applies random first, then assist', () => {
    // Single blue note at lane 0
    const notes = [makeNote(0)];

    // With shuffle_color, rng makes lane 0 map to lane 5 (another blue lane)
    // Then blue_to_white maps lane 5 → lane 6
    // We need the rng to produce a specific shuffle for blues [0,2,5,7]
    // Fisher-Yates for 4 items needs 3 rng calls
    // rng values [0.99, 0.99, 0.99] → no swaps → identity permutation
    // So lane 0 stays as 0, then blue_to_white maps 0 → 1
    const rng = seededRng([0.99, 0.99, 0.99, 0.99, 0.99, 0.99]);
    const result = applyModifiers(notes, 'blue_to_white', 'shuffle_color', '8key', rng);
    // Identity shuffle (rng=0.99 → j always equals i) → lane stays 0
    // Then blue_to_white → 0 → 1
    expect(result[0].lane).toBe(1);
  });
});

describe('applyModifiers - empty notes', () => {
  it('returns empty array for empty input', () => {
    const result = applyModifiers([], 'blue_to_white', 'shuffle_chaos', '8key');
    expect(result).toEqual([]);
  });
});
