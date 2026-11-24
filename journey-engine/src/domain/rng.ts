// One draw per new fallback action; never reseed at a focus boundary.
export function draw(state: number): { state: number; value: number } {
  const next = (Math.imul(1664525, state) + 1013904223) >>> 0;
  return { state: next, value: next / 4294967296 };
}
