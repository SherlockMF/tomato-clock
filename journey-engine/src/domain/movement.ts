import type { Action, ActionSpec, WorldConfig, WorldState } from './types.ts';
import { localMinute } from './time.ts';
import { refundAllowed } from './ledger.ts';

export function prepareAction(state: WorldState, config: WorldConfig, spec: ActionSpec): Action | string {
  let duration: number;
  let cost = 0;
  let to: string | null = null;
  if (spec.kind === 'move') {
    const route = config.routes.find(x => x.id === spec.routeId);
    if (!route) return 'route_missing';
    if (route.from !== state.locationId) return 'route_origin';
    if (route.mode === 'drive' && (!config.licensed || !config.vehicle)) return 'driving_qualification';
    duration = route.duration; cost = route.costCents; to = route.to;
  } else {
    duration = spec.duration;
    if (!Number.isSafeInteger(duration) || duration <= 0) return 'invalid_duration';
    if ('amountCents' in spec && (!Number.isSafeInteger(spec.amountCents) || spec.amountCents < 0)) return 'invalid_amount';
    if (spec.kind === 'eat' || spec.kind === 'purchase') cost = spec.amountCents;
    if (spec.kind === 'purchase') {
      if (spec.locationId !== state.locationId) return 'purchase_location';
      const place = config.places.find(x => x.id === spec.locationId)!;
      const minute = localMinute(state.time, config.timezoneOffsetMinutes);
      if (minute < place.openMinute || minute + duration > place.closeMinute) return 'business_closed';
      if (!spec.itemId || state.items.some(x => x.id === spec.itemId)) return 'duplicate_item';
    }
    if (spec.kind === 'meet') {
      if (spec.commitmentId !== undefined) {
        const commitment = state.commitments.find(x => x.id === spec.commitmentId);
        if (!commitment || commitment.status !== 'pending' || commitment.due !== state.time
          || commitment.npcId !== spec.npcId || commitment.locationId !== state.locationId
          || commitment.duration !== duration) return 'invalid_commitment';
      }
      const npc = state.npcs.find(x => x.id === spec.npcId);
      if (!npc || npc.locationId !== state.locationId) return 'npc_location';
      if (npc.availableFrom > state.time || npc.availableUntil < state.time + duration) return 'npc_unavailable';
    }
    if (spec.kind === 'refund' && !refundAllowed(state, spec.paymentId, spec.amountCents)) return 'invalid_refund';
    if (spec.kind === 'receive' && !spec.source) return 'income_source_missing';
    if (['refund', 'receive'].includes(spec.kind) && 'amountCents' in spec) {
      const end = new Date((state.time + duration + config.timezoneOffsetMinutes) * 60_000);
      if (!Number.isFinite(end.getTime())) return 'invalid_duration';
      const first = new Date((state.nextIncomeAt + config.timezoneOffsetMinutes) * 60_000);
      const settlements = Math.max(0, (end.getUTCFullYear() - first.getUTCFullYear()) * 12 + end.getUTCMonth() - first.getUTCMonth() + 1);
      const projected = state.cashCents + config.monthlyIncomeCents * settlements + spec.amountCents;
      if (!Number.isSafeInteger(projected)) return 'money_overflow';
    }
  }
  if (cost > state.cashCents) return 'insufficient_funds';
  return { id: `a${state.version + 1}`, spec: structuredClone(spec), startedAt: state.time, duration, elapsed: 0, from: state.locationId, to, costCents: cost };
}
