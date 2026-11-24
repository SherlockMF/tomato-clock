import type { FocusReceipt, FocusRequest, WorldState } from '../domain/types.ts';
import { integer } from '../domain/time.ts';

export function validateFocus(request: FocusRequest): number {
  if (typeof request.id !== 'string' || !request.id.trim() || request.id.length > 200) throw new Error('invalid focus id');
  integer(request.sequence, 'focus sequence', 1);
  if (![6, 8].includes(request.rate)) throw new Error('invalid focus rate');
  if (!Number.isFinite(request.realMinutes) || request.realMinutes <= 0) throw new Error('invalid focus duration');
  const budget = request.realMinutes * request.rate;
  integer(budget, 'focus budget', 1);
  // Resource limit per transaction, independent of the world's lifetime.
  if (budget > 1440 * 7) throw new Error('focus budget exceeds seven awake days');
  return budget;
}

export function receipt(request: FocusRequest, before: WorldState, after: WorldState): FocusReceipt {
  return { id: request.id, sequence: request.sequence, realMinutes: request.realMinutes, rate: request.rate,
    startTime: before.time, endTime: after.time, startVersion: before.version, endVersion: after.version,
    awakeMinutes: after.awakeMinutes - before.awakeMinutes, inProgress: structuredClone(after.inProgress) };
}
