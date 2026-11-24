import type { LedgerEntry, WorldConfig, WorldState } from './types.ts';

export function refundAllowed(state: WorldState, paymentId: string, amount: number): boolean {
  const payment = state.ledger.find(x => x.id === paymentId && x.amountCents < 0);
  if (!payment || !Number.isSafeInteger(amount) || amount <= 0) return false;
  const refunded = state.ledger.filter(x => x.category === 'refund' && x.reference === paymentId).reduce((s, x) => s + x.amountCents, 0);
  return refunded + amount <= -payment.amountCents;
}

export function post(state: WorldState, config: WorldConfig, eventId: string, amount: number, category: LedgerEntry['category'], reference: string | null = null): void {
  if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(state.cashCents + amount)) throw new Error('invalid money precision');
  if (state.cashCents + amount < 0) throw new Error('insufficient funds');
  if (state.ledger.some(x => x.id === eventId)) throw new Error('duplicate ledger entry');
  state.cashCents += amount;
  state.ledger.push({ id: eventId, eventId, time: state.time, currency: config.currency, amountCents: amount, category, reference, balanceAfter: state.cashCents });
}
