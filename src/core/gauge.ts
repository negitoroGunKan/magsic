// Gauge / Health calculation
// Extracted from magusic.ts L1227-1256

import { JudgmentType, GaugeType } from './types';

export interface GaugeRecoveryTable {
  perfect: number;
  great: number;
  nice: number;
  bad: number;
  miss: number;
}

/** Recovery values per gauge type and judgment */
export const GAUGE_RECOVERY: Record<GaugeType, GaugeRecoveryTable> = {
  norma:     { perfect:  2.0, great:  1.0, nice: 0.2, bad: -2.0, miss:  -5.0 },
  life:      { perfect:  0.2, great:  0.1, nice: 0.0, bad: -4.0, miss:  -5.0 },
  life_hard: { perfect:  0.2, great:  0.1, nice: 0.0, bad: -5.0, miss: -10.0 },
};

export interface GaugeState {
  health: number;   // 0 to 100
  isDead: boolean;  // true if life gauge reached 0
}

/**
 * Calculate new gauge state after a hit.
 *
 * @param currentHealth - Current health value (0-100)
 * @param judgmentType - The judgment received
 * @param gaugeType - Which gauge mode is active
 * @returns New GaugeState with updated health and death flag
 */
export function applyGaugeHit(
  currentHealth: number,
  judgmentType: JudgmentType,
  gaugeType: GaugeType,
): GaugeState {
  const recovery = GAUGE_RECOVERY[gaugeType][judgmentType];
  const newHealth = Math.max(0, Math.min(100, currentHealth + recovery));
  const isDead = (gaugeType === 'life' || gaugeType === 'life_hard') && newHealth <= 0;
  return { health: newHealth, isDead };
}

/**
 * Get initial health for a gauge type.
 * Norma starts at 0 (build up to 70% to clear).
 * Life gauges start at 100 (survive to clear).
 */
export function getInitialHealth(gaugeType: GaugeType): number {
  return (gaugeType === 'life' || gaugeType === 'life_hard') ? 100 : 0;
}

/**
 * Determine if track is cleared based on gauge type and final state.
 *
 * @param gaugeType - Active gauge mode
 * @param finalHealth - Health at end of track
 * @param isDead - Whether player died during play (life gauge hit 0)
 */
export function isTrackCleared(
  gaugeType: GaugeType,
  finalHealth: number,
  isDead: boolean,
): boolean {
  if (isDead) return false;
  if (gaugeType === 'norma') return finalHealth >= 70;
  // life and life_hard: clear if survived (not dead)
  return true;
}
