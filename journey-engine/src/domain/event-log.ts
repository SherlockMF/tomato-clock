import type { WorldConfig, WorldEvent, WorldState } from './types.ts';
import { assertState } from './state.ts';
import { post } from './ledger.ts';

// Internal mutable projector. Public advance/replay own their state copies.
export function applyEvent(state: WorldState, config: WorldConfig, event: WorldEvent): void {
  if (event.priorVersion !== state.version || event.id !== `e${state.version + 1}` || event.worldId !== state.worldId || event.simulationTime !== state.time) throw new Error('event continuity mismatch');
  const data = event.data;
  if (data.planIndex !== undefined) state.planIndex = data.planIndex;
  if (data.rngAfter !== undefined) state.rngState = data.rngAfter;
  if (data.nextTripAt !== undefined) state.nextTripAt = data.nextTripAt;
  if (data.nextMealAttemptAt !== undefined) state.nextMealAttemptAt = data.nextMealAttemptAt;
  switch (event.kind) {
    case 'action_started': {
      if (state.inProgress || state.sleeping || !data.action) throw new Error('action overlap');
      const action = structuredClone(data.action);
      state.inProgress = action;
      if (action.costCents) post(state, config, event.id, -action.costCents, action.spec.kind === 'move' ? 'transport' : action.spec.kind === 'eat' ? 'food' : 'purchase');
      const spec = action.spec;
      if (spec.kind === 'meet' && spec.commitmentId) state.commitments.find(x => x.id === spec.commitmentId)!.status = 'in_progress';
      break;
    }
    case 'action_rejected': break;
    case 'awake_minute': {
      if (!state.inProgress || state.sleeping) throw new Error('awake activity during sleep');
      state.inProgress.elapsed++;
      state.time++; state.awakeMinutes++; state.fatigue++;
      updateNeeds(state, config, 1, false);
      break;
    }
    case 'action_completed': {
      const action = state.inProgress;
      if (!action || action.elapsed !== action.duration) throw new Error('unfinished action');
      if (action.to) state.locationId = action.to;
      const spec = action.spec;
      if (spec.kind === 'eat') state.needs.hungerMinutes = 0;
      if (spec.kind === 'receive') post(state, config, event.id, spec.amountCents, 'earned_income', spec.source);
      if (spec.kind === 'refund') post(state, config, event.id, spec.amountCents, 'refund', spec.paymentId);
      if (spec.kind === 'purchase') state.items.push({ id: spec.itemId, ownerId: config.character.id, acquiredBy: event.id });
      if (spec.kind === 'meet' && spec.commitmentId) state.commitments.find(x => x.id === spec.commitmentId)!.status = 'fulfilled';
      state.inProgress = null;
      break;
    }
    case 'sleep_started':
      if (state.inProgress || state.sleeping) throw new Error('sleep overlap');
      post(state, config, event.id, -data.amountCents!, 'lodging');
      state.sleeping = { startedAt: state.time, until: data.until!, startEventId: event.id };
      break;
    case 'sleep_advanced': {
      if (!state.sleeping || state.inProgress || !data.duration || data.duration < 0) throw new Error('illegal sleep');
      state.time += data.duration; state.sleepMinutes += data.duration;
      updateNeeds(state, config, data.duration, true);
      break;
    }
    case 'woke':
      if (!state.sleeping || state.time !== state.sleeping.until) throw new Error('invalid wake time');
      state.sleeping = null; state.fatigue = 0; state.needs.energy = 100;
      break;
    case 'monthly_income':
      post(state, config, event.id, data.amountCents!, 'passive_income', `month:${state.nextIncomeAt}`);
      state.nextIncomeAt = data.nextIncomeAt!;
      break;
    case 'commitment_missed':
      state.commitments.find(x => x.id === data.commitmentId)!.status = 'missed';
      break;
  }
  state.version++; state.lastEventId = event.id;
  assertState(state, config);
}

function updateNeeds(state: WorldState, config: WorldConfig, duration: number, asleep: boolean): void {
  // Synthetic physiology: hourly consequences after 24 hours without food.
  const beforeHunger = state.needs.hungerMinutes;
  state.needs.hungerMinutes += duration;
  const deprivedMinutes = Math.max(0, state.needs.hungerMinutes - 1440);
  const beforeDeprived = Math.max(0, beforeHunger - 1440);
  state.needs.health = Math.max(0, state.needs.health - (Math.floor(deprivedMinutes / 60) - Math.floor(beforeDeprived / 60)));
  if (!asleep) state.needs.energy = Math.max(0, 100 - Math.floor(state.fatigue * 100 / config.sleepAfterMinutes));
}
