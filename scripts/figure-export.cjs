/**
 * The browser half of `slide-agent figure` (src/cli/figureCli.ts): measures
 * what a figure's labels cover, rasterises it to PNG and prints it to PDF,
 * in Chromium, as the editor does in its own page.
 *
 * Run *by Electron*: `electron scripts/figure-export.cjs <script.js> <dir>`,
 * where the script defines window.measureFigure and window.rasterizeFigure
 * (src/shared/diagram/figureRender.ts). Requests are files
 * `<dir>/req-<n>.json`, answered in order by `<dir>/res-<n>.json` (Electron
 * has no usable stdin on Windows):
 *
 *   {"cmd":"measure","svg":"…"}                   → {"ok":true,"value":{x,y,width,height}|null}
 *   {"cmd":"png","svg":"…","width":w,"height":h,"background":null|"#fff"} → {"ok":true,"value":"<base64>"}
 *   {"cmd":"pdf","html":"…"}                      → {"ok":true,"value":"<base64>"}
 *   {"cmd":"quit"}
 *
 * Plain CommonJS on purpose: Electron runs it directly, with no build step.
 */
const { existsSync, readFileSync, renameSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { app, BrowserWindow } = require('electron');

if (!app) {
  process.stderr.write(`${__filename} must run as Electron, not Node: unset ELECTRON_RUN_AS_NODE.\n`);
  process.exit(1);
}

const script = readFileSync(process.argv[2], 'utf8');
const jobDir = process.argv[3];
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');

let current = 0;

function reply(value) {
  const tmp = join(jobDir, `res-${current}.tmp`);
  writeFileSync(tmp, JSON.stringify(value));
  renameSync(tmp, join(jobDir, `res-${current}.json`));
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1200, height: 900, show: false,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  });
  const blank = join(jobDir, 'measure.html');
  writeFileSync(blank, `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><script>${script}</script></body></html>`);
  await win.loadFile(blank);

  const handle = async (request) => {
    if (request.cmd === 'measure') {
      return win.webContents.executeJavaScript(`measureFigure(${JSON.stringify(request.svg)})`);
    }
    if (request.cmd === 'png') {
      return win.webContents.executeJavaScript(
        `rasterizeFigure(${JSON.stringify(request.svg)}, ${Number(request.width)}, ${Number(request.height)}, ${JSON.stringify(request.background ?? null)})`,
      );
    }
    if (request.cmd === 'pdf') {
      const page = join(jobDir, 'figure.html');
      writeFileSync(page, request.html);
      const printer = new BrowserWindow({ show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
      try {
        await printer.loadFile(page);
        await printer.webContents.executeJavaScript('document.fonts ? document.fonts.ready.then(() => true) : true');
        const pdf = await printer.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
        return Buffer.from(pdf).toString('base64');
      } finally {
        printer.destroy();
      }
    }
    throw new Error(`unknown command ${request.cmd}`);
  };

  const started = Date.now();
  for (;;) {
    const path = join(jobDir, `req-${current}.json`);
    if (!existsSync(path)) {
      // The CLI went away without saying quit.
      if (Date.now() - started > 10 * 60_000) break;
      await new Promise((r) => setTimeout(r, 20));
      continue;
    }
    const request = JSON.parse(readFileSync(path, 'utf8'));
    if (request.cmd === 'quit') break;
    try {
      reply({ ok: true, value: await handle(request) });
    } catch (error) {
      reply({ ok: false, error: String((error && error.stack) || error) });
    }
    current += 1;
  }
  win.destroy();
  app.exit(0);
}).catch((error) => {
  process.stderr.write(`${String((error && error.stack) || error)}\n`);
  app.exit(1);
});
