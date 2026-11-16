import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Deck } from '@shared/deck.js';
import { exportDeck } from '../main/exportDeck.js';
import { getFfmpegPath } from '../main/ffmpeg.js';
import { tempDir } from './scratch.js';
import { runElectron } from './renderSlides.js';

/**
 * Slides played through the real player into an MP4.
 *
 * The same indirection as `render`: the deck is exported to a scratch bundle
 * and Electron runs `scripts/record-slides.cjs` against it, so the video is
 * what the projector shows — builds, Morphs, web pages and clips included.
 * The script runs every frame on a virtual clock and steps it one video
 * frame at a time, so the recording is smooth however slowly the machine
 * renders, and the same deck always records the same video.
 */

export interface RecordRequest {
  deckDir: string;
  deck: Deck;
  /** In recording order. `dwell[step]` is how long that step stays on screen, in ms; null waits for it to finish. */
  slides: Array<{ id: string; number: number; index: number; dwell: Array<number | null> }>;
  /** The MP4 for all slides, or with `each` the folder for one MP4 per slide. */
  output: string;
  each: boolean;
  width: number;
  height: number;
  fps: number;
  /** After a step has finished moving, how long it stays before the next click. */
  holdMs: number;
  /** The longest a step may run before the recorder moves on regardless. */
  maxStepMs: number;
  /** x264 quality: lower is better and larger. */
  crf: number;
  onProgress?: (line: string) => void;
}

export interface RecordedVideo {
  path: string;
  /** Slide numbers in the clip, in order. */
  slides: number[];
  frames: number;
  durationMs: number;
}

export interface RecordResult {
  videos: RecordedVideo[];
  warnings: string[];
}

export async function recordSlidesToVideo(request: RecordRequest): Promise<RecordResult> {
  const bundleDir = await tempDir('slide-agent-record-');
  try {
    await exportDeck(request.deckDir, request.deck, bundleDir);
    const jobPath = join(bundleDir, 'record-job.json');
    await writeFile(jobPath, JSON.stringify({
      bundleDir,
      output: request.output,
      width: request.width,
      height: request.height,
      fps: request.fps,
      holdMs: request.holdMs,
      maxStepMs: request.maxStepMs,
      settleTimeoutMs: 20_000,
      crf: request.crf,
      ffmpeg: getFfmpegPath(),
      debug: process.env.SLIDE_AGENT_DEBUG === '1',
      segments: request.slides.map((slide) => ({
        index: slide.index,
        number: slide.number,
        id: slide.id,
        dwell: slide.dwell,
        output: request.each ? join(request.output, `slide-${slide.number}.mp4`) : null,
      })),
    }), 'utf8');
    const stdout = await runElectron(recordScript(), jobPath, {
      timeoutMs: recordTimeoutMs(request),
      describe: (seconds) => `Recording exceeded ${seconds} seconds; record fewer slides at a time, `
        + 'or set SLIDE_AGENT_DEBUG=1 to see where it stalls.',
    }, request.onProgress);
    return JSON.parse(stdout) as RecordResult;
  } finally {
    await rm(bundleDir, { recursive: true, force: true });
  }
}

function recordScript(): string {
  return fileURLToPath(new URL('../../scripts/record-slides.cjs', import.meta.url));
}

/**
 * A ceiling generous enough for the longest recording the request allows:
 * every step running to `maxStepMs`, at a pessimistic second per frame.
 * Clicks are not known here, so a slide is budgeted ten steps.
 */
function recordTimeoutMs(request: RecordRequest): number {
  const stepMs = request.maxStepMs + request.holdMs;
  const frames = request.slides.reduce((sum, slide) => {
    const planned = slide.dwell.reduce<number>((total, ms) => total + (ms ?? stepMs), 0);
    return sum + ((Math.max(planned, 10 * stepMs) / 1000) * request.fps);
  }, 0);
  return 120_000 + frames * 1000;
}
