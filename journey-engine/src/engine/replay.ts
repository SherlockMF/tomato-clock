import { isDeepStrictEqual } from 'node:util';
import type { WorldConfig, WorldEvent, WorldState } from '../domain/types.ts';
import { initialState } from '../domain/state.ts';
import { applyEvent } from '../domain/event-log.ts';
import { nextEvent } from './scheduler.ts';

export function replay(config: WorldConfig, events: Iterable<WorldEvent>, snapshot?: WorldState): WorldState {
  const state = snapshot ? structuredClone(snapshot) : initialState(config);
  for (const event of events) {
    if (!isDeepStrictEqual(nextEvent(state, config), event)) throw new Error(`invalid event ${event.id}: deterministic replay mismatch`);
    applyEvent(state, config, event);
  }
  return state;
}
