/**
 * draw.io label reference generator
 * =================================
 *
 * Lays out a matrix of labels with the REAL draw.io code and records where
 * draw.io put them, for test/diagramLabel.test.ts. Unlike
 * scripts/drawio-reference.mts (whole `.drawio` fixtures at scale 1), this
 * covers every labelPosition × verticalLabelPosition × align × verticalAlign
 * combination, spacing, horizontal=0, rotation, labelWidth, overflow modes,
 * the shapes with label margins and edge labels, at view scales 1, 2 and
 * 1.5, in model coordinates as draw.io's editor and viewer paint
 * (mxGraphView.modelCoordinates). For a subset it also records the label's
 * SVG node (mxText.node), to compare the painted markup.
 *
 *   npx vite-node --config vitest.config.ts scripts/drawio-label-reference.mts -- [--drawio <webapp>]
 *
 * --drawio defaults to env DRAWIO_WEBAPP, else C:/Users/kallo/tools/drawio/src/main/webapp.
 * Writes test/fixtures/drawio-labels/label-bounds.reference.json.
 */

import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runElectronScript } from '../test/support/drawioReference.js';

const DEFAULT_WEBAPP = 'C:/Users/kallo/tools/drawio/src/main/webapp';
const BUNDLES = ['js/app.min.js', 'js/stencils.min.js', 'js/shapes-14-6-5.min.js'];
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../test/fixtures/drawio-labels/label-bounds.reference.json');

interface LabelCase {
  kind: 'vertex' | 'edge';
  style: string;
  value: string;
  /** Vertex size in draw.io units (edges run from (100,100) to (300,200)). */
  w: number;
  h: number;
  scale: number;
  /** Record the painted SVG node too. */
  markup?: boolean;
}

const H = 'html=1;whiteSpace=wrap;';
const ALIGNS = ['left', 'center', 'right'];
const VALIGNS = ['top', 'middle', 'bottom'];

const SHAPES = [
  'swimlane;', 'swimlane;horizontal=0;', 'swimlane;startSize=40;', 'swimlane;flipV=1;', 'swimlane;direction=north;',
  'swimlane;direction=south;horizontal=0;', 'swimlane;startSize=0;fixedHeader=0;', 'swimlane;startSize=0;',
  'shape=process;', 'shape=process;fixedSize=1;size=20;', 'shape=process;rounded=1;', 'shape=process;horizontal=0;',
  'shape=process;direction=north;horizontal=0;', 'shape=cube;boundedLbl=1;', 'shape=cube;boundedLbl=1;direction=south;',
  'shape=cube;boundedLbl=1;flipH=1;', 'shape=cube;boundedLbl=1;horizontal=0;', 'shape=cube;boundedLbl=1;size=7.5;',
  'shape=cylinder;boundedLbl=1;', 'shape=cylinder3;boundedLbl=1;size=15;', 'shape=cylinder3;boundedLbl=1;lid=0;',
  'shape=document;boundedLbl=1;', 'shape=document;boundedLbl=1;horizontal=0;', 'shape=document;boundedLbl=1;direction=west;',
  'shape=note;boundedLbl=1;', 'shape=note2;boundedLbl=1;', 'shape=folder;boundedLbl=1;',
  'shape=folder;boundedLbl=1;labelInHeader=1;', 'shape=folder;boundedLbl=1;labelInHeader=1;tabPosition=left;rounded=1;',
  'shape=callout;', 'shape=callout;size=10;', 'shape=datastore;', 'shape=tape;boundedLbl=1;',
  'shape=tape;boundedLbl=1;direction=north;', 'shape=ext;double=1;', 'rhombus;double=1;', 'shape=doubleEllipse;',
  'shape=doubleEllipse;margin=5;', 'shape=umlLifeline;', 'shape=umlFrame;', 'shape=umlBoundary;', 'shape=umlControl;',
  'shape=manualInput;boundedLbl=1;', 'label;', 'rounded=0;footerSize=20;', 'shape=gitTag;', 'shape=mindmapBang;',
  'shape=mermaidOdd;', 'shape=mermaidPerson;', 'shape=umlState;boundedLbl=1;umlStateConnection=connPointRefEntry;',
  'ellipse;', 'triangle;', 'shape=step;', 'shape=card;', 'shape=hexagon;', 'shape=mxgraph.basic.rectCallout;boundedLbl=1;dy=15;',
  'shape=mxgraph.c4.person;', 'text;', 'edgeLabel;', 'icon;', 'image;', 'shape=startState;', 'shape=sortShape;double=1;',
];

function labelCases(): LabelCase[] {
  const base: Array<Omit<LabelCase, 'scale'>> = [];
  const add = (kind: 'vertex' | 'edge', style: string, extra: Partial<LabelCase> = {}) => {
    base.push({ kind, style, value: 'Label', w: 120, h: 60, ...extra });
  };
  for (const lp of ALIGNS) {
    for (const vlp of VALIGNS) {
      for (const al of ALIGNS) {
        for (const va of VALIGNS) add('vertex', `${H}labelPosition=${lp};verticalLabelPosition=${vlp};align=${al};verticalAlign=${va};`);
      }
    }
  }
  for (const al of ALIGNS) {
    for (const va of VALIGNS) {
      const a = `align=${al};verticalAlign=${va};`;
      add('vertex', `${H}${a}spacing=0;`);
      add('vertex', `${H}${a}spacing=10;`);
      add('vertex', `${H}${a}spacingTop=5;spacingLeft=7;spacingBottom=3;spacingRight=11;`);
      add('vertex', `${H}${a}spacing=2.7;spacingTop=1.9;`);
      add('vertex', `${H}${a}horizontal=0;`);
      add('vertex', `${H}${a}rotation=30;`);
      add('vertex', `${H}${a}rotation=30;horizontal=0;`);
      add('vertex', `${H}${a}labelWidth=80;`);
      add('vertex', `${H}${a}labelWidth=80;labelPosition=left;`);
      add('vertex', `${H}${a}horizontal=0;labelPosition=right;verticalLabelPosition=top;`);
      add('vertex', a);
      add('edge', `${H}${a}`);
      add('edge', `${a}spacingTop=10;spacingLeft=4;`);
      add('edge', `${H}${a}horizontal=0;`);
      add('edge', `${H}${a}labelWidth=60;`);
      // Painted markup.
      add('vertex', `${H}${a}`, { markup: true });
      add('vertex', `html=1;${a}`, { markup: true });
      add('vertex', a, { value: 'Plain one\nand two', markup: true });
      add('vertex', `${a}overflow=hidden;`, { value: 'Plain one\nand two', markup: true });
      for (const ov of ['hidden', 'fill', 'width', 'block']) add('vertex', `${H}${a}overflow=${ov};`, { markup: true });
      add('vertex', `${H}${a}textDirection=vertical-lr;`, { markup: true });
      add('vertex', `${H}${a}textDirection=vertical-rl;`, { markup: true });
      add('edge', `${H}${a}`, { markup: true });
      add('edge', `${a}labelBackgroundColor=none;`, { markup: true });
    }
  }
  for (const ov of ['fill', 'width', 'hidden', 'block', 'block;blockSpacing=1']) {
    for (const va of VALIGNS) add('vertex', `${H}overflow=${ov};verticalAlign=${va};align=left;`);
  }
  for (const sh of SHAPES) {
    add('vertex', `${sh}${H}`);
    add('vertex', `${sh}${H}verticalAlign=top;align=left;`);
  }
  add('vertex', H, { w: 0, h: 0 });
  add('vertex', `edgeLabel;${H}`, { w: 0, h: 0 });
  add('vertex', `${H}spacing=3;spacingLeft=2;`, { w: 77, h: 33 });
  add('vertex', `${H}rotation=-45;labelPosition=right;`, { w: 77, h: 33 });
  const markup = (style: string, value = 'Label') => add('vertex', style, { value, markup: true });
  markup(`${H}labelBackgroundColor=#FFF2CC;labelBorderColor=#D6B656;`);
  markup(`${H}labelBackgroundColor=#FFF2CC;labelBorderColor=#D6B656;labelPadding=4;`);
  markup(`${H}labelBackgroundColor=#FFF2CC;labelBorderColor=#D6B656;labelBorderWidth=3;labelPadding=2 6;`);
  markup(`${H}labelBackgroundColor=#FFF2CC;overflow=hidden;labelPadding=4;`);
  markup(`${H}labelBackgroundColor=#FFF2CC;overflow=fill;labelBorderColor=#000000;`);
  markup(`${H}fontStyle=1;fontColor=#FF0000;fontFamily=Courier New;fontSize=16;`);
  markup(`${H}fontStyle=2;`);
  markup(`${H}fontStyle=4;`);
  markup(`${H}fontStyle=12;`);
  markup(`${H}fontStyle=31;`);
  markup(`${H}textOpacity=50;`);
  markup(`${H}textDirection=rtl;`);
  markup(`${H}textDirection=auto;`);
  markup(`${H}rotation=30;`);
  markup(`${H}horizontal=0;`);
  markup('fontStyle=15;labelBackgroundColor=#eeeeee;labelBorderColor=#333333;');
  markup('fontStyle=1;textOpacity=40;rotation=20;');
  markup('horizontal=0;', 'Vertical');
  markup('overflow=fill;labelBackgroundColor=#eeeeee;');
  markup('overflow=width;labelBackgroundColor=#eeeeee;verticalAlign=top;');
  markup('html=1;', 'a<br>b\n\n');
  markup('whiteSpace=wrap;', 'a < b & "c"\nd');
  markup('html=1;', '<b>Bold</b> <i>it</i><div><u>under</u></div>');
  markup(`swimlane;${H}`);
  markup(`shape=process;${H}`);
  for (const value of ['Label', 'Hello World', 'one\ntwo lines', 'Some longer label text']) {
    markup('labelBackgroundColor=#eeeeee;', value);
    markup('labelBackgroundColor=#eeeeee;fontStyle=1;', value);
    markup('labelBackgroundColor=#eeeeee;fontSize=16;', value);
    markup('labelBackgroundColor=#eeeeee;labelBorderColor=#000000;labelPadding=3;', value);
    markup('labelBackgroundColor=#eeeeee;labelBorderColor=#000000;labelBorderWidth=2;align=left;verticalAlign=top;', value);
  }
  const out: LabelCase[] = [];
  // Markup is recorded at scale 1: draw.io paints labels in model units, so
  // the markup does not depend on the scale.
  for (const scale of [1, 2, 1.5]) for (const c of base) if (scale === 1 || !c.markup) out.push({ ...c, scale });
  return out;
}

/** Runs in the page after draw.io's bundles (plain ES5, like draw.io). */
const HARNESS = String.raw`
window.labelReference = {
  run: function (cases) {
    mxUtils.lightDarkColorSupported = false;
    mxUtils.preferDarkColor = false;
    var results = new Array(cases.length);
    var scales = {};
    cases.forEach(function (c, i) { (scales[c.scale] = scales[c.scale] || []).push(i); });
    Object.keys(scales).forEach(function (key) {
      var container = document.createElement('div');
      container.style.cssText = 'position:absolute;left:0;top:0;width:4000px;height:4000px;overflow:hidden';
      document.body.appendChild(container);
      var graph = new Graph(container);
      graph.view.modelCoordinates = true;
      graph.view.scale = parseFloat(key);
      graph.view.translate = new mxPoint(0, 0);
      var parent = graph.getDefaultParent();
      var cells = {};
      graph.model.beginUpdate();
      try {
        scales[key].forEach(function (i) {
          var c = cases[i];
          if (c.kind == 'vertex') {
            cells[i] = graph.insertVertex(parent, null, c.value, 100, 100, c.w, c.h, c.style);
          } else {
            var geo = new mxGeometry(0, 0, 0, 0);
            geo.relative = true;
            geo.setTerminalPoint(new mxPoint(100, 100), true);
            geo.setTerminalPoint(new mxPoint(300, 200), false);
            var edge = new mxCell(c.value, geo, c.style);
            edge.edge = true;
            cells[i] = graph.addCell(edge, parent);
          }
        });
      } finally {
        graph.model.endUpdate();
      }
      scales[key].forEach(function (i) {
        var c = cases[i];
        var st = graph.view.getState(cells[i]);
        var t = st.text;
        results[i] = {
          anchor: c.kind == 'edge' ? { x: st.absoluteOffset.x, y: st.absoluteOffset.y } : null,
          bounds: t ? { x: t.bounds.x, y: t.bounds.y, width: t.bounds.width, height: t.bounds.height } : null,
          rotation: t ? t.getTextRotation() : null,
          margin: t ? { x: t.margin.x, y: t.margin.y } : null,
          svg: (t && c.markup) ? t.node.outerHTML : null
        };
      });
      container.parentNode.removeChild(container);
    });
    return results;
  }
};
`;

const MAIN = String.raw`
const { app, BrowserWindow } = require('electron');
const { readFileSync } = require('node:fs');
const { pathToFileURL } = require('node:url');
const job = JSON.parse(readFileSync(process.argv[2], 'utf8'));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1600, height: 1200, show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
  await win.loadURL(pathToFileURL(job.pagePath).href);
  const results = await win.webContents.executeJavaScript('labelReference.run(' + JSON.stringify(job.cases) + ')');
  const version = await win.webContents.executeJavaScript('EditorUi.VERSION');
  process.stdout.write(JSON.stringify({ drawio: version, electron: process.versions.electron, chromium: process.versions.chrome, platform: process.platform + '-' + process.arch, results }));
  app.exit(0);
}).catch((error) => {
  process.stderr.write(String((error && error.stack) || error) + '\n');
  app.exit(1);
});
`;

function round(value: unknown): unknown {
  if (typeof value === 'number') {
    const r = Math.round(value * 1000) / 1000;
    return Object.is(r, -0) ? 0 : r;
  }
  if (Array.isArray(value)) return value.map(round);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, round(v)]));
  }
  return value;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== '--');
  const at = args.indexOf('--drawio');
  const webapp = resolve(at >= 0 ? args[at + 1] : (process.env.DRAWIO_WEBAPP || DEFAULT_WEBAPP));
  for (const file of BUNDLES) {
    if (!existsSync(join(webapp, file))) throw new Error(`${join(webapp, file)} is missing: --drawio must name draw.io's src/main/webapp folder.`);
  }
  const work = await mkdtemp(join(tmpdir(), 'drawio-label-reference-'));
  try {
    const harnessPath = join(work, 'harness.js');
    const pagePath = join(work, 'page.html');
    const base = pathToFileURL(`${webapp.replace(/[\\/]$/, '')}/`).href;
    await writeFile(harnessPath, HARNESS, 'utf8');
    await writeFile(pagePath, [
      '<!doctype html><html><head><meta charset="utf-8">',
      `<base href="${base}">`,
      '<script>var isLocalStorage = false; var mxLoadStylesheets = false; var urlParams = {};</script>',
      `<script src="${BUNDLES[0]}"></script>`,
      '<script>mxStencilRegistry.allowEval = false;</script>',
      ...BUNDLES.slice(1).map((src) => `<script src="${src}"></script>`),
      `<script src="${pathToFileURL(harnessPath).href}"></script>`,
      '</head><body style="margin:0"></body></html>',
    ].join('\n'), 'utf8');
    const cases = labelCases();
    const run = JSON.parse(await runElectronScript(MAIN, { pagePath, cases }, { timeoutMs: 120_000 })) as {
      drawio: string; electron: string; chromium: string; platform: string; results: unknown[];
    };
    const { results, ...generator } = run;
    // Vertices are at (100, 100) in draw.io units, so their state is
    // (100 s, 100 s, w s, h s); the default value and size are left out.
    const entries = cases.map((c, i) => {
      const entry: Record<string, unknown> = { ...c, ...(round(results[i]) as Record<string, unknown>) };
      if (entry.value === 'Label') delete entry.value;
      if (entry.w === 120 && entry.h === 60) { delete entry.w; delete entry.h; }
      for (const key of ['anchor', 'svg', 'markup']) if (entry[key] == null) delete entry[key];
      return entry;
    });
    await mkdir(dirname(OUT), { recursive: true });
    const about = 'Written by scripts/drawio-label-reference.mts. Vertices are at (100, 100) draw.io units with size w x h '
      + '(default 120 x 60) and value "Label" unless given; edges run from (100, 100) to (300, 200) and anchor is their '
      + 'label point. bounds, rotation and margin are mxText.bounds, getTextRotation() and margin; svg is mxText.node, '
      + 'painted in model units.';
    const lines = entries.map((e) => JSON.stringify(e)).join(',\n');
    await writeFile(OUT, `{\n"about": ${JSON.stringify(about)},\n"generator": ${JSON.stringify(generator)},\n"cases": [\n${lines}\n]}\n`, 'utf8');
    console.log(`wrote ${entries.length} cases to ${OUT}`);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
