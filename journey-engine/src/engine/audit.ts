import type { Action, WorldConfig, WorldEvent, WorldState } from '../domain/types.ts';
import { nextMonth } from '../domain/time.ts';

export interface AuditResult {
  errors: string[]; awakeMinutes: number; sleepMinutes: number; calendarMinutes: number;
  incomeCents: number; expenseCents: number; refundCents: number; balanceCents: number;
  moves: number; completedActions: number; rejectedActions: number; events: number;
}

// Independent accounting/time checks, in addition to deterministic replay.
export function audit(config: WorldConfig, events: WorldEvent[], final: WorldState): AuditResult {
  const errors: string[] = [];
  const check = (condition: boolean, code: string): void => { if (!condition) errors.push(code); };
  let clock = config.start;
  let awake = 0, sleep = 0, moves = 0, completed = 0, rejected = 0;
  let location = config.locationId;
  let active: Action | null = null;
  let sleepUntil: number | null = null;
  let elapsed = 0;
  let balance = config.initialCashCents;
  let expectedIncomeAt = nextMonth(config.start, config.timezoneOffsetMinutes);
  const entries = new Map(final.ledger.map(x => [x.eventId, x]));
  check(entries.size === final.ledger.length, 'duplicate_ledger');
  let posted = 0;
  const ids = new Set<string>();
  for (let index = 0; index < events.length; index++) {
    const event = events[index]!;
    check(event.simulationTime === clock, 'event_time');
    check(event.priorVersion === index && event.id === `e${index + 1}`, 'event_order');
    check(event.causedBy === null || ids.has(event.causedBy), 'causal_reference');
    check(!ids.has(event.id), 'duplicate_event'); ids.add(event.id);
    check(event.preconditions.cashCents === balance && event.preconditions.locationId === location, 'event_preconditions');
    const entry = entries.get(event.id);
    if (entry) {
      balance += entry.amountCents; posted++;
      check(Number.isSafeInteger(balance) && balance >= 0 && entry.balanceAfter === balance, 'ledger_balance');
      check(entry.currency === config.currency && entry.time === clock, 'ledger_metadata');
    }
    switch (event.kind) {
      case 'action_started': {
        check(active === null && sleepUntil === null, 'action_overlap');
        active = event.data.action ?? null; elapsed = 0;
        check(active !== null && active.from === location, 'action_origin');
        if (active) {
          check((entry?.amountCents ?? 0) === -active.costCents, 'action_cost');
          if (active.spec.kind === 'move') {
            const move = active.spec;
            const actual = config.routes.find(x => x.id === move.routeId);
            check(!!actual && actual.from === location && actual.to === active.to && actual.duration === active.duration && actual.costCents === active.costCents, 'illegal_route');
            check(actual?.mode !== 'drive' || (config.licensed && config.vehicle), 'driving_qualification');
          }
        }
        break;
      }
      case 'awake_minute':
        check(active !== null && sleepUntil === null, 'free_awake_action');
        clock++; awake++; elapsed++;
        check(!active || elapsed <= active.duration, 'action_overrun');
        break;
      case 'action_completed':
        check(active !== null && sleepUntil === null && elapsed === active?.duration, 'early_completion');
        if (active?.to) { location = active.to; moves++; }
        active = null; completed++;
        break;
      case 'action_rejected': rejected++; break;
      case 'sleep_started':
        check(active === null && sleepUntil === null, 'sleep_overlap');
        sleepUntil = event.data.until!;
        check((entry?.amountCents ?? 0) === -(config.places.find(x => x.id === location)?.lodgingCents ?? NaN), 'lodging_cost');
        break;
      case 'sleep_advanced':
        check(active === null && sleepUntil !== null && event.data.duration! > 0 && clock + event.data.duration! <= sleepUntil!, 'illegal_sleep');
        clock += event.data.duration!; sleep += event.data.duration!;
        break;
      case 'woke':
        check(clock === sleepUntil, 'early_wake'); sleepUntil = null;
        break;
      case 'monthly_income': {
        check(clock === expectedIncomeAt, 'income_schedule');
        expectedIncomeAt = nextMonth(clock, config.timezoneOffsetMinutes);
        check(event.data.nextIncomeAt === expectedIncomeAt && entry?.reference === `month:${clock}`, 'income_reference');
        const local = new Date((clock + config.timezoneOffsetMinutes) * 60000);
        check(local.getUTCDate() === 1 && local.getUTCHours() === 0 && local.getUTCMinutes() === 0, 'income_calendar');
        check(entry?.amountCents === config.monthlyIncomeCents, 'income_amount');
        break;
      }
      case 'commitment_missed': break;
    }
  }
  check(posted === final.ledger.length, 'orphan_ledger');
  check(expectedIncomeAt > clock && final.nextIncomeAt === expectedIncomeAt, 'missing_income');
  check(balance === final.cashCents, 'final_balance');
  check(clock === final.time && awake === final.awakeMinutes && sleep === final.sleepMinutes && clock - config.start === awake + sleep, 'time_conservation');
  check(location === final.locationId, 'final_location');
  check(active?.id === final.inProgress?.id && (!active || elapsed === final.inProgress?.elapsed), 'final_progress');
  return { errors, awakeMinutes: awake, sleepMinutes: sleep, calendarMinutes: clock - config.start,
    incomeCents: final.ledger.filter(x => x.amountCents > 0 && x.category !== 'refund').reduce((sum, x) => sum + x.amountCents, 0),
    expenseCents: -final.ledger.filter(x => x.amountCents < 0).reduce((sum, x) => sum + x.amountCents, 0),
    refundCents: final.ledger.filter(x => x.category === 'refund').reduce((sum, x) => sum + x.amountCents, 0),
    balanceCents: balance, moves, completedActions: completed, rejectedActions: rejected, events: events.length };
}
