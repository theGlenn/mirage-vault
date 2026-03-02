// Braille patterns (U+2800–U+28FF) + block elements for a pixelated/glitch look
const BRAILLE =
  '⠁⠂⠃⠄⠅⠆⠇⠈⠉⠊⠋⠌⠍⠎⠏⠐⠑⠒⠓⠔⠕⠖⠗⠘⠙⠚⠛⠜⠝⠞⠟' +
  '⠠⠡⠢⠣⠤⠥⠦⠧⠨⠩⠪⠫⠬⠭⠮⠯⠰⠱⠲⠳⠴⠵⠶⠷⠸⠹⠺⠻⠼⠽⠾⠿' +
  '⡀⡁⡂⡃⡄⡅⡆⡇⡈⡉⡊⡋⡌⡍⡎⡏⡐⡑⡒⡓⡔⡕⡖⡗⡘⡙⡚⡛⡜⡝⡞⡟' +
  '⡠⡡⡢⡣⡤⡥⡦⡧⡨⡩⡪⡫⡬⡭⡮⡯⡰⡱⡲⡳⡴⡵⡶⡷⡸⡹⡺⡻⡼⡽⡾⡿' +
  '⢀⢁⢂⢃⢄⢅⢆⢇⢈⢉⢊⢋⢌⢍⢎⢏⢐⢑⢒⢓⢔⢕⢖⢗⢘⢙⢚⢛⢜⢝⢞⢟' +
  '⢠⢡⢢⢣⢤⢥⢦⢧⢨⢩⢪⢫⢬⢭⢮⢯⢰⢱⢲⢳⢴⢵⢶⢷⢸⢹⢺⢻⢼⢽⢾⢿' +
  '⣀⣁⣂⣃⣄⣅⣆⣇⣈⣉⣊⣋⣌⣍⣎⣏⣐⣑⣒⣓⣔⣕⣖⣗⣘⣙⣚⣛⣜⣝⣞⣟' +
  '⣠⣡⣢⣣⣤⣥⣦⣧⣨⣩⣪⣫⣬⣭⣮⣯⣰⣱⣲⣳⣴⣵⣶⣷⣸⣹⣺⣻⣼⣽⣾⣿';

const GLITCH_CHARS = BRAILLE + '░▒▓█▌▐▀▄';

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
}

function nextSeed(s: number): number {
  s ^= s << 13;
  s ^= s >>> 17;
  s ^= s << 5;
  return s;
}

/**
 * Generate a deterministic glitch string from a seed.
 * Same seed always produces the same output (no flicker on re-render).
 */
export function generateGlitchText(seed: string, length: number): string {
  const clamped = Math.max(4, Math.min(length, 32));
  let s = hashString(seed) || 0x9e3779b9;
  let output = '';
  for (let i = 0; i < clamped; i++) {
    s = nextSeed(s);
    output += GLITCH_CHARS[Math.abs(s) % GLITCH_CHARS.length];
  }
  return output;
}

/**
 * Generate a single frame of the decode animation.
 * Characters resolve left-to-right as progress goes from 0 to 1.
 * The leading edge flickers between the target character and random glitch chars.
 */
export function generateDecodingFrame(
  target: string,
  progress: number,
  frameIndex: number,
): string {
  const len = target.length;
  const lockedCount = Math.floor(progress * len);
  let result = '';
  let s = hashString(`${target}:${frameIndex}`) || 0xdeadbeef;

  for (let i = 0; i < len; i++) {
    if (i < lockedCount) {
      result += target[i];
    } else if (i === lockedCount && progress > 0) {
      s = nextSeed(s);
      const roll = Math.abs(s) % 4;
      result += roll === 0
        ? target[i]
        : GLITCH_CHARS[Math.abs(s) % GLITCH_CHARS.length];
    } else {
      s = nextSeed(s);
      result += GLITCH_CHARS[Math.abs(s) % GLITCH_CHARS.length];
    }
  }
  return result;
}

export interface GlitchAnimationState {
  displayText: string;
  phase: 'masked' | 'decoding' | 'decoded';
}

export class GlitchAnimator {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private frameIndex = 0;
  private startTime = 0;

  private static readonly DECODE_DURATION_MS = 600;
  private static readonly FRAME_INTERVAL_MS = 40; // ~25fps

  startDecode(
    target: string,
    onFrame: (state: GlitchAnimationState) => void,
  ): void {
    this.stop();
    this.frameIndex = 0;
    this.startTime = performance.now();

    this.intervalId = setInterval(() => {
      const elapsed = performance.now() - this.startTime;
      const raw = Math.min(elapsed / GlitchAnimator.DECODE_DURATION_MS, 1.0);
      this.frameIndex++;

      if (raw >= 1.0) {
        this.stop();
        onFrame({ displayText: target, phase: 'decoded' });
        return;
      }

      // Ease-out: characters lock in faster toward the end
      const eased = 1 - Math.pow(1 - raw, 2);
      const frame = generateDecodingFrame(target, eased, this.frameIndex);
      onFrame({ displayText: frame, phase: 'decoding' });
    }, GlitchAnimator.FRAME_INTERVAL_MS);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
