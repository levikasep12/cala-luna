// CALA LUNA — random: a tiny seeded PRNG so the city is the same for a seed.
// Mulberry32; the seed comes from ?seed= or WORLD.seed.

export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function range(rng, min, max) { return min + rng() * (max - min); }
export function rangeInt(rng, min, max) { return Math.floor(range(rng, min, max + 1)); }
export function chance(rng, p) { return rng() < p; }

// Fisher-Yates shuffle: returns a new array, leaves the input alone.
export function shuffle(rng, arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Pick one entry by weight: items are [value, weight] pairs.
export function weighted(rng, items) {
  let total = 0;
  for (const [, w] of items) total += w;
  let roll = rng() * total;
  for (const [v, w] of items) {
    roll -= w;
    if (roll <= 0) return v;
  }
  return items[items.length - 1][0];
}

// Approximately normal in [0, 1], centred on 0.5 (mean of 3 uniforms).
// Use it where a uniform spread looks wrong: most values near the middle,
// a few near the edges.
export function gauss(rng) {
  return (rng() + rng() + rng()) / 3;
}
