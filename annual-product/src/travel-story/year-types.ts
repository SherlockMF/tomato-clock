export type Contrast='EI'|'IE'|'SN'|'NS'|'TF'|'FT'|'JP'|'PJ';
export interface YearChapter {
  title:string;
  contrast:Contrast;
  days:string[];
  alternate:string;
}
export interface YearEvent {id:string;day:number;at:number;city:string;text:string}
export interface DayRecord {day:number;city:string;cash:number}
export type Traits=Record<'E'|'N'|'F'|'P',number>;
export interface LedgerRow {day:number;at:number;kind:string;amount:number;balance:number;source:string}
