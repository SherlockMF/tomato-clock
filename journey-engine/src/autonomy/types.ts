import type { ActionSpec, Personality, WorldConfig, WorldEvent, WorldState } from '../domain/types.ts';

export type Skill = 'writing' | 'navigation' | 'trade';
export type Direction = 'explore' | 'social' | 'create' | 'settle' | 'work' | 'learn';
export type Activity = 'eat' | 'recover' | 'hygiene' | 'travel' | 'study' | 'create' | 'work' | 'meet' | 'observe' | 'admin' | 'wait';
export type PauseReason = 'budget' | 'unavailable' | 'external' | 'health';
export interface Topic { id: string; title: string; skill: Skill; minutes: number }
export interface PlaceKnowledge { locationId: string; cityId: string; subjects: string[] }
export interface WorkOffer { id: string; skill: Skill; minimumMinutes: number; duration: number; payCents: number }
export interface AutonomyConfig {
  version: 2; enabled: boolean; world: WorldConfig; direction: Direction | null;
  interests: Record<Skill, number>; initialSkills: Record<Skill, number>; topics: Topic[];
  places: PlaceKnowledge[]; jobs: WorkOffer[]; mealCents: [number, number, number];
  socialHours: { from: number; until: number }; initialGoalStatus: 'active' | 'completed' | 'paused';
}
export interface Goal {
  id: string; kind: Direction; status: 'active' | 'paused' | 'completed' | 'abandoned';
  cause: string; sourceRef: string; topic: string; location: string; progress: number; target: number;
  createdAt: number; pauseReason: PauseReason | null; pausedAt: number | null;
}
export interface Step {
  activity: Activity; title: string; minutes: number; completedMinutes: number;
  skill: Skill | null; topic: string; spec: ActionSpec;
}
export interface Plan {
  id: string; goalId: string; status: 'active' | 'paused'; pauseReason: string | null;
  steps: Step[]; index: number; createdAt: number; reason: string;
}
export interface Candidate {
  id: string; activity: Activity; spec: ActionSpec; title: string;
  goalId: string | null; planId: string | null; stepIndex: number | null;
  score: number; factors: Record<string, number>; rejection: string | null;
  skill: Skill | null; topic: string;
}
export interface ActionRecord {
  id: string; completedBy: string; decisionId: string | null; activity: Activity; spec: ActionSpec;
  start: number; end: number; awakeStart: number; awakeEnd: number; from: string; to: string;
  title: string; goalId: string | null; topic: string;
}
export interface Belief {
  time: number; awake: number; location: string; cash: number; fatigue: number; hunger: number; health: number;
  stress: number; hygiene: number; loneliness: number; budget: Budget; personality: Personality;
}
export interface Budget {
  cash: number; dailyNecessary: number; futureIncome: number; reserve: number;
  discretionary: number; runwayDays: number; mealCents: number;
}
export interface Decision {
  id: string; worldVersion: number; time: number; belief: Belief; goals: Goal[]; plan: Plan | null;
  previousActions: ActionRecord[]; candidates: Candidate[]; chosen: Candidate; reason: string;
}
export interface LifeEvent {
  id: string; worldVersion: number; sourceRef: string; time: number; awake: number;
  kind: 'goal_created' | 'goal_changed' | 'plan_created' | 'plan_paused' | 'plan_resumed' | 'step_completed' | 'activity_completed' | 'personality_changed';
  title: string; semanticKey: string | null; progress: boolean;
  data: Record<string, string | number | boolean | null>;
}
export interface Mind {
  version: 2; personality: Personality; driftUsed: Personality; driftPeriod: number;
  skills: Record<Skill, number>; topicMinutes: Record<string, number>; projectMinutes: Record<string, number>; learned: Record<string, boolean>; creations: Record<string, boolean>;
  observations: Record<string, boolean>; visited: Record<string, number>; relationships: Record<string, number>;
  goals: Goal[]; plan: Plan | null; lastGoalKind: Direction | null; completedGoals: number; goalSerial: number;
  decisionSerial: number; lifeSerial: number; planSerial: number; recent: ActionRecord[];
  active: { candidate: Candidate; decisionId: string | null; actionId: string; start: number; awakeStart: number } | null;
  stress: number; hygiene: number; loneliness: number; lastNeedsAt: number; workDay: number; workMinutesToday: number;
}
export interface AutonomyState { world: WorldState; mind: Mind }
export interface AdvanceResult { state: AutonomyState; events: WorldEvent[]; decisions: Decision[]; life: LifeEvent[]; blocked: string | null }

// M3/M4 ports consume committed evidence; implementations must be versioned and deterministic for replay.
export interface SocialPort { available(world: Readonly<WorldState>, npcId: string, duration: number): boolean }
export interface MemoryPort { relevant(world: Readonly<WorldState>, mind: Readonly<Mind>): readonly string[] }
export interface NarrativePort { render(facts: readonly LifeEvent[], actions: readonly ActionRecord[]): string }
