// BPM <-> Time conversion functions
// Extracted from magusic.ts L1128-1154

import { BPMChange } from './types';

/**
 * Convert a beat number to time in milliseconds.
 * Uses the BPM change timeline to calculate the correct time.
 *
 * @param beat - Beat number to convert
 * @param bpmChanges - Sorted array of BPM changes (by beat)
 * @returns Time in milliseconds
 */
export function getTimeFromBeat(beat: number, bpmChanges: BPMChange[]): number {
  if (bpmChanges.length === 0) return 0;
  let lastBp = bpmChanges[0];
  for (let i = 1; i < bpmChanges.length; i++) {
    if (bpmChanges[i].beat <= beat) {
      lastBp = bpmChanges[i];
    } else {
      break;
    }
  }
  const msPerBeat = 60000 / lastBp.bpm;
  return lastBp.time + (beat - lastBp.beat) * msPerBeat;
}

/**
 * Convert time in milliseconds to a beat number.
 * Inverse of getTimeFromBeat.
 *
 * @param time - Time in milliseconds
 * @param bpmChanges - Sorted array of BPM changes (by beat, with pre-calculated times)
 * @returns Beat number
 */
export function getBeatFromTime(time: number, bpmChanges: BPMChange[]): number {
  if (bpmChanges.length === 0) return 0;
  let lastBp = bpmChanges[0];
  for (let i = 1; i < bpmChanges.length; i++) {
    if (bpmChanges[i].time <= time) {
      lastBp = bpmChanges[i];
    } else {
      break;
    }
  }
  const msPerBeat = 60000 / lastBp.bpm;
  return lastBp.beat + (time - lastBp.time) / msPerBeat;
}
