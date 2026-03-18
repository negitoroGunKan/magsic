// Chart parsing logic
// Extracted from magusic.ts L3384-3462
import { getTimeFromBeat } from './bpm';
/**
 * Parse raw chart JSON into structured notes with timing data.
 * Pure function: returns all computed state rather than mutating globals.
 *
 * @param json - Raw chart JSON object
 * @returns Parsed chart with notes, bpmChanges, and layoutChanges
 */
export function parseChart(json) {
    const offset = json.offset || 0;
    // 1. Parse BPM Changes
    let bpmChanges = [];
    if (json.bpmChanges && Array.isArray(json.bpmChanges)) {
        // New Format
        json.bpmChanges.forEach((bc) => {
            bpmChanges.push({
                beat: bc.beat,
                bpm: bc.bpm,
                time: 0, // Will calculate
            });
        });
        bpmChanges.sort((a, b) => a.beat - b.beat);
    }
    else {
        // Legacy / Single BPM
        bpmChanges.push({
            beat: 0,
            bpm: json.bpm || 120,
            time: 0,
        });
    }
    // Ensure beat-0 entry exists
    if (bpmChanges.length === 0 || bpmChanges[0].beat > 0) {
        bpmChanges.unshift({ beat: 0, bpm: json.bpm || 120, time: 0 });
    }
    // 2. Calculate Times for BPM Changes
    bpmChanges[0].time = offset;
    for (let i = 1; i < bpmChanges.length; i++) {
        const prev = bpmChanges[i - 1];
        const beatsPassed = bpmChanges[i].beat - prev.beat;
        const msPerBeat = 60000 / prev.bpm;
        bpmChanges[i].time = prev.time + beatsPassed * msPerBeat;
    }
    // 3. Parse Notes
    const notes = (json.notes || []).map((n) => ({
        time: getTimeFromBeat(n.beat, bpmChanges),
        lane: n.lane,
        duration: n.duration
            ? getTimeFromBeat(n.beat + n.duration, bpmChanges) - getTimeFromBeat(n.beat, bpmChanges)
            : 0,
        isLong: n.duration > 0,
        hit: false,
        beat: n.beat,
        type: n.type || 'normal',
    })).sort((a, b) => a.time - b.time);
    // 4. Parse Layout Changes
    const layoutChanges = [];
    if (Array.isArray(json.layoutChanges)) {
        json.layoutChanges.forEach((lc) => {
            layoutChanges.push({
                time: getTimeFromBeat(lc.beat, bpmChanges),
                type: lc.type,
            });
        });
        layoutChanges.sort((a, b) => a.time - b.time);
    }
    return { notes, bpmChanges, layoutChanges };
}
