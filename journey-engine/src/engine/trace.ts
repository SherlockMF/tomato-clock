import { isDeepStrictEqual } from 'node:util';
import type { FocusReceipt, LedgerEntry, WorldConfig, WorldEvent, WorldState } from '../domain/types.ts';
import { initialState } from '../domain/state.ts';
import { advance } from './advance.ts';
import { receipt, validateFocus } from './focus-session.ts';

export interface Trace {
  config: WorldConfig; events: WorldEvent[]; state: WorldState;
  sessions: FocusReceipt[]; ledger: LedgerEntry[]; snapshotCount: number;
}

export function verifyTrace(trace: Trace): WorldState {
  let state = initialState(trace.config);
  const ids = new Set<string>();
  for (let index = 0; index < trace.sessions.length; index++) {
    const session = trace.sessions[index]!;
    if (session.sequence !== index + 1 || ids.has(session.id)) throw new Error('trace session sequence mismatch');
    ids.add(session.id);
    const result = advance(state, trace.config, validateFocus(session));
    if (!isDeepStrictEqual(result.events, trace.events.slice(state.version, result.state.version))) throw new Error('trace event replay mismatch');
    if (!isDeepStrictEqual(receipt(session, state, result.state), session)) throw new Error('trace receipt mismatch');
    state = result.state;
  }
  if (state.version !== trace.events.length || !isDeepStrictEqual(state, trace.state)) throw new Error('trace final state mismatch');
  if (!isDeepStrictEqual(state.ledger, trace.ledger)) throw new Error('trace ledger mismatch');
  if (trace.snapshotCount !== trace.sessions.length + 1) throw new Error('trace snapshot count mismatch');
  return state;
}
