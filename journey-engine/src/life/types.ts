import type { ActionSpec, WorldConfig, WorldEvent, WorldState } from '../domain/types.ts';
export interface PlaceContext { id:string;name:string;purpose:string;observations:string[] }
export interface Profile { id:string;name:string;occupation:string;interests:string[];motives:{explore:number;cooperate:number;income:number;create:number};home:string;workplace:string;shift:[number,number] }
export interface LifeObject { id:string;name:string;owner:string;location:string;holder:string|null;state:string;source:string }
export interface Artifact { id:string;kind:'photo'|'note';owner:string;subject:string;location:string;source:string }
export interface LifeGoal { id:string;actor:string;text:string;status:'active'|'completed'|'abandoned';source:string }
export interface LifeMemory { actor:string;topic:string;text:string;source:string;at:number }
export interface LifeRelation { a:string;b:string;trust:number;status:'acquainted'|'close'|'strained'|'ended';source:string }
export type Effect = {kind:'object';id:string;state:string;location:string;holder:string|null}
 | {kind:'artifact';id:string;artifact:'photo'|'note';owner:string;subject:string}
 | {kind:'memory';actor:string;topic:string;text:string}
 | {kind:'goal';actor:string;id:string;text:string;status:LifeGoal['status']}
 | {kind:'relation';a:string;b:string;delta:number;reconnect:boolean}
 | {kind:'flag';key:string;value:boolean};
export interface LifeStep { id:string;kind:string;location:string;actions:Record<string,ActionSpec>;title:string;prose:string;quotes:{speaker:string;text:string}[];effects:Effect[];objects:string[] }
export interface Condition { flag?:string;value?:boolean;object?:string;objectState?:string;goal?:string }
export interface Opportunity { id:string;title:string;provider:string;actor:string;participants:string[];location:string;available:number;deadline:number;conditions:Condition[];motives:Profile['motives'];steps:LifeStep[];causes:string[];once:boolean;choice:string;alternative:string }
export interface Proposal { version:1;id:string;provider:'rule'|'authored'|'offline-ai';model:string;promptVersion:string;rulesVersion:string;worldVersion:number;opportunity:string;conditions:Condition[];participants:string[];time:{from:number;until:number};location:string;goals:string[];motives:Profile['motives'];resources:{cashCents:number};actions:ActionSpec[];possibleResults:string[];scope:string[];causes:string[] }
export interface Validation { accepted:boolean;reasons:string[];rulesVersion:string;worldVersion:number }
export interface LifeConfig { version:31;mode:'authored'|'autonomous';hero:string;worlds:WorldConfig[];profiles:Profile[];places:PlaceContext[];objects:LifeObject[];opportunities:Opportunity[];initialRelations:LifeRelation[];proposals:Proposal[] }
export interface ActiveOpportunity { id:string;step:number;startedAt:number;stepStartedAt:number|null;completed:string[];proposalRef:string;stepWorldRefs:string[] }
export interface LifeState { version:31;time:number;serial:number;boundaryAt:number|null;worlds:Record<string,WorldState>;objects:LifeObject[];artifacts:Artifact[];goals:LifeGoal[];memories:LifeMemory[];relations:LifeRelation[];flags:Record<string,boolean>;finished:string[];active:ActiveOpportunity|null;lastDecisionAt:number;lastReviewFingerprint:string;proposalIndex:number }
export interface LifeFact { kind:string;opportunity:string|null;step:string|null;title:string;prose:string;quotes:{speaker:string;text:string}[];actors:string[];location:string;from:number;until:number;choice:string|null;alternative:string|null;effects:Effect[];objects:string[];semantic:string|null;progress:boolean }
export interface LifeRecord { id:string;sequence:number;time:number;kind:'world'|'proposal'|'decision'|'fact';actor:string;causes:string[];world?:WorldEvent;proposal?:Proposal;validation?:Validation;decision?:{candidates:{id:string;score:number;reasons:string[]}[];chosen:string|null;motives:Profile['motives']};fact?:LifeFact }
export interface LifeResult {state:LifeState;records:LifeRecord[];blocked:string|null}
