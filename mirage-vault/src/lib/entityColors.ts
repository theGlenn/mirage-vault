export const BASE_ENTITY_TYPE_ORDER = ['EMAIL', 'PERSON', 'ORG', 'AMT', 'PHONE', 'API_KEY'] as const;

const BUILTIN_ENTITY_COLORS: Record<string, string> = {
  EMAIL: '37 99 235',
  PERSON: '22 163 74',
  ORG: '234 88 12',
  AMT: '220 38 38',
  PHONE: '147 51 234',
  API_KEY: '107 114 128'
};

const CUSTOM_COLOR_SATURATION = 72;
const CUSTOM_COLOR_LIGHTNESS = 46;
const HUE_STEP = 37;

export function normalizeEntityTypeName(type: string): string {
  return type
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^A-Z0-9_]/g, '');
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
}

function hslToRgbTriplet(h: number, s: number, l: number): string {
  const c = (1 - Math.abs((2 * l / 100) - 1)) * (s / 100);
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = (l / 100) - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return `${Math.round((r + m) * 255)} ${Math.round((g + m) * 255)} ${Math.round((b + m) * 255)}`;
}

function colorForHue(hue: number): string {
  return hslToRgbTriplet(hue, CUSTOM_COLOR_SATURATION, CUSTOM_COLOR_LIGHTNESS);
}

export function createEntityTypeColorMap(types: string[]): Map<string, string> {
  const map = new Map<string, string>();
  const usedColors = new Set<string>();

  // Reserve and register builtin colors so custom types never reuse them.
  for (const [type, color] of Object.entries(BUILTIN_ENTITY_COLORS)) {
    map.set(type, color);
    usedColors.add(color);
  }

  const customTypes = Array.from(
    new Set(
      types
        .map(normalizeEntityTypeName)
        .filter((type) => type.length > 0 && !BUILTIN_ENTITY_COLORS[type])
    )
  ).sort((a, b) => a.localeCompare(b));

  for (const type of customTypes) {
    let hue = hashString(type) % 360;
    let candidate = colorForHue(hue);
    let attempts = 0;

    while (usedColors.has(candidate) && attempts < 360) {
      hue = (hue + HUE_STEP) % 360;
      candidate = colorForHue(hue);
      attempts++;
    }

    // Last-resort fallback with lightness jitter in extremely dense color sets.
    if (usedColors.has(candidate)) {
      let lightness = 38 + (hashString(`L:${type}`) % 22);
      let fallbackAttempts = 0;
      while (usedColors.has(candidate) && fallbackAttempts < 50) {
        candidate = hslToRgbTriplet(hue, CUSTOM_COLOR_SATURATION, lightness);
        lightness = 38 + ((lightness + 7) % 22);
        fallbackAttempts++;
      }
    }

    map.set(type, candidate);
    usedColors.add(candidate);
  }

  return map;
}
