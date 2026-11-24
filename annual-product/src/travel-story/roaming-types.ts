export interface DayPath {
  label: string;
  beats: [string,string,string,string,string];
}

export interface RoadDay {
  day: number;
  city: string;
  axis: 'EI'|'SN'|'TF'|'JP';
  branches: [DayPath,DayPath];
}
