/**
 * Record slides to video with the real presentation renderer.
 *
 * Run *by Electron*, not by node: `electron scripts/record-slides.cjs <job.json>`.
 * Like capture-slides.cjs it loads an exported bundle, so the frames are the
 * Player's own; unlike a screen recording, no frame can be dropped. Every
 * frame in the window (the deck and each web element's page) runs on a
 * virtual clock that only moves when the recorder says so: timers,
 * animation frames, `performance.now`, Web Animations and CSS animations,
 * and video playback. The recorder advances that clock by exactly one video
 * frame, waits for the picture to settle (videos seeked, page painted),
 * captures it and pipes the pixels to ffmpeg. A slow machine records slowly;
 * it never records a stutter.
 *
 * Loading is the one thing that does not run on the virtual clock: before a
 * slide starts, time stands still until its fonts, images, videos and web
 * pages are ready, so a clip never opens on a poster or a half-loaded chart.
 *
 * Plain CommonJS on purpose: Electron runs it directly, with no build step.
 */
const { spawn } = require('node:child_process');
const { mkdirSync, readFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { app, BrowserWindow } = require('electron');

const job = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const { bundleDir, width, height, fps, segments, ffmpeg } = job;
const frameMs = 1000 / fps;

app.disableHardwareAcceleration();
// Frames are captured at exactly the requested size, whatever the display's scaling.
app.commandLine.appendSwitch('force-device-scale-factor', '1');
// A web element's sandboxed frame would otherwise get a process of its own,
// which a script registered for new documents on this page does not reach:
// its charts would keep animating in real time while the deck is frozen.
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('disable-features', 'IsolateSandboxedIframes,site-per-process');

const progress = (line) => process.stderr.write(`${line}\n`);
const debug = (line) => { if (job.debug) progress(`[record] ${line}`); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width,
    height,
    show: false,
    useContentSize: true,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  win.webContents.setFrameRate(120);
  // A renderer that dies leaves every executeJavaScript waiting forever.
  win.webContents.on('render-process-gone', (_event, details) => {
    process.stderr.write(`The page's renderer stopped (${details.reason}).`);
    app.exit(1);
  });
  if (job.debug) {
    win.webContents.on('console-message', (_event, _level, message) => debug(`console: ${message}`));
  }
  const warnings = [];
  const videos = [];
  try {
    // The DevTools protocol answers only once the window has a renderer,
    // which it gets by loading something.
    await win.loadURL('about:blank');
    const dbg = win.webContents.debugger;
    dbg.attach('1.3');
    debug('debugger attached');
    await dbg.sendCommand('Page.enable');
    await dbg.sendCommand('Page.addScriptToEvaluateOnNewDocument', {
      source: `(${installVirtualClock.toString()})();`,
    });
    // Open on the first slide recorded, so nothing else is loaded first.
    debug('loading the bundle');
    await win.loadFile(join(bundleDir, 'index.html'), { hash: String(segments[0].number) });
    debug('loaded');

    let encoder = null;
    let output = null;
    let frames = 0;
    // Set when the previous segment ended by advancing straight onto this one.
    let arrived = false;
    const close = async () => {
      if (!encoder) return;
      await encoder.finish();
      videos.push({ ...output, frames, durationMs: Math.round(frames * frameMs) });
      encoder = null;
    };

    for (let s = 0; s < segments.length; s += 1) {
      const segment = segments[s];
      if (!encoder || segment.output) {
        await close();
        output = { path: segment.output ?? job.output, slides: [] };
        mkdirSync(dirname(output.path), { recursive: true });
        encoder = startEncoder(output.path);
        frames = 0;
      }
      output.slides.push(segment.number);
      if (!arrived) {
        // A clip starts on its own slide, not halfway through the Morph into
        // it: open the slide plainly first (a jump from the slide before
        // would morph), then enter it the way a presenter does, which plays
        // the builds set to run on arrival.
        await main(win, `window.__SLIDE_PLAYER__.goToSlide(${segment.index})`);
        await main(win, `window.__SLIDE_PLAYER__.goToSlide(${segment.index}, { play: true })`);
      }
      debug(`entered slide ${segment.number}`);
      await settle(win, warnings);
      debug("settled");

      for (let step = 0; ; step += 1) {
        const planned = segment.dwell[step];
        let elapsed = 0;
        let quietFor = 0;
        let status = await statusOf(win);
        for (;;) {
          if (planned !== null && planned !== undefined) {
            // Within half a frame: a step of N ms is round(N / frame) frames.
            if (elapsed >= planned - frameMs / 2) break;
          } else {
            quietFor = busy(status) ? 0 : quietFor + (elapsed === 0 ? 0 : frameMs);
            if (quietFor >= job.holdMs) break;
            if (elapsed >= job.maxStepMs) {
              warnings.push(`Slide ${segment.number}, step ${step}: still animating after `
                + `${job.maxStepMs} ms (a page that never stops, or a long video); moved on. `
                + 'Give this step a fixed time with --timing.');
              break;
            }
          }
          await encoder.write(await capture(win));
          frames += 1;
          status = await advance(win, frameMs);
          elapsed += frameMs;
        }
        progress(`slide ${segment.number} step ${step}: ${Math.round(elapsed)} ms (${frames} frames)`);

        const before = await cursor(win);
        await main(win, 'window.__SLIDE_PLAYER__.next()');
        const after = await cursor(win);
        // The page side of a click (a web element's onStep) arrives by
        // message; give it a moment of real time to land before time moves.
        await sleep(40);
        if (after.slide === segment.index && after.step !== before.step) continue;
        const next = segments[s + 1];
        arrived = Boolean(next && !next.output && after.slide === next.index);
        break;
      }
    }
    await close();
    process.stdout.write(JSON.stringify({ videos, warnings }));
    app.exit(0);
  } catch (error) {
    process.stderr.write(String((error && error.stack) || error));
    app.exit(1);
  }
});

/** Every frame of the page, the deck first: web elements are frames inside it. */
function framesOf(win) {
  try {
    return win.webContents.mainFrame.framesInSubtree;
  } catch {
    return [win.webContents.mainFrame];
  }
}

/** Run an expression on the deck's own frame, with its timers counted as the step's. */
function main(win, expression) {
  return win.webContents.mainFrame.executeJavaScript(
    `window.__deckwerkClock.run(() => ${expression})`);
}

function cursor(win) {
  return win.webContents.mainFrame.executeJavaScript('window.__SLIDE_PLAYER__.getCursor()');
}

/**
 * Call the clock in every frame; a frame that is gone or has no clock answers
 * null. A call never settles when its document goes away under it -- a frame
 * removed with its slide, or a web element's frame swapping its initial blank
 * document for the page -- so each call has a deadline. Only the document
 * that failed to answer is left out afterwards: the page that replaces a
 * blank one is asked as usual.
 */
function eachFrame(win, call, deadlineMs = FRAME_CALL_MS) {
  const live = framesOf(win).filter((frame) => !frame.detached && !unanswered.has(documentKey(frame)));
  return Promise.all(live.map((frame) => {
    const key = documentKey(frame);
    let timer;
    const deadline = new Promise((done) => {
      timer = setTimeout(() => {
        // One dead document must not cost every later frame the full wait.
        unanswered.add(key);
        debug(`no answer from ${key} to ${call}; leaving it out from now on`);
        done(null);
      }, deadlineMs);
    });
    const answer = frame
      .executeJavaScript(`window.__deckwerkClock ? window.__deckwerkClock.${call} : null`)
      .catch(() => null);
    return Promise.race([answer, deadline]).finally(() => clearTimeout(timer));
  }));
}

const unanswered = new Set();
const documentKey = (frame) => `${frame.processId}:${frame.routingId}:${frame.url}`;

/** Longer than a frame's slowest honest answer: an advance waiting on its videos' seeks. */
const FRAME_CALL_MS = 10_000;

async function advance(win, ms) {
  return eachFrame(win, `advance(${ms})`);
}

function statusOf(win) {
  return eachFrame(win, 'status()');
}

/** Is anything on the slide still moving: a build, an animation, a page drawing, a clip that ends? */
function busy(statuses) {
  return statuses.some((s) => s && (s.timers > 0 || s.animations > 0 || s.frames > 0 || s.media > 0));
}

/**
 * Hold time still until the slide can be seen as it will be presented:
 * documents loaded, fonts in, images decoded, videos showing a frame, web
 * pages revealed. Frames are still served (zero-length steps of the clock),
 * because readiness itself waits on animation frames.
 */
async function settle(win, warnings) {
  const started = Date.now();
  let readyRuns = 0;
  for (;;) {
    // Frames are still loading here, so a call into a document being replaced
    // is likely; nothing here waits on media, so a short deadline will do.
    await eachFrame(win, 'advance(0)', 2000);
    const ready = await eachFrame(win, 'ready()', 2000);
    readyRuns = ready.every((r) => r !== false) ? readyRuns + 1 : 0;
    if (readyRuns >= 3) break;
    if (Date.now() - started > job.settleTimeoutMs) {
      warnings.push(`Gave up waiting for media to load after ${job.settleTimeoutMs} ms; recorded as it was.`);
      break;
    }
    await sleep(30);
  }
  const frames = framesOf(win).filter((frame) => !frame.detached);
  const clocks = await Promise.all(frames.map((frame) => frame
    .executeJavaScript('typeof window.__deckwerkClock').catch(() => 'gone')));
  if (job.debug) {
    const statuses = await Promise.all(frames.map((frame) => frame
      .executeJavaScript('window.__deckwerkClock && window.__deckwerkClock.status()').catch(() => 'gone')));
    for (const [i, frame] of frames.entries()) debug(`frame ${frame.url}: ${JSON.stringify(statuses[i])}`);
  }
  for (const [i, frame] of frames.entries()) {
    if (clocks[i] !== 'undefined') continue;
    const message = `A frame ran without the recorder's clock, so it animates in real time: ${frame.url}`;
    if (!warnings.includes(message)) warnings.push(message);
  }
}

/** Wait for the picture to be painted, then take it. */
async function capture(win) {
  await win.webContents.mainFrame.executeJavaScript('window.__deckwerkClock.painted()');
  let image = await win.webContents.capturePage();
  const size = image.getSize();
  if (size.width !== width || size.height !== height) image = image.resize({ width, height });
  return image.toBitmap();
}

/** An ffmpeg process turning raw BGRA frames on stdin into an H.264 MP4. */
function startEncoder(path) {
  const child = spawn(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'bgra', '-s', `${width}x${height}`, '-framerate', String(fps),
    '-i', 'pipe:0',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', String(job.crf), '-pix_fmt', 'yuv420p',
    '-profile:v', 'high', '-movflags', '+faststart',
    path,
  ], { stdio: ['pipe', 'ignore', 'pipe'] });
  let errors = '';
  child.stderr.on('data', (chunk) => (errors += chunk));
  const exited = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed: ${errors.trim()}`))));
  });
  // Surfaced by write() or finish(); without a handler it would crash the run.
  exited.catch(() => {});
  return {
    async write(buffer) {
      if (!child.stdin.write(buffer)) {
        await Promise.race([new Promise((done) => child.stdin.once('drain', done)), exited]);
      }
    },
    async finish() {
      child.stdin.end();
      await exited;
    },
  };
}

/**
 * Installed in every frame before its own scripts run (and serialised from
 * here, so it must not close over anything). Replaces the page's notion of
 * time with one the recorder steps, and exposes `window.__deckwerkClock`.
 */
function installVirtualClock() {
  if (window.__deckwerkClock) return;
  const native = {
    setTimeout: window.setTimeout.bind(window),
    clearTimeout: window.clearTimeout.bind(window),
    raf: window.requestAnimationFrame.bind(window),
    perfNow: performance.now.bind(performance),
    dateNow: Date.now,
    animate: Element.prototype.animate,
    animPlay: Animation.prototype.play,
    animPause: Animation.prototype.pause,
    animFinish: Animation.prototype.finish,
    animTime: Object.getOwnPropertyDescriptor(Animation.prototype, 'currentTime'),
    animRate: Object.getOwnPropertyDescriptor(Animation.prototype, 'playbackRate'),
    mediaPause: HTMLMediaElement.prototype.pause,
    mediaPaused: Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'paused'),
    mediaTime: Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime'),
  };
  const perfStart = native.perfNow();
  const dateStart = native.dateNow();
  // Milliseconds of virtual time since this document was created.
  let now = 0;

  performance.now = () => perfStart + now;
  Date.now = () => dateStart + Math.floor(now);

  // A task boundary that is not a timer: lets promise reactions and events
  // queued by one callback run before the next, as between real tasks.
  const channel = new MessageChannel();
  const yields = [];
  channel.port1.onmessage = () => yields.shift()?.();
  const yieldTask = () => new Promise((done) => { yields.push(done); channel.port2.postMessage(0); });
  const report = (error) => native.setTimeout(() => { throw error; });

  // Timers. Those created while the recorder runs a player call (and, in
  // turn, by their own callbacks) are the step's builds; the recorder waits
  // for them before deciding a step is over.
  const timers = new Map();
  let timerId = 1;
  let order = 0;
  let tracking = false;
  const addTimer = (fn, ms, args, repeat) => {
    const id = timerId++;
    const delay = Math.max(0, Number(ms) || 0);
    timers.set(id, { id, due: now + delay, order: order++, fn, args, repeat: repeat ? Math.max(1, delay) : 0, tracked: tracking });
    return id;
  };
  window.setTimeout = (fn, ms, ...args) => addTimer(fn, ms, args, false);
  window.setInterval = (fn, ms, ...args) => addTimer(fn, ms, args, true);
  window.clearTimeout = (id) => { timers.delete(id); };
  window.clearInterval = (id) => { timers.delete(id); };
  const earliest = (limit) => {
    let first = null;
    for (const timer of timers.values()) {
      if (timer.due > limit) continue;
      if (!first || timer.due < first.due || (timer.due === first.due && timer.order < first.order)) first = timer;
    }
    return first;
  };

  // Animation frames run once per recorded frame, stamped with virtual time.
  let frames = new Map();
  let frameId = 1;
  window.requestAnimationFrame = (callback) => { const id = frameId++; frames.set(id, callback); return id; };
  window.cancelAnimationFrame = (id) => { frames.delete(id); };

  // Web Animations and CSS animations/transitions are held paused and seeked
  // to their virtual time: `base` was their time at virtual instant `anchor`.
  const animations = new Map();
  const hold = (animation, held) => {
    const time = native.animTime.get.call(animation) ?? 0;
    animations.set(animation, { base: time, anchor: now, held });
    native.animPause.call(animation);
    native.animTime.set.call(animation, time);
  };
  const adopt = () => {
    if (typeof document.getAnimations !== 'function') return;
    for (const animation of document.getAnimations()) {
      if (animations.has(animation)) continue;
      const state = animation.playState;
      if (state === 'finished' || state === 'idle') continue;
      // Found by a scan, it began since the last one, which is no virtual
      // time ago; one paused by the page (or by CSS) stays where it is.
      if (state === 'paused') hold(animation, true);
      else {
        hold(animation, false);
        native.animTime.set.call(animation, 0);
        animations.get(animation).base = 0;
      }
    }
    adoptMedia(document);
  };
  Element.prototype.animate = function animate(...args) {
    const animation = native.animate.apply(this, args);
    hold(animation, false);
    return animation;
  };
  Animation.prototype.play = function play() {
    native.animPlay.call(this);
    hold(this, false);
  };
  Animation.prototype.pause = function pause() {
    hold(this, true);
  };
  Object.defineProperty(Animation.prototype, 'currentTime', {
    configurable: true,
    get() { return native.animTime.get.call(this); },
    set(value) {
      native.animTime.set.call(this, value);
      const held = animations.get(this);
      if (held) { held.base = value ?? 0; held.anchor = now; }
    },
  });
  const syncAnimations = () => {
    for (const [animation, held] of animations) {
      const state = animation.playState;
      if (state === 'finished' || state === 'idle') { animations.delete(animation); continue; }
      if (held.held) continue;
      const rate = native.animRate.get.call(animation);
      const time = held.base + (now - held.anchor) * rate;
      const end = animation.effect ? animation.effect.getComputedTiming().endTime : Infinity;
      if ((rate > 0 && Number.isFinite(end) && time >= end) || (rate < 0 && time <= 0)) {
        native.animFinish.call(animation);
        animations.delete(animation);
      } else {
        native.animTime.set.call(animation, Math.max(0, time));
      }
    }
  };

  // Media never plays natively. `play()` records the intent; each recorded
  // frame seeks a playing element forward by exactly one frame's worth.
  const media = new Map();
  const later = (target, name) => native.setTimeout(() => target.dispatchEvent(new Event(name)));
  const stateOf = (element) => {
    let state = media.get(element);
    if (!state) { state = { playing: false }; media.set(element, state); }
    return state;
  };
  HTMLMediaElement.prototype.play = function play() {
    const state = stateOf(this);
    native.mediaPause.call(this);
    if (this.ended || (Number.isFinite(this.duration) && this.currentTime >= this.duration)) {
      native.mediaTime.set.call(this, 0);
    }
    if (!state.playing) {
      state.playing = true;
      later(this, 'play');
      later(this, 'playing');
    }
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function pause() {
    const state = stateOf(this);
    native.mediaPause.call(this);
    if (state.playing) {
      state.playing = false;
      later(this, 'pause');
    }
  };
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
    configurable: true,
    get() {
      const state = media.get(this);
      return state ? !state.playing : native.mediaPaused.get.call(this);
    },
  });
  // `autoplay` (and anything else that starts playback natively) is taken
  // over the moment the element is seen, before it has data to start with.
  const adoptMedia = (root) => {
    for (const element of root.querySelectorAll('video, audio')) {
      if (media.has(element)) continue;
      const state = stateOf(element);
      if (element.autoplay || !native.mediaPaused.get.call(element)) {
        element.autoplay = false;
        native.mediaPause.call(element);
        state.playing = true;
      }
    }
  };
  new MutationObserver(() => adoptMedia(document)).observe(document, { childList: true, subtree: true });

  const shown = (element) => new Promise((done) => {
    const timeout = native.setTimeout(done, 1500);
    const finish = () => { native.clearTimeout(timeout); done(); };
    const presented = () => {
      // A seek to the frame already showing presents nothing new, so the
      // callback may never come; the seek itself has landed by now.
      const quick = native.setTimeout(finish, 120);
      if (typeof element.requestVideoFrameCallback === 'function') {
        element.requestVideoFrameCallback(() => { native.clearTimeout(quick); finish(); });
      }
    };
    if (element.seeking) element.addEventListener('seeked', presented, { once: true });
    else presented();
  });
  const syncMedia = async (ms) => {
    const waits = [];
    for (const [element, state] of media) {
      if (!element.isConnected) {
        if (!state.playing) media.delete(element);
        continue;
      }
      if (!state.playing || ms <= 0) continue;
      const duration = element.duration;
      if (!Number.isFinite(duration) || element.readyState < 1) continue;
      let time = native.mediaTime.get.call(element) + (ms / 1000) * element.playbackRate;
      let ended = false;
      if (time >= duration) {
        if (element.loop) time %= duration;
        else { time = duration; ended = true; }
      }
      native.mediaTime.set.call(element, time);
      if (ended) {
        state.playing = false;
        later(element, 'pause');
        later(element, 'ended');
      }
      if (element instanceof HTMLVideoElement) waits.push(shown(element));
    }
    await Promise.all(waits);
  };

  const runCallback = (fn, args) => {
    try {
      if (typeof fn === 'function') fn(...args);
      else (0, eval)(String(fn));
    } catch (error) {
      report(error);
    }
  };

  window.__deckwerkClock = {
    get now() { return now; },
    /** Run `fn` now; the timers it sets count as the current step's. */
    run(fn) {
      for (const timer of timers.values()) timer.tracked = false;
      tracking = true;
      try { return fn(); } finally { tracking = false; adopt(); }
    },
    /** Move time forward by `ms` (0 serves a frame without moving it). */
    async advance(ms) {
      const target = now + ms;
      for (let guard = 0; guard < 10000; guard += 1) {
        const timer = earliest(target);
        if (!timer) break;
        now = Math.max(now, timer.due);
        if (timer.repeat) { timer.due += timer.repeat; timer.order = order++; } else timers.delete(timer.id);
        const was = tracking;
        tracking = timer.tracked;
        runCallback(timer.fn, timer.args);
        tracking = was;
        adopt();
        await yieldTask();
      }
      now = target;
      syncAnimations();
      await yieldTask();
      const due = frames;
      frames = new Map();
      for (const callback of due.values()) runCallback(callback, [perfStart + now]);
      adopt();
      syncAnimations();
      await syncMedia(ms);
      return this.status();
    },
    /** What is still in motion here, for deciding when a step has finished. */
    status() {
      let running = 0;
      for (const [animation, held] of animations) {
        if (held.held) continue;
        const end = animation.effect ? animation.effect.getComputedTiming().endTime : Infinity;
        if (Number.isFinite(end)) running += 1;
      }
      let ending = 0;
      for (const [element, state] of media) if (state.playing && !element.loop && element.isConnected) ending += 1;
      let pending = 0;
      // The deck's own builds are its step timers; a page's are any one-off
      // timer due in the next few seconds (a delayed label, say).
      const isDeck = window === window.top;
      for (const timer of timers.values()) {
        if (timer.repeat) continue;
        if (isDeck ? timer.tracked : timer.due - now <= 5000) pending += 1;
      }
      return { now, timers: pending, animations: running, frames: frames.size, media: ending };
    },
    /** Is everything this document shows loaded and on screen? */
    ready() {
      if (document.readyState !== 'complete') return false;
      if (document.fonts && document.fonts.status !== 'loaded') return false;
      for (const image of document.images) if (!image.complete) return false;
      for (const video of document.querySelectorAll('video')) {
        if ((video.currentSrc || video.getAttribute('src')) && !video.error && video.readyState < 2) return false;
      }
      if (document.querySelector('[data-web-ready="false"]')) return false;
      return true;
    },
    /** Resolves once the current state has been painted (two real frames). */
    painted() {
      return new Promise((done) => native.raf(() => native.raf(() => done(true))));
    },
  };
}
