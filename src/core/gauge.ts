// Gauge / Health calculation
// Extracted from magusic.ts L1227-1256

import { JudgmentType, GaugeType } from './types';

export interface GaugeRecoveryTable {
  critical: number;
  great: number;
  good: number;
  fail: number;
  miss: number;
}

/** Recovery values per gauge type and judgment */
export const GAUGE_RECOVERY: Record<GaugeType, GaugeRecoveryTable> = {
  norma_easy:   { critical:  1.0, great:  0.5, good: 0.5, fail:  -1.0, miss:  -3.0 },
  norma:        { critical:  0.5, great:  0.2, good: 0.2, fail:  -2.0, miss:  -6.0 },
  life:         { critical:  0.5, great:  0.2, good: 0.2, fail:  -6.0, miss:  -8.0 },
  life_hard:    { critical:  0.5, great:  0.2, good: 0.2, fail: -10.0, miss: -15.0 },
  life_ex:      { critical:  0.5, great:  0.2, good: 0.2, fail: -25.0, miss: -50.0 },
  sudden_death: { critical:  0.0, great:  0.0, good: 0.0, fail: -100.0, miss: -100.0 },
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
  const isDead = (gaugeType === 'life' || gaugeType === 'life_hard' || gaugeType === 'life_ex' || gaugeType === 'sudden_death') && newHealth <= 0;
  return { health: newHealth, isDead };
}

/**
 * Get initial health for a gauge type.
 * Norma easy starts at 65, Norma starts at 80.
 * Life gauges start at 100.
 */
export function getInitialHealth(gaugeType: GaugeType): number {
  if (gaugeType === 'norma_easy') return 65;
  if (gaugeType === 'norma') return 80;
  return 100;
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
  if (gaugeType === 'norma_easy') return finalHealth >= 65;
  if (gaugeType === 'norma') return finalHealth >= 80;
  // life, life_hard, life_ex, sudden_death clear if survived (not dead)
  return true;
}
