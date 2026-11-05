/**
 * 小型可重現隨機數工具（mulberry32）。核心與 AI 共用。
 */
export function createRng(seed = Date.now() >>> 0) {
  let a = seed >>> 0;
  const rng = function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.int = (n) => Math.floor(rng() * n);
  rng.range = (min, max) => min + rng() * (max - min);
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  rng.chance = (p) => rng() < p;
  return rng;
}

export function randomSeed() {
  return (Math.random() * 0xffffffff) >>> 0;
}

export default createRng;
