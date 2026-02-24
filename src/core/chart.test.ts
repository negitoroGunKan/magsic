import { describe, it, expect } from 'vitest';
import { parseChart } from './chart';

describe('parseChart', () => {
  it('parses a simple single-BPM chart', () => {
    const json = {
      bpm: 120,
      offset: 0,
      notes: [
        { beat: 0, lane: 1 },
        { beat: 1, lane: 3 },
        { beat: 2, lane: 6 },
      ],
    };
    const result = parseChart(json);

    // BPM 120 = 500ms/beat
    expect(result.notes).toHaveLength(3);
    expect(result.notes[0].time).toBe(0);
    expect(result.notes[0].lane).toBe(1);
    expect(result.notes[1].time).toBe(500);
    expect(result.notes[2].time).toBe(1000);
  });

  it('applies offset to all timings', () => {
    const json = {
      bpm: 120,
      offset: 100,
      notes: [
        { beat: 0, lane: 1 },
        { beat: 1, lane: 3 },
      ],
    };
    const result = parseChart(json);

    expect(result.notes[0].time).toBe(100);
    expect(result.notes[1].time).toBe(600);
    expect(result.bpmChanges[0].time).toBe(100);
  });

  it('calculates long note duration correctly', () => {
    const json = {
      bpm: 120,
      offset: 0,
      notes: [
        { beat: 0, lane: 1, duration: 2 }, // 2 beats = 1000ms at 120 BPM
      ],
    };
    const result = parseChart(json);

    expect(result.notes[0].duration).toBe(1000);
    expect(result.notes[0].isLong).toBe(true);
  });

  it('marks non-long notes with duration 0 and isLong false', () => {
    const json = {
      bpm: 120,
      offset: 0,
      notes: [{ beat: 0, lane: 1 }],
    };
    const result = parseChart(json);

    expect(result.notes[0].duration).toBe(0);
    expect(result.notes[0].isLong).toBe(false);
  });

  it('handles bpmChanges format', () => {
    const json = {
      bpm: 120,
      offset: 0,
      bpmChanges: [
        { beat: 0, bpm: 120 },
        { beat: 4, bpm: 240 },
      ],
      notes: [
        { beat: 0, lane: 1 },
        { beat: 4, lane: 3 },   // At change point: 2000ms
        { beat: 5, lane: 6 },   // 240 BPM = 250ms/beat → 2000 + 250 = 2250ms
      ],
    };
    const result = parseChart(json);

    expect(result.bpmChanges).toHaveLength(2);
    expect(result.bpmChanges[0]).toEqual({ beat: 0, bpm: 120, time: 0 });
    expect(result.bpmChanges[1]).toEqual({ beat: 4, bpm: 240, time: 2000 });

    expect(result.notes[0].time).toBe(0);
    expect(result.notes[1].time).toBe(2000);
    expect(result.notes[2].time).toBe(2250);
  });

  it('prepends beat-0 BPM change if first change starts later', () => {
    const json = {
      bpm: 100,
      offset: 0,
      bpmChanges: [
        { beat: 4, bpm: 200 },
      ],
      notes: [
        { beat: 0, lane: 1 },
        { beat: 2, lane: 3 },
      ],
    };
    const result = parseChart(json);

    // Should prepend { beat: 0, bpm: 100, time: 0 }
    expect(result.bpmChanges[0]).toEqual({ beat: 0, bpm: 100, time: 0 });
    expect(result.bpmChanges).toHaveLength(2);

    // BPM 100 = 600ms/beat
    expect(result.notes[0].time).toBe(0);
    expect(result.notes[1].time).toBe(1200);
  });

  it('handles legacy format (no bpmChanges field, just bpm)', () => {
    const json = {
      bpm: 150,
      offset: 0,
      notes: [
        { beat: 0, lane: 1 },
        { beat: 1, lane: 3 },
      ],
    };
    const result = parseChart(json);

    // 150 BPM = 400ms/beat
    expect(result.bpmChanges).toHaveLength(1);
    expect(result.bpmChanges[0]).toEqual({ beat: 0, bpm: 150, time: 0 });
    expect(result.notes[0].time).toBe(0);
    expect(result.notes[1].time).toBe(400);
  });

  it('defaults to BPM 120 when no bpm field', () => {
    const json = {
      offset: 0,
      notes: [{ beat: 1, lane: 1 }],
    };
    const result = parseChart(json);

    expect(result.bpmChanges[0].bpm).toBe(120);
    expect(result.notes[0].time).toBe(500);
  });

  it('sorts notes by time', () => {
    const json = {
      bpm: 120,
      offset: 0,
      notes: [
        { beat: 3, lane: 8 },
        { beat: 1, lane: 3 },
        { beat: 0, lane: 1 },
      ],
    };
    const result = parseChart(json);

    expect(result.notes[0].time).toBe(0);
    expect(result.notes[1].time).toBe(500);
    expect(result.notes[2].time).toBe(1500);
    expect(result.notes[0].lane).toBe(1);
    expect(result.notes[1].lane).toBe(3);
    expect(result.notes[2].lane).toBe(8);
  });

  it('handles empty notes array', () => {
    const json = {
      bpm: 120,
      offset: 0,
      notes: [],
    };
    const result = parseChart(json);

    expect(result.notes).toHaveLength(0);
    expect(result.bpmChanges).toHaveLength(1);
  });

  it('parses layout changes', () => {
    const json = {
      bpm: 120,
      offset: 0,
      notes: [],
      layoutChanges: [
        { beat: 8, type: 'type-b' },
        { beat: 4, type: 'type-a' },
      ],
    };
    const result = parseChart(json);

    expect(result.layoutChanges).toHaveLength(2);
    // Should be sorted by time
    expect(result.layoutChanges[0]).toEqual({ time: 2000, type: 'type-a' });
    expect(result.layoutChanges[1]).toEqual({ time: 4000, type: 'type-b' });
  });

  it('handles missing layoutChanges field', () => {
    const json = {
      bpm: 120,
      offset: 0,
      notes: [],
    };
    const result = parseChart(json);

    expect(result.layoutChanges).toHaveLength(0);
  });

  it('preserves beat values on notes', () => {
    const json = {
      bpm: 120,
      offset: 0,
      notes: [
        { beat: 1.5, lane: 1 },
        { beat: 3.25, lane: 3 },
      ],
    };
    const result = parseChart(json);

    expect(result.notes[0].beat).toBe(1.5);
    expect(result.notes[1].beat).toBe(3.25);
  });

  it('initializes hit to false for all notes', () => {
    const json = {
      bpm: 120,
      offset: 0,
      notes: [
        { beat: 0, lane: 1 },
        { beat: 1, lane: 3 },
      ],
    };
    const result = parseChart(json);

    expect(result.notes[0].hit).toBe(false);
    expect(result.notes[1].hit).toBe(false);
  });

  it('handles long note duration across BPM change', () => {
    const json = {
      bpm: 120,
      offset: 0,
      bpmChanges: [
        { beat: 0, bpm: 120 },   // 500ms/beat
        { beat: 4, bpm: 240 },   // 250ms/beat
      ],
      notes: [
        // Long note starts at beat 3 (1500ms), duration 2 beats
        // Beat 3 → 1500ms (at 120 BPM)
        // Beat 5 → 2000 + (5-4)*250 = 2250ms (at 240 BPM)
        // Duration = 2250 - 1500 = 750ms
        { beat: 3, lane: 1, duration: 2 },
      ],
    };
    const result = parseChart(json);

    expect(result.notes[0].time).toBe(1500);
    expect(result.notes[0].duration).toBe(750);
    expect(result.notes[0].isLong).toBe(true);
  });
});
