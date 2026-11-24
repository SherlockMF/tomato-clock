import type { WorldConfig, WorldState } from './types.ts';
import { integer, nextMonth } from './time.ts';

export function validateConfig(config: WorldConfig): void {
  if (!config || typeof config !== 'object' || !config.character || !config.personality) throw new Error('invalid config structure');
  for (const key of ['places', 'routes', 'npcs', 'assets', 'goals', 'commitments', 'plan'] as const) {
    if (!Array.isArray(config[key]) || config[key].some(x => !x || typeof x !== 'object')) throw new Error(`invalid ${key}`);
  }
  if (typeof config.licensed !== 'boolean' || typeof config.vehicle !== 'boolean') throw new Error('invalid driving qualification');
  if (!['seeded-idle', 'daily-travel'].includes(config.fixturePolicy)) throw new Error('invalid fixture policy');
  if (config.schemaVersion !== 1 || !config.worldId || ![6, 8].includes(config.rate)) throw new Error('invalid config');
  if (config.offlinePolicy !== 'paused') throw new Error('unsupported offline policy');
  if (!['ideal', 'stranger', 'custom'].includes(config.character.source)) throw new Error('invalid character source');
  integer(config.seed, 'seed');
  if (config.seed > 0xffffffff) throw new Error('invalid seed');
  integer(config.start, 'start');
  if (!Number.isSafeInteger(config.timezoneOffsetMinutes) || Math.abs(config.timezoneOffsetMinutes) > 840) throw new Error('invalid timezone');
  nextMonth(config.start, config.timezoneOffsetMinutes);
  integer(config.initialCashCents, 'cash');
  for (const axis of ['E', 'N', 'F', 'P'] as const) {
    const value = config.personality[axis];
    if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error('invalid personality');
  }
  for (const key of ['monthlyIncomeCents', 'initialFatigue', 'mealCostCents'] as const) integer(config[key], key);
  for (const key of ['sleepAfterMinutes', 'sleepDurationMinutes', 'mealIntervalMinutes', 'mealDurationMinutes'] as const) integer(config[key], key, 1);
  if (!/^[A-Z]{3}$/.test(config.currency)) throw new Error('invalid currency');
  const locations = new Set(config.places.map(x => x.id));
  if (locations.size !== config.places.length || !locations.has(config.locationId)) throw new Error('invalid locations');
  for (const place of config.places) {
    integer(place.lodgingCents, 'lodging');
    integer(place.openMinute, 'opening'); integer(place.closeMinute, 'closing', 1);
    if (place.openMinute >= place.closeMinute || place.closeMinute > 1440) throw new Error('invalid opening hours');
  }
  for (const collection of [config.routes, config.npcs, config.commitments, config.assets, config.goals]) {
    if (new Set(collection.map(x => x.id)).size !== collection.length) throw new Error('duplicate entity id');
  }
  for (const route of config.routes) {
    if (!locations.has(route.from) || !locations.has(route.to) || route.from === route.to) throw new Error('invalid route');
    if (!['drive', 'transit'].includes(route.mode)) throw new Error('invalid route mode');
    integer(route.duration, 'route duration', 1); integer(route.costCents, 'route cost');
  }
  for (const npc of config.npcs) {
    if (!locations.has(npc.locationId) || npc.availableUntil < npc.availableFrom) throw new Error('invalid npc');
    integer(npc.availableFrom, 'npc availability'); integer(npc.availableUntil, 'npc availability');
  }
  for (const commitment of config.commitments) {
    if (!locations.has(commitment.locationId) || !config.npcs.some(x => x.id === commitment.npcId) || commitment.status !== 'pending') throw new Error('invalid commitment');
    integer(commitment.due, 'commitment due', config.start); integer(commitment.duration, 'commitment duration', 1);
  }
  for (const spec of config.plan) {
    if (!['idle', 'eat', 'move', 'purchase', 'receive', 'refund', 'meet'].includes(spec.kind)) throw new Error('invalid action kind');
    if (spec.kind === 'move') {
      if (typeof spec.routeId !== 'string') throw new Error('invalid route id');
    } else if (!Number.isFinite(spec.duration)) throw new Error('invalid action duration');
    if (['eat', 'purchase', 'receive', 'refund'].includes(spec.kind) && (!('amountCents' in spec) || !Number.isFinite(spec.amountCents))) throw new Error('invalid action amount');
  }
}

export function initialState(config: WorldConfig): WorldState {
  validateConfig(config);
  return {
    worldId: config.worldId, version: 0, time: config.start, awakeMinutes: 0, sleepMinutes: 0,
    rngState: config.seed, cashCents: config.initialCashCents, locationId: config.locationId,
    fatigue: config.initialFatigue, needs: { hungerMinutes: 0, energy: Math.max(0, 100 - Math.floor(config.initialFatigue * 100 / config.sleepAfterMinutes)), health: 100 },
    personality: structuredClone(config.personality), character: structuredClone(config.character),
    assets: structuredClone(config.assets), items: [], npcs: structuredClone(config.npcs),
    goals: structuredClone(config.goals), commitments: structuredClone(config.commitments),
    inProgress: null, sleeping: null, nextIncomeAt: nextMonth(config.start, config.timezoneOffsetMinutes),
    planIndex: 0, nextTripAt: config.start + 120, nextMealAttemptAt: config.start,
    ledger: [], lastEventId: null,
  };
}

export function assertState(state: WorldState, config: WorldConfig): void {
  integer(state.cashCents, 'cash'); integer(state.time, 'time', config.start);
  if (state.time - config.start !== state.awakeMinutes + state.sleepMinutes) throw new Error('time conservation');
  if (!config.places.some(x => x.id === state.locationId)) throw new Error('illegal location');
  if (state.inProgress && state.sleeping) throw new Error('overlapping actions');
  if (state.inProgress && (state.inProgress.from !== state.locationId || state.inProgress.elapsed > state.inProgress.duration)) throw new Error('invalid action progress');
  for (const value of [state.needs.energy, state.needs.health]) if (value < 0 || value > 100) throw new Error('invalid needs');
}
