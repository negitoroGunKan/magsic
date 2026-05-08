// Shared type definitions extracted from magusic.ts

export interface BPMChange {
  beat: number;
  bpm: number;
  time: number;
}

export interface ChartNote {
  time: number;
  lane: number;
  duration: number;
  isLong: boolean;
  hit: boolean;
  soundId?: string;
  beat: number;
  visualY?: number;
  type?: 'normal' | 'sinking' | 'death';
}

export type JudgmentType = 'critical' | 'great' | 'good' | 'fail' | 'miss';

export type GaugeType = 'norma' | 'life' | 'life_hard';

export type KeyMode = '4key' | '6key' | '8key' | '12key';

export interface TextEvent {
  beat: number;
  text: string;
  time: number;
}
