// CALA LUNA — random: a tiny seeded PRNG so the city is the same for a seed.
// Mulberry32; the seed comes from ?seed= or WORLD.seed. Every helper
// below draws from the stream in a fixed order — the city build depends
// on it, so the draws stay exactly as they are.

export function makeRng(seed) {
  let state = seed >>> 0;
  return function rng() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function range(rng, min, max) {
  return min + rng() * (max - min);
}

export function rangeInt(rng, min, max) {
  return Math.floor(range(rng, min, max + 1));
}

export function chance(rng, p) {
  return rng() < p;
}

// Fisher-Yates shuffle: returns a new array, leaves the input alone.
export function shuffle(rng, arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

// Pick one entry by weight: items are [value, weight] pairs.
export function weighted(rng, items) {
  let total = 0;
  for (const entry of items) total += entry[1];
  let roll = rng() * total;
  for (const entry of items) {
    roll -= entry[1];
    if (roll <= 0) return entry[0];
  }
  return items[items.length - 1][0];
}

// Approximately normal in [0, 1], centred on 0.5 (mean of 3 uniforms).
// Use it where a uniform spread looks wrong: most values near the middle,
// a few near the edges.
export function gauss(rng) {
  return (rng() + rng() + rng()) / 3;
}

// Bell-curve value in [min, max]: most draws land near the middle.
// Building heights use this — a skyline of mid-rises with a few towers.
export function gaussRange(rng, min, max) {
  return min + gauss(rng) * (max - min);
}

// Sample n distinct entries, in random order. Throws when the array
// cannot supply n — a silent short sample would place two landmarks
// on the same spot.
export function pickN(rng, arr, n) {
  if (n > arr.length) throw new Error(`pickN: asked for ${n} of ${arr.length}`);
  const out = arr.slice();
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rng() * (out.length - i));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out.slice(0, n);
}
