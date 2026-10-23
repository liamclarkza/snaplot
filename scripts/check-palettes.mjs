// Palette check (plan §5.3, §11.3 G8), ported from the visuals audit (palette.mjs, palette-run.mjs).
// Colour differences are CIEDE2000, under normal vision and the Machado 2009 colour-vision
// deficiency simulation at severity 1.0; contrast is WCAG 2.
//
// Dark palette, enforced:
//   - the first 3 colours: pairwise ΔE00 >= 10 under normal vision, deutan and protan;
//   - the first 5: pairwise ΔE00 >= 7 under deutan and protan;
//   - all 8: contrast >= 3:1 against #14161f.
// Light palette: printed only (three Okabe-Ito members are below 3:1 on white, a recorded
// exception, visuals-13:light).
//
//   node scripts/check-palettes.mjs [--dark '#a,#b,…'] [--light '#a,#b,…'] [--json]
//
// The palettes are read from the library source (PALETTE_SOURCE). `--dark`/`--light` check a
// candidate instead, e.g. plan §5.3's candidate A.
//
// MODE is 'advisory' until M11 adopts a dark palette that passes: failures are printed and the
// exit code is 0. M11 switches it to 'enforce' (and updates PALETTE_SOURCE if the palettes move).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const MODE = 'advisory';
const PALETTE_SOURCE = {
  file: 'packages/snaplot/src/constants.ts',
  light: 'PALETTE_CATEGORICAL_LIGHT',
  dark: 'PALETTE_CATEGORICAL_DARK',
};
const DARK_SURFACE = '#14161f';
// White, and the light theme's #fafbfc that the audit's figures (2.17, 2.23, 2.95) use.
const LIGHT_SURFACES = ['#ffffff', '#fafbfc'];

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1].split(',').map((c) => c.trim()) : undefined;
};

// --- colour science (from the audit's palette.mjs) ---------------------------------------------
const hex = (h) => {
  const s = h.replace('#', '');
  const full = s.length === 3 ? [...s].map((c) => c + c).join('') : s;
  return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16) / 255);
};
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const delin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const MACHADO = {
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
};
const simulate = (rgb, m) => {
  const l = rgb.map(lin);
  return m.map((r) => delin(Math.min(1, Math.max(0, r[0] * l[0] + r[1] * l[1] + r[2] * l[2]))));
};
const toLab = (rgb) => {
  const [r, g, b] = rgb.map(lin);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
function deltaE2000([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hue = (b, a) => {
    const x = Math.atan2(b, a) / rad;
    return x < 0 ? x + 360 : x;
  };
  const h1p = hue(b1, a1p);
  const h2p = hue(b2, a2p);
  const dL = L2 - L1;
  const dC = C2p - C1p;
  let dh = h2p - h1p;
  if (C1p * C2p === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh / 2) * rad);
  const Lb = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hb = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hb = (hb + (hb < 360 ? 360 : -360)) / 2;
    else hb /= 2;
  }
  const T =
    1 -
    0.17 * Math.cos((hb - 30) * rad) +
    0.24 * Math.cos(2 * hb * rad) +
    0.32 * Math.cos((3 * hb + 6) * rad) -
    0.2 * Math.cos((4 * hb - 63) * rad);
  const dT = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const SC = 1 + 0.045 * Cbp;
  const SH = 1 + 0.015 * Cbp * T;
  const RT = -Math.sin(2 * dT * rad) * RC;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}
const luminance = (rgb) => {
  const [r, g, b] = rgb.map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [x, y] = [luminance(hex(a)), luminance(hex(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

/** The closest pair among the first n colours under a vision mode. */
function closestPair(palette, n, vision) {
  const colours = palette.slice(0, n).map((c) => {
    const rgb = hex(c);
    return toLab(vision === 'normal' ? rgb : simulate(rgb, MACHADO[vision]));
  });
  let best = { deltaE: Number.POSITIVE_INFINITY, pair: '' };
  for (let i = 0; i < colours.length; i++)
    for (let j = i + 1; j < colours.length; j++) {
      const deltaE = deltaE2000(colours[i], colours[j]);
      if (deltaE < best.deltaE) best = { deltaE, pair: `${palette[i]} ~ ${palette[j]}` };
    }
  return best;
}

/** The §5.3 rules for the dark palette. */
function darkRules(palette) {
  const rules = [];
  for (const vision of ['normal', 'deutan', 'protan']) {
    const { deltaE, pair } = closestPair(palette, 3, vision);
    rules.push({ rule: `first 3, ${vision}: ΔE00 >= 10`, value: deltaE, ok: deltaE >= 10, pair });
  }
  for (const vision of ['deutan', 'protan']) {
    const { deltaE, pair } = closestPair(palette, 5, vision);
    rules.push({ rule: `first 5, ${vision}: ΔE00 >= 7`, value: deltaE, ok: deltaE >= 7, pair });
  }
  for (const colour of palette.slice(0, 8)) {
    const ratio = contrast(colour, DARK_SURFACE);
    rules.push({
      rule: `${colour} on ${DARK_SURFACE}: contrast >= 3`,
      value: ratio,
      ok: ratio >= 3,
      pair: '',
    });
  }
  return rules;
}

async function sourcePalettes() {
  const dir = mkdtempSync(join(tmpdir(), 'snaplot-palettes-'));
  try {
    const outfile = join(dir, 'palettes.mjs');
    await build({
      stdin: {
        contents: `export { ${PALETTE_SOURCE.light} as light, ${PALETTE_SOURCE.dark} as dark } from ${JSON.stringify(join(repo, PALETTE_SOURCE.file))};`,
        resolveDir: repo,
        loader: 'ts',
      },
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      outfile,
      logLevel: 'silent',
    });
    const { light, dark } = await import(pathToFileURL(outfile).href);
    return { light: [...light], dark: [...dark] };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const source = await sourcePalettes();
const light = option('--light') ?? source.light;
const dark = option('--dark') ?? source.dark;
const results = darkRules(dark);
const failed = results.filter((r) => !r.ok);

if (args.includes('--json')) {
  console.log(
    JSON.stringify(
      {
        mode: MODE,
        dark,
        light,
        rules: results,
        lightContrast: Object.fromEntries(
          LIGHT_SURFACES.map((bg) => [bg, light.map((c) => [c, contrast(c, bg)])]),
        ),
      },
      null,
      2,
    ),
  );
} else {
  console.log(
    `Dark palette (${option('--dark') ? '--dark' : PALETTE_SOURCE.dark}): ${dark.join(' ')}`,
  );
  for (const r of results)
    console.log(
      `  ${r.ok ? 'ok  ' : 'FAIL'} ${r.rule.padEnd(36)} ${r.value.toFixed(2)}${r.pair ? `  (${r.pair})` : ''}`,
    );
  console.log(
    `Light palette (${option('--light') ? '--light' : PALETTE_SOURCE.light}), informational:`,
  );
  for (const bg of LIGHT_SURFACES)
    console.log(
      `  contrast on ${bg}: ${light.map((c) => `${c} ${contrast(c, bg).toFixed(2)}`).join(', ')}`,
    );
  for (const vision of ['normal', 'deutan', 'protan']) {
    const first3 = closestPair(light, 3, vision);
    const first5 = closestPair(light, 5, vision);
    console.log(
      `  ${vision.padEnd(6)} closest of first 3: ${first3.deltaE.toFixed(1)}, of first 5: ${first5.deltaE.toFixed(1)}`,
    );
  }
}

if (failed.length > 0) {
  const verdict = `${failed.length} dark-palette rule(s) fail`;
  if (MODE === 'enforce') {
    console.error(`check-palettes: ${verdict}.`);
    process.exit(1);
  }
  console.log(`check-palettes: ${verdict} (advisory until M11 adopts a passing dark palette).`);
} else {
  console.log('check-palettes: the dark palette passes every rule.');
}
