import type { Personality, Route, WorldConfig, WorldState } from '../domain/types.ts';
import type { Activity, AutonomyConfig, AutonomyState, Belief, Budget } from './types.ts';

export function budgetView(world: WorldState, config: WorldConfig, cheapestMeal: number): Budget {
  const lodging = config.places.find(p => p.id === world.locationId)!.lodgingCents;
  const dailyNecessary = lodging + 3 * cheapestMeal;
  const daysToIncome = Math.max(1, Math.ceil((world.nextIncomeAt - world.time) / 1440));
  const futureIncome = config.monthlyIncomeCents;
  const reserve = dailyNecessary * Math.min(7, daysToIncome);
  return { cash: world.cashCents, dailyNecessary, futureIncome, reserve,
    discretionary: Math.max(0, world.cashCents - reserve),
    runwayDays: (world.cashCents + futureIncome) / Math.max(1, dailyNecessary), mealCents: cheapestMeal };
}

export function personalityScore(p: Personality, activity: Activity): number {
  const e = (p.E - 50) / 5, n = (p.N - 50) / 5, f = (p.F - 50) / 5, spontaneity = (p.P - 50) / 5;
  switch (activity) {
    case 'meet': return e + f;
    case 'study': return n - spontaneity / 2;
    case 'create': return n + f / 2;
    case 'travel': return spontaneity + n / 2;
    case 'observe': return n + spontaneity / 2;
    case 'work': return -spontaneity - f / 2;
    case 'admin': return -spontaneity - n / 2;
    case 'recover': return -e / 2;
    default: return 0;
  }
}

export function shortestPath(config: WorldConfig, from: string, to: string): Route[] | null {
  const queue: { location: string; path: Route[]; cost: number }[] = [{ location: from, path: [], cost: 0 }];
  const visited = new Set<string>();
  while (queue.length) {
    queue.sort((a, b) => a.cost - b.cost);
    const item = queue.shift()!;
    if (item.location === to) return item.path;
    if (visited.has(item.location)) continue;
    visited.add(item.location);
    for (const route of config.routes.filter(r => r.from === item.location && (r.mode !== 'drive' || (config.licensed && config.vehicle)))) {
      queue.push({ location: route.to, path: [...item.path, route], cost: item.cost + route.duration + route.costCents / 100 });
    }
  }
  return null;
}

export function perceive(state: AutonomyState, config: AutonomyConfig): Belief {
  const { world, mind } = state, budget = budgetView(world, config.world, config.mealCents[0]);
  budget.mealCents = budget.runwayDays < 10 ? config.mealCents[0] : budget.runwayDays < 90 ? config.mealCents[1] : config.mealCents[2];
  budget.mealCents = config.mealCents.filter(price => price <= budget.mealCents && price <= world.cashCents).at(-1) ?? config.mealCents[0];
  return { time: world.time, awake: world.awakeMinutes, location: world.locationId, cash: world.cashCents,
    hunger: world.needs.hungerMinutes, fatigue: world.fatigue, health: world.needs.health,
    stress: mind.stress, hygiene: mind.hygiene, loneliness: mind.loneliness, budget, personality: { ...mind.personality } };
}
