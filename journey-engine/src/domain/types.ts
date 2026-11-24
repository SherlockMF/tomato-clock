export type Rate = 6 | 8;
export interface Personality { E: number; N: number; F: number; P: number }
export interface Character {
  id: string; name: string; gender: string; age: number;
  source: 'ideal' | 'stranger' | 'custom';
}
export interface Npc { id: string; locationId: string; availableFrom: number; availableUntil: number }
export interface Place { id: string; name: string; openMinute: number; closeMinute: number; lodgingCents: number }
export interface Route { id: string; from: string; to: string; duration: number; costCents: number; mode: 'transit' | 'drive' }
export interface Asset { id: string; ownerId: string; kind: string }
export interface Item { id: string; ownerId: string; acquiredBy: string }
export interface Goal { id: string; description: string; status: 'active' | 'completed' | 'abandoned' }
export interface Commitment {
  id: string; npcId: string; locationId: string; due: number; duration: number;
  status: 'pending' | 'in_progress' | 'fulfilled' | 'missed';
}
export type ActionSpec =
  | { kind: 'idle'; duration: number }
  | { kind: 'eat'; duration: number; amountCents: number }
  | { kind: 'move'; routeId: string }
  | { kind: 'purchase'; locationId: string; duration: number; amountCents: number; itemId: string }
  | { kind: 'receive'; duration: number; amountCents: number; source: string }
  | { kind: 'refund'; duration: number; amountCents: number; paymentId: string }
  | { kind: 'meet'; npcId: string; duration: number; commitmentId?: string };
export interface Action {
  id: string; spec: ActionSpec; startedAt: number; duration: number; elapsed: number;
  from: string; to: string | null; costCents: number;
}
export interface LedgerEntry {
  id: string; eventId: string; time: number; currency: string; amountCents: number;
  category: 'purchase' | 'food' | 'transport' | 'lodging' | 'passive_income' | 'earned_income' | 'refund';
  reference: string | null; balanceAfter: number;
}
export interface WorldConfig {
  schemaVersion: 1; worldId: string; seed: number; start: number; rate: Rate;
  timezoneOffsetMinutes: number; offlinePolicy: 'paused'; currency: string;
  character: Character; personality: Personality; initialCashCents: number;
  monthlyIncomeCents: number; locationId: string; initialFatigue: number;
  sleepAfterMinutes: number; sleepDurationMinutes: number; mealIntervalMinutes: number;
  mealCostCents: number; mealDurationMinutes: number; licensed: boolean; vehicle: boolean;
  places: Place[]; routes: Route[]; npcs: Npc[]; assets: Asset[];
  goals: Goal[]; commitments: Commitment[]; plan: ActionSpec[];
  fixturePolicy: 'seeded-idle' | 'daily-travel';
}
export interface WorldState {
  worldId: string; version: number; time: number; awakeMinutes: number; sleepMinutes: number;
  rngState: number; cashCents: number; locationId: string; fatigue: number;
  needs: { hungerMinutes: number; energy: number; health: number };
  personality: Personality; character: Character; assets: Asset[]; items: Item[];
  npcs: Npc[]; goals: Goal[]; commitments: Commitment[];
  inProgress: Action | null; sleeping: { startedAt: number; until: number; startEventId: string } | null;
  nextIncomeAt: number; planIndex: number; nextTripAt: number; nextMealAttemptAt: number;
  ledger: LedgerEntry[]; lastEventId: string | null;
}
export type EventKind = 'action_started' | 'action_rejected' | 'action_completed' | 'awake_minute'
  | 'sleep_started' | 'sleep_advanced' | 'woke' | 'monthly_income' | 'commitment_missed';
export interface EventData {
  action?: Action; reason?: string; spec?: ActionSpec; planIndex?: number;
  rngAfter?: number; nextTripAt?: number; nextMealAttemptAt?: number;
  until?: number; duration?: number; amountCents?: number; nextIncomeAt?: number;
  commitmentId?: string;
}
export interface WorldEvent {
  schemaVersion: 1; id: string; worldId: string; kind: EventKind; simulationTime: number;
  priorVersion: number; causedBy: string | null; idempotencyKey: string; rngSeed: number;
  preconditions: { time: number; locationId: string; cashCents: number };
  data: EventData;
}
export interface FocusRequest { id: string; sequence: number; realMinutes: number; rate: Rate }
export interface FocusReceipt extends FocusRequest {
  startTime: number; endTime: number; startVersion: number; endVersion: number;
  awakeMinutes: number; inProgress: Action | null;
}
