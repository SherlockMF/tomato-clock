export function toMinute(iso: string): number {
  const value = Date.parse(iso) / 60_000;
  if (!Number.isSafeInteger(value)) throw new Error('time must be an absolute whole minute');
  return value;
}
export function nextMonth(time: number, offset: number): number {
  const local = new Date((time + offset) * 60_000);
  const next = Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 1) / 60_000 - offset;
  if (!Number.isSafeInteger(next)) throw new Error('invalid calendar range');
  return next;
}
export function localMinute(time: number, offset: number): number {
  return ((time + offset) % 1440 + 1440) % 1440;
}
export function iso(time: number): string { return new Date(time * 60_000).toISOString(); }
export function integer(value: number, name: string, minimum = 0): void {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`invalid ${name}`);
}
