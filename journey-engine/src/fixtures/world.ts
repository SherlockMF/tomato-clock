import type { WorldConfig } from '../domain/types.ts';
import { toMinute } from '../domain/time.ts';

// Every number and place in this file is a synthetic fixture, not a product default.
export function fixture(overrides: Partial<WorldConfig> = {}): WorldConfig {
  return {
    schemaVersion: 1, worldId: 'synthetic-world', seed: 20261116,
    start: toMinute('2026-01-30T08:00:00Z'), rate: 6, timezoneOffsetMinutes: 0,
    offlinePolicy: 'paused', currency: 'CNY', initialCashCents: 20_000_000,
    monthlyIncomeCents: 150_000, initialFatigue: 0, locationId: 'a',
    sleepAfterMinutes: 960, sleepDurationMinutes: 480, mealIntervalMinutes: 300,
    mealCostCents: 1500, mealDurationMinutes: 20, licensed: false, vehicle: false,
    character: { id: 'person', name: '合成人物', gender: 'unspecified', age: 25, source: 'custom' },
    personality: { E: 38, N: 64, F: 59, P: 68 },
    places: [
      { id: 'a', name: '合成城市 A', openMinute: 0, closeMinute: 1440, lodgingCents: 5000 },
      { id: 'b', name: '合成城市 B', openMinute: 0, closeMinute: 1440, lodgingCents: 6000 },
      { id: 'shop', name: '合成商店', openMinute: 540, closeMinute: 1080, lodgingCents: 0 },
    ],
    routes: [
      { id: 'a-b', from: 'a', to: 'b', duration: 90, costCents: 1200, mode: 'transit' },
      { id: 'b-a', from: 'b', to: 'a', duration: 90, costCents: 1200, mode: 'transit' },
      { id: 'drive-a-b', from: 'a', to: 'b', duration: 60, costCents: 2500, mode: 'drive' },
    ],
    npcs: [
      { id: 'npc-a', locationId: 'a', availableFrom: 0, availableUntil: 100_000_000 },
      { id: 'npc-b', locationId: 'b', availableFrom: 0, availableUntil: 100_000_000 },
    ],
    assets: [], goals: [], commitments: [], plan: [], fixturePolicy: 'seeded-idle',
    ...overrides,
  };
}
