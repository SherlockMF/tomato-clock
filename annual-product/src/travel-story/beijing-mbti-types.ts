export interface Option {
  id: string;
  title: string;
  text: string;
  preferences: string;
  requires?: string[];
  excludes?: string[];
  adds?: string[];
  cost?: number;
  pay?: number;
  practice?: string;
  uses?: string;
}

export interface Scene {
  title: string;
  city: '北京' | '在途' | '武汉';
  options: Option[];
}
