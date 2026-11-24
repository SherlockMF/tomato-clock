import { shortestPath } from '../autonomy/perception.ts';
import type { Route, WorldConfig } from '../domain/types.ts';

interface Passage {
  location: string;
  fare: number;
  minutes: number;
  legs: Route[];
}

export function routeWithinBudget(world: WorldConfig, from: string, to: string, cash: number): Route[] | null {
  const preferred = shortestPath(world, from, to);
  if (!preferred || preferred.reduce((sum, route) => sum + route.costCents, 0) <= cash) return preferred;
  // A slower arrival at the same stop can preserve enough money for the final leg.
  const start: Passage = { location: from, fare: 0, minutes: 0, legs: [] };
  const queue = [start];
  const arrivals = new Map<string, Passage[]>([[from, [start]]]);
  while (queue.length) {
    queue.sort((a, b) => a.minutes + a.fare / 100 - b.minutes - b.fare / 100);
    const current = queue.shift()!;
    if (current.location === to) return current.legs;
    for (const leg of world.routes) {
      if (leg.from !== current.location || (leg.mode === 'drive' && !(world.vehicle && world.licensed))) continue;
      const fare = current.fare + leg.costCents, minutes = current.minutes + leg.duration;
      const previous = arrivals.get(leg.to) ?? [];
      if (fare > cash || previous.some(stop => stop.fare <= fare && stop.minutes <= minutes)) continue;
      const next = { location: leg.to, fare, minutes, legs: [...current.legs, leg] };
      arrivals.set(leg.to, [...previous.filter(stop => stop.fare < fare || stop.minutes < minutes), next]);
      queue.push(next);
    }
  }
  return null;
}
