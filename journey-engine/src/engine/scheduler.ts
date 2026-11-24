import type { ActionSpec, EventData, EventKind, WorldConfig, WorldEvent, WorldState } from '../domain/types.ts';
import { nextMonth } from '../domain/time.ts';
import { prepareAction } from '../domain/movement.ts';
import { draw } from '../domain/rng.ts';

export function nextEvent(state: WorldState, config: WorldConfig, proposed?: ActionSpec): WorldEvent {
  function event(kind: EventKind, data: EventData = {}, causedBy = state.lastEventId): WorldEvent {
    const id = `e${state.version + 1}`;
    return { schemaVersion: 1, id, worldId: config.worldId, kind, simulationTime: state.time,
      priorVersion: state.version, causedBy, idempotencyKey: `${config.worldId}:${id}`, rngSeed: state.rngState,
      preconditions: { time: state.time, locationId: state.locationId, cashCents: state.cashCents }, data };
  }
  if (state.time >= state.nextIncomeAt) return event('monthly_income', {
    amountCents: config.monthlyIncomeCents, nextIncomeAt: nextMonth(state.time, config.timezoneOffsetMinutes),
  });
  if (state.inProgress && state.inProgress.elapsed === state.inProgress.duration) return event('action_completed', {}, state.inProgress.id.replace('a', 'e'));
  if (state.sleeping && state.time === state.sleeping.until) return event('woke', {}, state.sleeping.startEventId);

  const due = state.commitments.find(x => x.status === 'pending' && x.due <= state.time);
  if (due) {
    const spec: ActionSpec = { kind: 'meet', npcId: due.npcId, duration: due.duration, commitmentId: due.id };
    const prepared = prepareAction(state, config, spec);
    const reason = state.sleeping ? 'asleep' : state.inProgress ? 'busy' : state.fatigue >= config.sleepAfterMinutes ? 'fatigued'
      : state.locationId !== due.locationId ? 'wrong_location' : typeof prepared === 'string' ? prepared : null;
    if (reason) return event('commitment_missed', { commitmentId: due.id, reason });
    if (typeof prepared !== 'string') return event('action_started', { action: prepared });
  }
  if (state.sleeping) {
    const nextDue = state.commitments.filter(x => x.status === 'pending').reduce((min, x) => Math.min(min, x.due), Infinity);
    const until = Math.min(state.sleeping.until, state.nextIncomeAt, nextDue);
    return event('sleep_advanced', { duration: until - state.time }, state.sleeping.startEventId);
  }
  if (!state.inProgress && state.fatigue >= config.sleepAfterMinutes) {
    const place = config.places.find(x => x.id === state.locationId)!;
    if (place.lodgingCents > state.cashCents) throw new Error('insufficient lodging funds; explicit housing policy required');
    return event('sleep_started', { until: state.time + config.sleepDurationMinutes, amountCents: place.lodgingCents });
  }
  if (state.inProgress) return event('awake_minute', {}, state.inProgress.id.replace('a', 'e'));

  let spec: ActionSpec;
  const data: EventData = {};
  if (state.planIndex < config.plan.length) {
    spec = config.plan[state.planIndex]!;
    data.planIndex = state.planIndex + 1;
  } else if (proposed) {
    // Optional M2 intent; all calendar, commitment and in-flight priorities above remain authoritative.
    spec = proposed;
  } else if (state.needs.hungerMinutes >= config.mealIntervalMinutes && state.time >= state.nextMealAttemptAt) {
    spec = { kind: 'eat', duration: config.mealDurationMinutes, amountCents: config.mealCostCents };
    data.nextMealAttemptAt = state.time + config.mealIntervalMinutes;
  } else if (config.fixturePolicy === 'daily-travel' && state.time >= state.nextTripAt) {
    const routes = config.routes.filter(x => x.from === state.locationId && x.mode === 'transit');
    const random = draw(state.rngState);
    data.rngAfter = random.state;
    spec = routes.length ? { kind: 'move', routeId: routes[Math.floor(random.value * routes.length)]!.id } : { kind: 'idle', duration: 60 };
    data.nextTripAt = state.time + 1440;
  } else {
    const random = draw(state.rngState);
    data.rngAfter = random.state;
    spec = { kind: 'idle', duration: 30 + Math.floor(random.value * 91) };
  }
  const action = prepareAction(state, config, spec);
  if (typeof action === 'string') return event('action_rejected', { ...data, reason: action, spec });
  return event('action_started', { ...data, action });
}

export function needsAwakeBudget(event: WorldEvent): boolean {
  return ['awake_minute', 'action_started', 'action_rejected'].includes(event.kind);
}
