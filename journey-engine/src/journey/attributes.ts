import {currentPersonality,growPersonality,initialPersonality,type JourneyPersonality} from './personality.ts';
import type {Config32, Decision32, Emit32, Fact32, Opportunity32} from '../life32r3/types.ts';

export const attributeLabels = {
  stamina: '体能',
  craft: '实务能力',
  curiosity: '探索意愿',
  connectionNeed: '相处意愿',
} as const;
type Attribute = keyof typeof attributeLabels;
export interface JourneyProfile {
  personality?:JourneyPersonality;
  values: Record<Attribute, number>;
  recent: {kind: string; location: string}[];
  lastFactSequence: number;
}
interface ProfileState {
  journey?: {profiles: Record<string, JourneyProfile>};
  opportunities: Opportunity32[];
}

const activityFamilies = {
  field: ['visit', 'observe', 'journey_survey', 'journey_deliver', 'journey_fieldnote'],
  physical: ['journey_clear', 'exercise', 'water', 'harvest', 'garden_project'],
  practical: ['practice', 'repair', 'work', 'journey_collect', 'journey_mend'],
  social: ['contact', 'social', 'gather', 'collaborate'],
  desk: ['travel_journal', 'study', 'create', 'review', 'revise', 'host'],
  upkeep: ['pack_meals', 'care', 'supplies'],
};
type Family = keyof typeof activityFamilies;
const families = new Map<string, Family>();
for (const family of Object.keys(activityFamilies) as Family[]) {
  for (const kind of activityFamilies[family]) families.set(kind, family);
}

export function initialProfiles(c: Config32): Record<string, JourneyProfile> {
  return Object.fromEntries(c.people.map(person => {
    const outdoors = person.interests.some(interest => ['园艺', '探索'].includes(interest));
    const handsOn = person.interests.some(interest => ['工作', '园艺'].includes(interest));
    return [person.id, {
      ...((c.journeyRevision??0)>=4?{personality:initialPersonality(person.personality)}:{}),
      values: {
        stamina: outdoors ? 52 : 42,
        craft: handsOn ? 55 : 35,
        curiosity: Math.round(25 + person.personality.N * 0.3 + (person.direction === 'traveler' ? 15 : 0)),
        connectionNeed: Math.round(25 + person.personality.E * 0.45),
      },
      recent: [],
      lastFactSequence: 0,
    }];
  }));
}

export function applyJourneyFact(c: Config32, s: ProfileState, fact: Fact32, ref: string, emit: Emit32): void {
  const family = families.get(fact.kind);
  if (!s.journey || !family || !fact.progress || !fact.opportunity || fact.until <= fact.from) return;
  const o = s.opportunities.find(candidate => candidate.id === fact.opportunity);
  if (!o || o.progress < o.minutes) return;
  // Runtime32 issues ordered vN fact IDs across sessions. Keep a watermark instead of an ever-growing set.
  const sequence = Number(ref.slice(1));
  if (!Number.isSafeInteger(sequence) || sequence <= 0 || ref !== 'v' + sequence) return;
  for (const id of fact.actors) {
    const profile = s.journey.profiles[id]!;
    if (sequence <= profile.lastFactSequence) continue;
    profile.lastFactSequence = sequence;
    const repeats = profile.recent.filter(last => last.kind === fact.kind).length;
    const practiceRate = Math.min(2, o.minutes / 60) / (1 + repeats);
    const change = (attribute: Attribute, target: number, rate: number) => {
      const before = profile.values[attribute];
      const after = Math.round((before + (target - before) * rate) * 10) / 10;
      if (after === before) return;
      profile.values[attribute] = after;
      emit({kind: 'attribute_changed', actor: id, causes: [ref], data: {attribute, before, after, activity: fact.kind}});
    };
    if ((family === 'physical' || fact.kind === 'journey_survey') && profile.values.stamina < 90) change('stamina', 90, 0.04 * practiceRate);
    if (family === 'desk' && profile.values.stamina > 35) change('stamina', 35, 0.008 * practiceRate);
    if ((family === 'practical' || fact.kind === 'garden_project') && profile.values.craft < 95) change('craft', 95, 0.05 * practiceRate);

    // Fulfilled wishes ease faster than routine experience builds them up. Only actual company eases social need.
    if(profile.personality)growPersonality(profile.personality,c.worlds[0]!.start,id,fact,ref,emit);
    const appetite = currentPersonality(c.people.find(person => person.id === id)!,s);
    change('curiosity', family === 'field' ? 15 : 65 + appetite.N * 0.3, family === 'field' ? 0.24 : 0.09);
    const company = fact.actors.length > 1;
    change('connectionNeed', company ? 12 : 60 + appetite.E * 0.35, company ? 0.32 : 0.09);
    profile.recent.push({kind: fact.kind, location: fact.location});
    if (profile.recent.length > 6) profile.recent.shift();
  }
}

export function scoreJourneyAttributes(c: Config32, s: ProfileState, id: string, decision: Decision32): Decision32 {
  const profile = s.journey?.profiles[id];
  if (!profile) return decision;
  const {stamina, craft, curiosity, connectionNeed} = profile.values;
  const home = c.people.find(person => person.id === id)!.home;
  for (const candidate of decision.candidates) {
    const family = families.get(candidate.kind);
    if (!family) continue;
    const o = s.opportunities.find(offered => offered.id === candidate.id)!;
    let exploreWeight = 0;
    if (family === 'field') exploreWeight = 0.8;
    if (family === 'desk') exploreWeight = -0.45;
    if (o.location !== home && candidate.travelMinutes > 0) exploreWeight += 0.15;
    candidate.factors.journeyCuriosity = (curiosity - 50) * exploreWeight;
    candidate.factors.journeyConnection = (connectionNeed - 50) * (family === 'social' ? 0.8 : 0);
    candidate.factors.journeyStamina = (stamina - 50) * (family === 'field' || family === 'physical' ? 0.4 : 0);
    candidate.factors.journeyCraft = (craft - 50) * (candidate.kind === 'practice' ? -0.35 : family === 'practical' ? 0.45 : 0);
    const repeated = profile.recent.filter(last => last.kind === candidate.kind);
    candidate.factors.journeyFamiliarity = -3 * (repeated.length + repeated.filter(last => last.location === o.location).length);
    for (const [key, value] of Object.entries(candidate.factors)) {
      if (Object.is(value, -0)) candidate.factors[key] = 0;
    }
    candidate.score = Object.values(candidate.factors).reduce((sum, n) => sum + n, 0);
  }
  if (decision.reason === 'highest_feasible_score' || decision.reason === 'nonpositive_scores') {
    const best = decision.candidates.filter(candidate => !candidate.reasons.length && candidate.score > 0)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))[0];
    decision.chosen = best?.id ?? null;
    decision.reason = best ? 'highest_feasible_score' : 'nonpositive_scores';
  }
  return decision;
}
