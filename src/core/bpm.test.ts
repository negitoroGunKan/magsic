import { describe, it, expect } from 'vitest';
import { getTimeFromBeat, getBeatFromTime } from './bpm';
import { BPMChange } from './types';

describe('getTimeFromBeat', () => {
  it('returns 0 for empty bpmChanges', () => {
    expect(getTimeFromBeat(4, [])).toBe(0);
  });

  it('converts beats with single BPM (120)', () => {
    const changes: BPMChange[] = [{ beat: 0, bpm: 120, time: 0 }];
    // 120 BPM = 500ms per beat
    expect(getTimeFromBeat(0, changes)).toBe(0);
    expect(getTimeFromBeat(1, changes)).toBe(500);
    expect(getTimeFromBeat(4, changes)).toBe(2000);
    expect(getTimeFromBeat(0.5, changes)).toBe(250);
  });

  it('handles offset (time starts at non-zero)', () => {
    const changes: BPMChange[] = [{ beat: 0, bpm: 120, time: 100 }];
    expect(getTimeFromBeat(0, changes)).toBe(100);
    expect(getTimeFromBeat(1, changes)).toBe(600);
    expect(getTimeFromBeat(4, changes)).toBe(2100);
  });

  it('handles BPM change at beat 4', () => {
    const changes: BPMChange[] = [
      { beat: 0, bpm: 120, time: 0 },    // 500ms/beat
      { beat: 4, bpm: 240, time: 2000 },  // 250ms/beat
    ];
    // Before change
    expect(getTimeFromBeat(0, changes)).toBe(0);
    expect(getTimeFromBeat(2, changes)).toBe(1000);
    // At change point
    expect(getTimeFromBeat(4, changes)).toBe(2000);
    // After change (240 BPM = 250ms/beat)
    expect(getTimeFromBeat(5, changes)).toBe(2250);
    expect(getTimeFromBeat(8, changes)).toBe(3000);
  });

  it('handles multiple BPM changes', () => {
    const changes: BPMChange[] = [
      { beat: 0, bpm: 120, time: 0 },     // 500ms/beat, covers beats 0-4
      { beat: 4, bpm: 60, time: 2000 },    // 1000ms/beat, covers beats 4-8
      { beat: 8, bpm: 240, time: 6000 },   // 250ms/beat, covers beats 8+
    ];
    expect(getTimeFromBeat(2, changes)).toBe(1000);   // In first segment
    expect(getTimeFromBeat(6, changes)).toBe(4000);   // In second segment: 2000 + 2*1000
    expect(getTimeFromBeat(10, changes)).toBe(6500);  // In third segment: 6000 + 2*250
  });

  it('handles fractional beats', () => {
    const changes: BPMChange[] = [{ beat: 0, bpm: 120, time: 0 }];
    expect(getTimeFromBeat(0.25, changes)).toBe(125);
    expect(getTimeFromBeat(1.5, changes)).toBe(750);
  });
});

describe('getBeatFromTime', () => {
  it('returns 0 for empty bpmChanges', () => {
    expect(getBeatFromTime(2000, [])).toBe(0);
  });

  it('converts time with single BPM (120)', () => {
    const changes: BPMChange[] = [{ beat: 0, bpm: 120, time: 0 }];
    expect(getBeatFromTime(0, changes)).toBe(0);
    expect(getBeatFromTime(500, changes)).toBe(1);
    expect(getBeatFromTime(2000, changes)).toBe(4);
    expect(getBeatFromTime(250, changes)).toBe(0.5);
  });

  it('handles offset (time starts at non-zero)', () => {
    const changes: BPMChange[] = [{ beat: 0, bpm: 120, time: 100 }];
    expect(getBeatFromTime(100, changes)).toBe(0);
    expect(getBeatFromTime(600, changes)).toBe(1);
    expect(getBeatFromTime(2100, changes)).toBe(4);
  });

  it('handles BPM change', () => {
    const changes: BPMChange[] = [
      { beat: 0, bpm: 120, time: 0 },
      { beat: 4, bpm: 240, time: 2000 },
    ];
    expect(getBeatFromTime(0, changes)).toBe(0);
    expect(getBeatFromTime(1000, changes)).toBe(2);
    expect(getBeatFromTime(2000, changes)).toBe(4);
    expect(getBeatFromTime(2250, changes)).toBe(5);
    expect(getBeatFromTime(3000, changes)).toBe(8);
  });
});

describe('round-trip consistency', () => {
  it('getTimeFromBeat -> getBeatFromTime returns original beat', () => {
    const changes: BPMChange[] = [
      { beat: 0, bpm: 120, time: 0 },
      { beat: 4, bpm: 180, time: 2000 },
    ];
    const testBeats = [0, 1, 2, 3, 3.5, 4, 5, 6, 7.25, 10];
    for (const beat of testBeats) {
      const time = getTimeFromBeat(beat, changes);
      const roundTrip = getBeatFromTime(time, changes);
      expect(roundTrip).toBeCloseTo(beat, 10);
    }
  });

  it('getBeatFromTime -> getTimeFromBeat returns original time', () => {
    const changes: BPMChange[] = [
      { beat: 0, bpm: 120, time: 0 },
      { beat: 4, bpm: 180, time: 2000 },
    ];
    const testTimes = [0, 250, 500, 1000, 2000, 2333.33, 3000, 5000];
    for (const time of testTimes) {
      const beat = getBeatFromTime(time, changes);
      const roundTrip = getTimeFromBeat(beat, changes);
      expect(roundTrip).toBeCloseTo(time, 5);
    }
  });
});
