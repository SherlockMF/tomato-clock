export type JourneyActivity = 'journey_collect' | 'journey_deliver' | 'journey_survey' | 'journey_mend' | 'journey_fieldnote' | 'journey_clear' | 'journey_message';

export interface JourneyAssignment {
  transferred?: true;
  actor: string;
  opportunity: string;
}

export interface JourneyBook {
  id: string;
  title: string;
  home: string;
  location: string;
  status: 'shelf' | 'loan' | 'returned' | 'carried' | 'damaged';
  carrier: string | null;
  timesRead: number;
  wear: number;
  nextAt: number;
  source: string;
  assignment: JourneyAssignment | null;
}

export interface JourneyStation {
  location: string;
  level: number;
  reportedLevel: number;
  nextWeatherAt: number;
  rack?: { baskets: number; source: string; assignment: JourneyAssignment | null };
  weatherSource: string;
  reportSource: string;
  alert: { source: string; level: number; assignment: JourneyAssignment | null } | null;
}

export interface JourneyWorld {
  provisions?: Record<string,{portions:number;source:string}>;
  serviceInvoices?: {fact:string;cents:number}[];
  inbox?: Record<string, Record<string,{source:string;experience:string}>>;
  books: JourneyBook[];
  stations: JourneyStation[];
  fieldNotes: Record<string, Record<string, { season: number; source: string; level: number; at?: number }>>;
  nextCheck: number;
  rng: number;
  dispatchIndex: number;
}
