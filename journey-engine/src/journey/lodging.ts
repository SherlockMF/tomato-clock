import type {ActionSpec, Route, WorldConfig, WorldState} from '../domain/types.ts';
import {routeWithinBudget} from './routing.ts';

function routeToBed(world: WorldConfig, location: string, cash: number): Route[] | null {
  if (world.places.find(p => p.id === location)!.lodgingCents <= cash) return [];
  let best: Route[] | null = null, shortest = Infinity;
  for (const place of world.places) {
    if (place.lodgingCents > cash) continue;
    const path = routeWithinBudget(world, location, place.id, cash - place.lodgingCents);
    if (!path) continue;
    const minutes = path.reduce((sum, leg) => sum + leg.duration, 0);
    if (minutes < shortest) { best = path; shortest = minutes; }
  }
  return best;
}

export function canReachBed(world: WorldConfig, location: string, cash: number, minutes: number): boolean {
  const path = routeToBed(world, location, cash);
  return path !== null && path.reduce((sum, leg) => sum + leg.duration, 0) <= minutes;
}

// The M1 scheduler charges for the location where the person actually falls asleep.
// Before an unplanned meal or wait uses up the last fare or walking time, set out on a real leg.
export function shelterBeforeFallback(world: WorldConfig, person: WorldState, fallback: ActionSpec): ActionSpec | null {
  if (fallback.kind !== 'eat' && fallback.kind !== 'idle') return null;
  const cash = person.cashCents, location = person.locationId, remaining = world.sleepAfterMinutes - person.fatigue;
  const after = cash - (fallback.kind === 'eat' ? fallback.amountCents : 0);
  if (canReachBed(world, location, after, Math.max(0, remaining - fallback.duration))) return null;

  // If food and a room compete for the same money, first try reaching a cheaper bed.
  const mealRoute = routeToBed(world, location, after);
  const route = mealRoute && mealRoute.reduce((sum, leg) => sum + leg.duration, 0) <= remaining
    ? mealRoute : routeToBed(world, location, cash);
  if (route?.length) return {kind: 'move', routeId: route[0]!.id};
  if (route && fallback.kind === 'eat') return {kind: 'idle', duration: Math.max(1, Math.min(30, remaining))};
  return null;
}
