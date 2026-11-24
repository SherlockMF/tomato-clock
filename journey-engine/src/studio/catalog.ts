export { StudioError } from './http.ts';

export type RunMode = 'focus' | 'action' | 'day' | 'week' | 'month' | 'verify';

export interface RunRequest {
  mode: RunMode;
  realMinutes: number;
  rate: 6 | 8;
}

export interface Job {
  id: string;
  experiment: string;
  request: RunRequest;
  status: 'queued' | 'running' | 'completed' | 'cancelled' | 'failed' | 'interrupted';
  progress: number;
  commits: number;
  from: number;
  until: number;
  message: string;
  createdAt: string;
}
