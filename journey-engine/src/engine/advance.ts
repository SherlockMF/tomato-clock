import type { WorldConfig, WorldEvent, WorldState } from '../domain/types.ts';
import { integer } from '../domain/time.ts';
import { applyEvent } from '../domain/event-log.ts';
import { needsAwakeBudget, nextEvent } from './scheduler.ts';

export function advance(previous: WorldState, config: WorldConfig, awakeBudget: number): { state: WorldState; events: WorldEvent[] } {
  integer(awakeBudget, 'awake budget');
  const state = structuredClone(previous);
  const events: WorldEvent[] = [];
  if (awakeBudget === 0) return { state, events };
  let remaining = awakeBudget;
  while (true) {
    const event = nextEvent(state, config);
    if (remaining === 0 && needsAwakeBudget(event)) break;
    applyEvent(state, config, event);
    events.push(event);
    if (event.kind === 'awake_minute') remaining--;
  }
  return { state, events };
}
