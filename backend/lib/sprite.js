// Generated from frontend/src/chimera/nft-meta.ts. Rebuild with npm run build:nft-art in frontend.
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/chimera/nft-meta.ts
var nft_meta_exports = {};
__export(nft_meta_exports, {
  ELEMENTS: () => ELEMENTS,
  LOCI: () => LOCI,
  STAGE_NAMES: () => STAGE_NAMES,
  TIERS: () => TIERS,
  rareCount: () => rareCount,
  speciesName: () => speciesName,
  spriteSvg: () => spriteSvg,
  tierOf: () => tierOf
});
module.exports = __toCommonJS(nft_meta_exports);

// src/chimera/genetics.ts
var LOCI = [
  { key: "body", name: "Body", stat: "Vitality", blurb: "Silhouette and mass" },
  { key: "pattern", name: "Pattern", stat: null, blurb: "Markings on the skin" },
  { key: "hue", name: "Pigment", stat: null, blurb: "Colour of the flesh" },
  { key: "eyes", name: "Eyes", stat: "Accuracy", blurb: "Count and shape of eyes" },
  { key: "crest", name: "Crest", stat: "Attack", blurb: "Horns, antennae, crowns" },
  { key: "limbs", name: "Limbs", stat: "Agility", blurb: "Fins, tentacles, wings" },
  { key: "aura", name: "Aura", stat: "Spirit", blurb: "Light it gives off" },
  { key: "element", name: "Element", stat: "Affinity", blurb: "Private \u2014 only the keeper sees it" }
];
var RARE = 12;
var tierOf = (v) => v >= 15 ? 3 : v >= 12 ? 2 : v >= 8 ? 1 : 0;
var TIERS = [
  { name: "Common", color: "#D9D4C3", glow: "rgba(17,17,17,0.08)", ink: "#5c5a52", on: "#111111" },
  { name: "Uncommon", color: "#3DDC97", glow: "rgba(61,220,151,0.25)", ink: "#0f8a56", on: "#111111" },
  { name: "Rare", color: "#8B5CF6", glow: "rgba(139,92,246,0.25)", ink: "#6a35e8", on: "#ffffff" },
  { name: "Mythic", color: "#FFDD00", glow: "rgba(255,221,0,0.35)", ink: "#a67c00", on: "#111111" }
];
var elementOf = (expressed) => expressed === 15 ? 3 : expressed % 3;
var ELEMENTS = [
  { name: "Ember", color: "#FF7020", ink: "#d14f00", beats: "Spore", glyph: "ember" },
  { name: "Spore", color: "#3DDC97", ink: "#0f8a56", beats: "Tide", glyph: "spore" },
  { name: "Tide", color: "#2B50F5", ink: "#2B50F5", beats: "Ember", glyph: "tide" },
  { name: "Void", color: "#8B5CF6", ink: "#6a35e8", beats: "nothing \u2014 and nothing beats it", glyph: "void" }
];
function rareCount(traits) {
  return traits.slice(0, 7).filter((v) => v >= RARE).length;
}
var SYL_A = ["Ash", "Bryo", "Cael", "Drev", "Eon", "Fen", "Gal", "Hex", "Iri", "Jun", "Kel", "Lum", "Myr", "Nox", "Ori", "Pyr"];
var SYL_B = ["a", "e", "i", "o", "u", "ae", "ia", "yo", "ei", "au", "ou", "ya", "io", "ue", "oa", "ai"];
var SYL_C = ["th", "ra", "lis", "mon", "dra", "vex", "rin", "sel", "kor", "phis", "tal", "quen", "zar", "nyx", "lume", "thar"];
function speciesName(traits) {
  const [b, p, h, e, c, l, a] = traits;
  const first = SYL_A[b + h & 15] + SYL_B[p + e & 15] + SYL_C[c + l + a & 15];
  return first.charAt(0).toUpperCase() + first.slice(1);
}
var MUTATION_P = 8 / 256;

// src/chimera/sprite.ts
var N = 32;
var INK = "#111111";
function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var HUES = [
  ["#8A9BA8", "#5E6E7A", "#B8C6D0", "#E8E2C8"],
  // slate
  ["#8FA05A", "#62733A", "#B9C884", "#F0E3A6"],
  // moss
  ["#D8C08A", "#A88E5C", "#EFDFB4", "#8A6B3D"],
  // sand
  ["#B8674A", "#86442E", "#D89174", "#F5D0A8"],
  // rust
  ["#C99A7A", "#9A6E52", "#E4C0A6", "#6B4A3A"],
  // clay
  ["#5FA39B", "#3E7570", "#8FCAC2", "#F0E8CC"],
  // teal
  ["#ABA36A", "#7D7746", "#CDC794", "#5C5634"],
  // khaki
  ["#A898C4", "#7A6C98", "#CCC0E2", "#F6EEFF"],
  // lilac
  ["#3DDC97", "#1FA46A", "#90F2C6", "#FFDD00"],
  // mint
  ["#FF4D4D", "#C42B2B", "#FF9090", "#FFDD00"],
  // red
  ["#5AC8FA", "#2A8FC4", "#A8E4FF", "#FFFFFF"],
  // sky
  ["#FF7020", "#C24D0C", "#FFA468", "#FFDD00"],
  // orange
  ["#8B5CF6", "#5F35C9", "#B89AFF", "#3DDC97"],
  // violet
  ["#FF8FC7", "#D45C98", "#FFC4E1", "#2B50F5"],
  // pink
  ["#2B50F5", "#1A33B0", "#7590FF", "#FFDD00"],
  // royal
  ["#FFDD00", "#D9A600", "#FFF27F", "#FF4D4D"]
  // mythic gold
];
var AURA = ["", "#FFDD00", "#5AC8FA", "#FF8FC7"];
var EYES = [
  { n: 2, s: 1 },
  { n: 2, s: 1 },
  { n: 2, s: 2 },
  { n: 2, s: 2 },
  { n: 2, s: 3 },
  { n: 2, s: 3, angry: true },
  { n: 1, s: 4 },
  { n: 3, s: 2 },
  { n: 2, s: 4, iris: true },
  { n: 1, s: 6 },
  { n: 4, s: 2 },
  { n: 2, s: 4, iris: true, angry: true },
  { n: 1, s: 6, iris: true },
  { n: 4, s: 2, angry: true },
  { n: 2, s: 4, iris: true, star: true },
  { n: 1, s: 6, iris: true, star: true }
];
var EMPTY = 0;
var BODY = 1;
var PART = 2;
var LINE = 3;
var Grid = class {
  col = new Array(N * N).fill(null);
  kind = new Uint8Array(N * N);
  ok(x, y) {
    return x >= 0 && y >= 0 && x < N && y < N;
  }
  get(x, y) {
    return this.ok(x, y) ? this.kind[y * N + x] : EMPTY;
  }
  set(x, y, c, k = PART) {
    if (!this.ok(x, y)) return;
    this.col[y * N + x] = c;
    this.kind[y * N + x] = k;
  }
  /** set at x and its mirror across the vertical centre line */
  setM(x, y, c, k = PART) {
    this.set(x, y, c, k);
    this.set(N - 1 - x, y, c, k);
  }
  rect(x, y, w, h, c, k = PART) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, k);
  }
  rectM(x, y, w, h, c, k = PART) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.setM(x + i, y + j, c, k);
  }
  /** wrap every filled pixel in a 1px ink outline */
  outline(c = INK) {
    const add = [];
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        if (this.get(x, y) !== EMPTY) continue;
        if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push(y * N + x);
      }
    for (const i of add) {
      this.col[i] = c;
      this.kind[i] = LINE;
    }
  }
};
function toPaths(g, ox = 0, oy = 0) {
  const by = /* @__PURE__ */ new Map();
  for (let y = 0; y < N; y++) {
    let x = 0;
    while (x < N) {
      const c = g.col[y * N + x];
      if (!c) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < N && g.col[y * N + x + w] === c) w++;
      by.set(c, (by.get(c) ?? "") + `M${x + ox} ${y + oy}h${w}v1h-${w}z`);
      x += w;
    }
  }
  return [...by.entries()];
}
var GLYPHS = {
  ember: ["..#..", ".##..", ".###.", "#####", ".###."],
  spore: ["...##", "..###", ".###.", "###..", "#...."],
  tide: ["..#..", ".###.", "#####", "#####", ".###."],
  void: ["#.#.#", ".###.", "#####", ".###.", "#.#.#"]
};
function drawBadge(g, glyph, color, x0, y0) {
  g.rect(x0, y0, 9, 9, INK, LINE);
  g.rect(x0 + 1, y0 + 1, 7, 7, color, PART);
  const ink = glyph === "tide" || glyph === "void" ? "#ffffff" : INK;
  GLYPHS[glyph]?.forEach((row, j) => [...row].forEach((ch, i) => ch === "#" && g.set(x0 + 2 + i, y0 + 2 + j, ink)));
}
function buildCreature(traits, seed, element) {
  const [bodyG, pat, hue, eyeG, crest, limbs, auraG] = traits.map((v) => Math.max(0, Math.min(15, v | 0)));
  const r = rng(seed * 2654435761 + traits.reduce((s, v, i) => s + v * (i + 7) * 131, 0));
  const [base, shade, light, accent] = HUES[hue];
  const g = new Grid();
  const fam = bodyG & 3;
  const st = bodyG >> 2;
  const H = 11 + st + (fam === 2 ? 2 : 0);
  const bottomY = 27;
  const topY = bottomY - H + 1;
  const W = 6 + st + (fam === 0 || fam === 3 ? 1 : 0);
  const hw = new Array(N).fill(0);
  for (let y = topY; y <= bottomY; y++) {
    const t = (y - topY) / (H - 1);
    let w;
    if (fam === 0) {
      w = t > 0.8 ? W : W * Math.sqrt(1 - Math.pow(1 - t / 0.8, 2));
      if (y === bottomY) w = W - 1;
    } else if (fam === 1) {
      const u = 2 * t - 1;
      w = W * Math.sqrt(Math.max(0, 1 - u * u * 0.86));
    } else if (fam === 2) {
      w = t < 0.45 ? W * Math.sqrt(1 - Math.pow((0.45 - t) / 0.45, 2)) : W;
    } else {
      w = y === topY ? W - 2 : y === topY + 1 ? W - 1 : y === bottomY ? W - 1 : W;
    }
    hw[y] = Math.max(2, Math.round(w));
  }
  const inBody = (x, y) => y >= topY && y <= bottomY && Math.abs(x - 15.5) < hw[y];
  const colTop = (x) => {
    for (let y = topY; y <= bottomY; y++) if (inBody(x, y)) return y;
    return topY;
  };
  const crestTier = tierOf(crest);
  const cMain = crestTier === 3 ? "#FFDD00" : crestTier === 2 ? hue === 9 ? "#8B5CF6" : "#FF4D4D" : crestTier === 1 ? accent : shade;
  const cInner = crestTier === 3 ? "#FF7020" : light;
  const wy = topY + Math.round(H * 0.35);
  const ay = topY + Math.round(H * 0.6);
  if (limbs === 8 || limbs === 9 || limbs === 15) {
    const angel = limbs === 15;
    const sx2 = 16 - hw[wy] + 1;
    const span = angel ? 8 : 7;
    const memb = angel ? "#FFFFFF" : limbs === 9 ? accent : shade;
    const bone = angel ? "#D9D4C3" : INK;
    for (let i = 0; i < span; i++) {
      const x = sx2 - i;
      const top = wy - 1 - Math.floor(i * (angel ? 0.8 : 0.7));
      const bot = angel ? wy + 3 - Math.floor(i / 2) + i % 2 : wy + 3 - Math.floor(i / 3) - (i % 3 === 2 ? 1 : 0);
      for (let y = top; y <= Math.max(top, bot); y++) g.setM(x, y, memb);
      if (i > 0) g.setM(x, top, bone);
      if (angel && i > 1 && i % 2 === 0) g.setM(x, Math.max(top, bot), bone);
    }
  } else if (limbs === 10 || limbs === 11) {
    const sx2 = 16 - hw[ay] + 1;
    for (let i = 0; i < 5; i++) for (let y = ay - 1; y <= ay + 3 - i; y++) g.setM(sx2 - i, y, accent);
    if (limbs === 11) {
      const b = colTop(15);
      for (let k = 1; k <= 3; k++) g.rectM(16 - (4 - k), b - k, 4 - k, 1, accent);
    }
  }
  for (let y = topY; y <= bottomY; y++)
    for (let x = 0; x < N; x++) {
      if (!inBody(x, y)) continue;
      if (fam === 2 && y === bottomY) {
        const d = x <= 15 ? 15 - x : x - 16;
        if (Math.floor(d / 2) % 2 === 1) continue;
      }
      g.set(x, y, base, BODY);
    }
  const isBody = (x, y) => g.get(x, y) === BODY;
  const belly = pat >= 1 && pat <= 3 || pat >= 12 && pat <= 14;
  if (belly) {
    for (let y = topY + Math.round(H * 0.55); y < bottomY; y++)
      for (let x = 0; x < N; x++) if (isBody(x, y) && Math.abs(x - 15.5) < hw[y] * 0.55) g.set(x, y, light, BODY + 10);
  }
  if (pat >= 4 && pat <= 7) {
    const n = 2 + (pat - 4);
    for (let k = 0; k < n; k++) {
      for (let tries = 0; tries < 12; tries++) {
        const y = topY + 2 + Math.floor(r() * (H - 4));
        const x = 16 - hw[y] + 1 + Math.floor(r() * Math.max(1, hw[y] - 2));
        if (isBody(x, y) && isBody(x + 1, y) && isBody(x, y + 1) && isBody(x + 1, y + 1)) {
          g.rectM(x, y, 2, 2, accent, BODY + 10);
          break;
        }
      }
    }
  }
  if (pat >= 8 && pat <= 11) {
    for (let y = topY + 2; y < bottomY; y += 3) {
      const len = Math.max(1, Math.round(hw[y] * (0.35 + (pat - 8) * 0.08)));
      for (let i = 0; i < len; i++) {
        const x = 16 - hw[y] + i;
        if (isBody(x, y)) g.setM(x, y, accent, BODY + 10);
      }
    }
  }
  if (pat >= 12 && pat <= 14) {
    const cy = topY + Math.round(H * 0.62);
    for (let k = 0; k < 3; k++) for (let i = 0; i <= k; i++) {
      const y = cy - 2 + k + (pat - 12);
      if (isBody(15 - i, y)) g.setM(15 - i, y, accent, BODY + 10);
    }
  }
  if (pat === 15) {
    const split = topY + Math.round(H * 0.45);
    for (let y = topY; y <= split + 1; y++)
      for (let x = 0; x < N; x++) {
        if (!isBody(x, y)) continue;
        if (y <= split || x % 2 === 0) g.set(x, y, accent, BODY + 10);
      }
  }
  const shades = [];
  for (let y = topY; y <= bottomY; y++)
    for (let x = 0; x < N; x++) {
      if (!isBody(x, y)) continue;
      const below = g.get(x, y + 1) === EMPTY;
      const right = x >= 16 && g.get(x + 1, y) === EMPTY;
      const leftLow = x <= 15 && g.get(x - 1, y) === EMPTY && y > topY + H / 2;
      if (below || right || leftLow) shades.push([x, y]);
    }
  for (const [x, y] of shades) g.set(x, y, shade, BODY);
  for (let y = topY; y < topY + 2; y++)
    for (let x = 0; x <= 15; x++) if (isBody(x, y) && g.get(x, y - 1) === EMPTY && g.get(x - 1, y) !== EMPTY) g.set(x, y, light, BODY);
  {
    const gy = topY + 2;
    const gx = 16 - Math.max(2, Math.round(hw[gy] * 0.62));
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) if (isBody(gx + dx, gy + dy)) g.set(gx + dx, gy + dy, "#FFFFFF", BODY);
  }
  const hwB = hw[bottomY];
  if (limbs === 12 || limbs === 13) {
    const cols = [2, 5, 8].slice(0, limbs === 13 ? 3 : 2).filter((k) => k < hwB + 1);
    for (const k of cols) {
      const x = 16 - k;
      g.rectM(x - 1, bottomY + 1, 2, 1, base);
      g.rectM(x - 2, bottomY + 2, 2, 1, shade);
    }
  } else {
    const fx = 16 - Math.max(2, Math.min(hwB - 1, Math.round(W * 0.5)));
    const fh = limbs >= 2 ? 2 : 1;
    g.rectM(fx - 1, bottomY + 1, 2, fh, shade);
    if (fh === 2) g.rectM(fx - 2, bottomY + 2, 1, 1, shade);
  }
  const sx = 16 - hw[ay];
  if (limbs === 4 || limbs === 5) {
    g.rectM(sx - 2, ay, 2, 2, base);
    if (limbs === 5) g.setM(sx - 3, ay + 1, "#FFFFFF");
  } else if (limbs === 6 || limbs === 7) {
    for (const [dx, dy] of [[-1, 0], [-1, 1], [-2, 0], [-2, -1], [-3, -1], [-3, -2], [-4, -2], [-4, -3]]) g.setM(sx + dx, ay + dy, base);
    g.setM(sx - 5, ay - 4, "#FFFFFF");
    g.setM(sx - 3, ay - 4, "#FFFFFF");
    if (limbs === 7) g.setM(sx - 5, ay - 2, "#FFFFFF");
  } else if (limbs === 14) {
    g.rectM(sx - 3, ay - 1, 3, 3, base);
    g.rectM(sx - 2, ay + 1, 2, 1, shade);
    g.setM(sx - 4, ay - 1, "#FFFFFF");
    g.setM(sx - 4, ay + 1, "#FFFFFF");
  }
  {
    const thw = hw[topY + 1];
    const bC = colTop(15);
    if (crest === 1) {
      g.rectM(15, bC - 2, 1, 2, "#3DDC97");
      g.rect(12, bC - 3, 3, 1, "#3DDC97");
      g.rect(17, bC - 4, 3, 1, "#3DDC97");
    } else if (crest === 2 || crest === 3) {
      const ax = 16 - Math.max(2, thw - 2);
      const b = colTop(ax);
      g.rectM(ax, b - 3, 1, 3, INK, PART);
      const bs = crest === 3 ? 3 : 2;
      g.rectM(ax - bs + 1, b - 3 - bs, bs, bs, cMain);
    } else if (crest === 4 || crest === 5) {
      const hx = 16 - Math.max(2, Math.round(thw * 0.6));
      const b = colTop(hx);
      g.rectM(hx - 1, b - 2, 2, 2, cMain);
      if (crest === 5) g.setM(hx - 1, b - 3, cMain);
    } else if (crest === 6 || crest === 7) {
      const ex = 16 - Math.max(3, thw);
      const b = colTop(ex + 1);
      const earC = crest === 7 ? cMain : base;
      for (let k = 1; k <= 4; k++) g.rectM(ex, b - k, 5 - k, 1, earC);
      g.setM(ex + 1, b - 1, "#FF8FC7");
      g.setM(ex + 1, b - 2, "#FF8FC7");
      for (let x = ex; x < ex + 4; x++) for (let y = b; y < colTop(x); y++) g.setM(x, y, earC);
    } else if (crest === 8 || crest === 9) {
      const hx = 16 - Math.max(2, Math.round(thw * 0.7));
      const b = colTop(hx);
      const path = [[0, 1], [1, 1], [0, 2], [1, 2], [-1, 3], [0, 3], [-1, 4], [0, 4], [-2, 5], [-1, 5], [-2, 6], [-3, 7]];
      const n = crest === 9 ? path.length : path.length - 1;
      path.slice(0, n).forEach(([dx, dy], i) => g.setM(hx + dx, b - dy, i >= n - 2 ? cInner : cMain));
    } else if (crest === 10 || crest === 11) {
      const spikes = [[15, crest === 11 ? 5 : 4], [12, 3], [9, 2]];
      for (const [x, h] of spikes) {
        if (Math.abs(x - 15.5) >= thw + 1) continue;
        const b = colTop(x);
        g.rectM(x - 1, b - 1, 3, 1, cMain);
        for (let k = 2; k <= h; k++) g.setM(x, b - k, k === h ? cInner : cMain);
      }
    } else if (crest === 12 || crest === 13) {
      const ax = 16 - Math.max(2, Math.round(thw * 0.5));
      const b = colTop(ax);
      const antler = crest === 13 ? cMain : "#A8743F";
      for (let k = 1; k <= 6; k++) g.setM(ax, b - k, antler);
      for (const [dx, dy] of [[-1, 3], [-2, 3], [-2, 4], [-1, 6], [-2, 6], [-3, 6], [-3, 7], [1, 5], [1, 6]]) g.setM(ax + dx, b - dy, antler);
    } else if (crest === 14) {
      const b = bC;
      const half = [3, 3, 3, 2, 2, 1, 1];
      half.forEach((h, k) => {
        for (let i = 0; i < h; i++) g.setM(15 - i, b - 1 - k, i < h - 1 && k < 4 ? "#FFDD00" : "#FF7020");
      });
      g.set(15, b - 8, "#FF7020");
    } else if (crest === 15) {
      const b = bC;
      g.rectM(12, b - 2, 4, 2, "#FFDD00");
      g.setM(12, b - 3, "#FFDD00");
      g.setM(12, b - 4, "#FFDD00");
      g.setM(15, b - 3, "#FFDD00");
      g.setM(15, b - 4, "#FFDD00");
      g.setM(15, b - 5, "#FF4D4D");
      g.setM(13, b - 2, "#2B50F5");
      g.setM(15, b - 2, "#FF4D4D");
    }
  }
  const blink = new Grid();
  let cfg = { ...EYES[eyeG] };
  let eyeY = topY + Math.max(2, Math.round(H * 0.28));
  if (cfg.n === 4 && eyeY + 7 > bottomY - 3) cfg = { n: 2, s: 2, angry: cfg.angry };
  const maxS = bottomY - 5 - eyeY;
  if (cfg.s > maxS) cfg.s = Math.max(1, maxS);
  if (cfg.n === 1 && cfg.s % 2) cfg.s = Math.max(2, cfg.s - 1);
  if (cfg.n === 1 && cfg.s < 4) cfg = { n: 2, s: Math.min(cfg.s, 3) };
  const fhw = hw[eyeY + 1];
  const irisC = hue === 8 || hue === 12 ? "#FF7020" : hue === 14 ? "#3DDC97" : accent === "#FFFFFF" ? "#2B50F5" : accent;
  const eye = (x, y, s, inward) => {
    if (s === 1) {
      g.rect(x, y, 1, 2, INK, LINE);
      return;
    }
    g.rect(x - 1, y - 1, s + 2, s + 2, INK, LINE);
    g.rect(x, y, s, s, "#FFFFFF", PART);
    const ps = s >= 3 ? 2 : 1;
    if (cfg.iris && s >= 4) {
      const is = s - 2;
      g.rect(x + 1, y + 1, is, is, irisC, PART);
      if (cfg.star && s >= 6) {
        const cx = x + (inward > 0 ? 3 : 2);
        const cy = y + 3;
        for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) g.set(cx + dx, cy + dy, INK, LINE);
      } else {
        const pp = s >= 6 ? 2 : 1;
        const px = inward > 0 ? x + 1 + is - pp : x + 1;
        g.rect(px, y + 1 + is - pp, pp, pp, INK, LINE);
        if (cfg.star) g.set(inward > 0 ? x + 1 : x + is, y + 1, "#FFFFFF", PART);
      }
      g.set(inward > 0 ? x + 1 : x + is, y + 1, "#FFFFFF", PART);
    } else {
      const px = inward > 0 ? x + s - ps : x;
      g.rect(px, y + s - ps, ps, ps, INK, LINE);
      if (ps >= 2 && s >= 3) g.set(px + (inward > 0 ? 0 : ps - 1), y + s - ps, "#FFFFFF", PART);
    }
    if (cfg.angry) g.set(inward > 0 ? x + s - 1 : x, y, INK, LINE);
    blink.rect(x - 1, y - 1, s + 2, s + 2, base, PART);
    blink.rect(x - 1, y + Math.floor(s / 2), s + 2, 1, INK, LINE);
  };
  let eyeBottom = eyeY;
  if (cfg.n === 1) {
    eye(16 - cfg.s / 2, eyeY, cfg.s, 1);
    eyeBottom = eyeY + cfg.s - 1;
  } else if (cfg.n === 2) {
    let gap = Math.max(1, Math.round(fhw * 0.22));
    while (gap > 0 && 16 - gap - cfg.s - 1 < 16 - fhw) gap--;
    const lx = 16 - gap - cfg.s;
    eye(lx, eyeY, cfg.s, 1);
    eye(16 + gap, eyeY, cfg.s, -1);
    eyeBottom = eyeY + cfg.s - 1;
  } else if (cfg.n === 3) {
    eye(15, eyeY - 1, 2, 1);
    eye(11, eyeY + 1, 2, 1);
    eye(19, eyeY + 1, 2, -1);
    eyeBottom = eyeY + 2;
  } else {
    eye(12, eyeY, 2, 1);
    eye(18, eyeY, 2, -1);
    eye(11, eyeY + 3, 2, 1);
    eye(19, eyeY + 3, 2, -1);
    eyeBottom = eyeY + 4;
  }
  const my = eyeBottom + 3;
  if (my <= bottomY - 1) {
    const mt = Math.floor(r() * 4);
    if (mt === 0) {
      g.rect(14, my, 4, 1, INK, LINE);
      g.setM(13, my - 1, INK, LINE);
    } else if (mt === 1) {
      g.rect(13, my, 6, 1, INK, LINE);
      g.rect(14, my + 1, 4, 1, INK, LINE);
      g.setM(14, my, "#FFFFFF");
    } else if (mt === 2) {
      g.rect(15, my, 2, 1, INK, LINE);
    } else if (hw[my] >= 5) {
      g.rect(12, my, 8, 1, "#FFFFFF");
      g.rect(12, my + 1, 8, 1, INK, LINE);
      g.setM(12, my, INK, LINE);
      g.rect(15, my, 2, 1, INK, LINE);
    } else g.rect(14, my, 4, 1, INK, LINE);
    if (mt === 0 || mt === 2) {
      const blushC = hue === 13 || hue === 9 ? "#FFDD00" : "#FF8FC7";
      const bx = 16 - Math.min(fhw - 2, 6);
      if (isBody(bx, my - 1) && isBody(bx + 1, my - 1)) g.rectM(bx, my - 1, 2, 1, blushC);
    }
  }
  g.outline();
  const aura = new Grid();
  const auraB = new Grid();
  const at = auraG >= 15 ? 3 : auraG >= 12 ? 3 : auraG >= 8 ? 2 : auraG >= 4 ? 1 : 0;
  const free = (x, y) => g.get(x, y) === EMPTY;
  if (auraG >= 12) {
    const two = auraG === 15;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const dx = x - 15.5;
        const dy = y - 18;
        const d = Math.hypot(dx, dy);
        const sec = Math.floor((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI) * 16);
        if (!free(x, y)) continue;
        if (d > 12.5 && d < 15.5 && sec % 2 === 0) aura.set(x, y, two ? sec % 4 === 0 ? "#FFDD00" : "#FF7020" : AURA[3]);
      }
  }
  if (auraG >= 8 && auraG <= 11 || auraG === 15) {
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const dx = x - 15.5;
        const dy = y - 18;
        const d = Math.hypot(dx, dy);
        const sec = Math.floor((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI) * 28);
        if (Math.abs(d - 14) < 0.6 && sec % 2 === 0 && free(x, y)) aura.set(x, y, auraG === 15 ? INK : AURA[2], LINE);
      }
  }
  if (auraG >= 4) {
    const spots = [[3, 5], [28, 6], [3, 19], [28, 18], [7, 11], [24, 11], [4, 27], [27, 27]];
    const n = Math.min(spots.length, 2 + (auraG & 3) + (auraG >= 12 ? 2 : 0));
    const arm = auraG >= 12 ? 2 : 1;
    const sc = auraG === 15 ? "#FF7020" : AURA[at];
    for (let k = 0; k < n; k++) {
      const [x, y] = spots[(k * 3 + seed) % spots.length];
      const tgt = k % 2 ? auraB : aura;
      const pts = [[0, 0]];
      for (let a = 1; a <= arm; a++) pts.push([a, 0], [-a, 0], [0, a], [0, -a]);
      if (pts.every(([dx, dy]) => free(x + dx, y + dy))) for (const [dx, dy] of pts) tgt.set(x + dx, y + dy, sc);
    }
  }
  for (const a of [aura, auraB]) {
    const add = [];
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        if (a.get(x, y) !== EMPTY || !free(x, y)) continue;
        const n4 = [a.get(x - 1, y), a.get(x + 1, y), a.get(x, y - 1), a.get(x, y + 1)];
        if (n4.some((k) => k === PART)) add.push(y * N + x);
      }
    for (const i of add) {
      a.col[i] = INK;
      a.kind[i] = LINE;
    }
  }
  let badge = null;
  if (element != null) {
    const e = ELEMENTS[elementOf(element)];
    badge = new Grid();
    drawBadge(badge, e.glyph, e.color, 23, 0);
  }
  return { aura, auraB, body: g, blink, badge };
}
function buildEgg(seed, hatching) {
  const r = rng(seed * 7919 + 13);
  const g = new Grid();
  const hwE = (y) => {
    const cy = 19;
    if (y <= cy) {
      const u2 = (cy - y) / 13;
      return u2 >= 1 ? 0 : 8.5 * Math.sqrt(1 - u2 * u2) * (1 - 0.2 * u2);
    }
    const u = (y - cy) / 9.6;
    return u >= 1 ? 0 : 8.5 * Math.sqrt(1 - u * u);
  };
  const hw = [];
  for (let y = 0; y < N; y++) hw[y] = Math.round(hwE(y));
  const inside = (x, y) => hw[y] > 0 && Math.abs(x - 15.5) < hw[y];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (inside(x, y)) g.set(x, y, "#FFFFFF", BODY);
  const sh = [];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (g.get(x, y) !== BODY) continue;
      if (g.get(x, y + 1) === EMPTY || x >= 16 && g.get(x + 1, y) === EMPTY || x >= 18 && g.get(x + 2, y) === EMPTY && y > 12) sh.push([x, y]);
    }
  for (const [x, y] of sh) g.set(x, y, "#D9D4C3", BODY);
  const vivid = ["#3DDC97", "#FF8FC7", "#5AC8FA", "#FF7020", "#8B5CF6", "#2B50F5"];
  const sc = vivid[Math.floor(r() * vivid.length)];
  for (let k = 0; k < 4; k++) {
    for (let t = 0; t < 10; t++) {
      const x = 9 + Math.floor(r() * 13);
      const y = 9 + Math.floor(r() * 10);
      if ([0, 1].every((dx) => [0, 1].every((dy) => g.get(x + dx, y + dy) === BODY))) {
        g.rect(x, y, 2, 2, sc, BODY);
        break;
      }
    }
  }
  for (let x = 0; x < N; x++) {
    if (inside(x, 23)) g.set(x, 23, "#FFDD00", BODY);
    if (inside(x, 24)) g.set(x, 24, "#FFDD00", BODY);
    const m = (x % 4 + 4) % 4;
    if (inside(x, 22)) g.set(x, 22, m === 1 || m === 2 ? "#FFDD00" : INK, m === 1 || m === 2 ? BODY : LINE);
    if (inside(x, 21) && (m === 1 || m === 2)) g.set(x, 21, INK, LINE);
  }
  if (hatching) {
    for (let x = 9; x <= 22; x++) {
      const y = 15 + (x % 4 === 0 ? -1 : x % 4 === 2 ? 1 : 0);
      if (inside(x, y)) g.set(x, y, INK, LINE);
      if (inside(x, y - 1) && x % 3 === 0) g.set(x, y - 1, "#FFDD00", BODY);
    }
  } else {
    const Q = [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."];
    Q.forEach((row, j) => [...row].forEach((ch, i) => ch === "#" && g.set(13 + i, 11 + j, INK, LINE)));
  }
  g.set(11, 9, "#FFFFFF", BODY);
  g.outline();
  return g;
}
var STAGE_NAMES = ["Hatchling", "Ascended", "Sovereign"];
function buildEvolution(body, stage) {
  if (!stage) return null;
  const fx = new Grid();
  const halo = stage >= 2 ? "#FFDD00" : "#FFFFFF";
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (body.get(x, y) !== EMPTY) continue;
      if (body.get(x - 1, y) || body.get(x + 1, y) || body.get(x, y - 1) || body.get(x, y + 1)) fx.set(x, y, halo, PART);
    }
  if (stage >= 2) {
    let top = N;
    for (let y = 0; y < N && top === N; y++)
      for (let x = 11; x <= 20; x++)
        if (body.get(x, y) !== EMPTY) {
          top = y;
          break;
        }
    const cy = Math.max(1, top - 6);
    const crown = new Grid();
    ["#.#.#.#", "#######", "##.#.##"].forEach(
      (row, j) => [...row].forEach((ch, i) => ch === "#" && crown.set(12 + i, cy + j, j === 1 && i === 3 ? "#FF4D4D" : "#FFDD00", PART))
    );
    crown.set(15, cy + 2, "#FFDD00", PART);
    crown.outline();
    for (let i = 0; i < N * N; i++) {
      const c = crown.col[i];
      if (c && body.kind[i] === EMPTY) {
        fx.col[i] = c;
        fx.kind[i] = crown.kind[i];
      }
    }
  }
  return fx;
}
function spriteSvg(traits, seed, stage = 0, bg = "#FFF8E7") {
  const parts = [];
  const draw = (g) => g && toPaths(g).forEach(([c, d]) => parts.push(`<path fill="${c}" d="${d}"/>`));
  if (traits && traits.length >= 7) {
    const b = buildCreature(traits.slice(0, 7), seed, null);
    draw(b.aura);
    draw(b.auraB);
    parts.push(`<g fill="${INK}" opacity="0.16"><rect x="9" y="30" width="14" height="1"/><rect x="11" y="31" width="10" height="1"/></g>`);
    draw(buildEvolution(b.body, stage));
    draw(b.body);
  } else draw(buildEgg(seed));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="512" height="512" shape-rendering="crispEdges">
<path fill="#191714" d="M0 0h48v48H0z"/>
<path fill="#FFD209" d="M2 2h44v44H2z"/>
<path fill="#322B20" d="M3 3h42v42H3z"/>
<path fill="${bg}" d="M5 8h38v34H5z"/>
<path fill="#EADBB8" d="M5 36h38v6H5z"/>
<path fill="#D8C7A3" d="M5 39h4v1H5zm34-1h4v1h-4zM15 41h3v1h-3zm14 0h5v1h-5z"/>
<path fill="#FFD209" d="M5 5h12v1H5zM39 5h4v1h-4zM5 43h4v1H5zM39 43h4v1h-4z"/>
<g transform="translate(8 8)">${parts.join("")}</g>
</svg>`;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ELEMENTS,
  LOCI,
  STAGE_NAMES,
  TIERS,
  rareCount,
  speciesName,
  spriteSvg,
  tierOf
});
