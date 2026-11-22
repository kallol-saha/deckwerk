/**
 * `slide-agent docs diagrams`: the guide (docs/agent-diagrams.md) followed by
 * a reference generated from the engine itself — shape names, stencils,
 * library entries, arrowheads, edge styles, style keys with their defaults,
 * layouts — so the lists never go stale. `--examples <dir>` also writes
 * rendered SVGs of every library entry and every arrowhead.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ConnectorEl, DiagramEl, VertexEl } from '@shared/deck.js';
import * as F from '@shared/diagram/format.js';
import { LAYOUT_PRESETS, elkOptions } from '@shared/diagram/layout.js';
import { PALETTES, itemSvg } from '@shared/diagram/library/index.js';
import { MARKER_NAMES, SHAPE_NAMES, edgeSvg } from '@shared/diagram/paint.js';
import { EDGE_SHAPES } from '@shared/diagram/shapes/index.js';
import { shippedStencilNames } from '@shared/diagram/stencil.js';
import { NAMED_STYLES, resolveStyle } from '@shared/diagram/style.js';

function fake(type: 'vertex' | 'connector', dio = ''): DiagramEl {
  const base = {
    id: `docs-${type}`, x: 0, y: 0, w: 120, h: 60, rot: 0, z: 0, opacity: 1, class: [], style: {},
    dio, label: '', cell: 'docs', diagram: 'diagram-1', parent: '1', scale: 1, origin: { x: 0, y: 0 },
  };
  return type === 'vertex'
    ? { ...base, type: 'vertex' } as VertexEl
    : { ...base, type: 'connector', source: null, target: null, points: [], sourcePoint: null, targetPoint: null, labels: [], route: [] } as ConnectorEl;
}

function propertyRow(prop: F.PropertyDef, ctx: F.PropertyContext): string {
  const def = prop.getDefaultValue ? prop.getDefaultValue(ctx) : prop.defVal;
  const shown = def === true ? '1' : def === false ? '0' : def == null || def === '' ? '—' : String(def);
  const values = prop.enumList
    ? prop.enumList.map((e) => (e.val == null ? '(unset)' : e.val)).join(' | ')
    : prop.type === 'bool' ? '0 | 1'
      : prop.type === 'color' ? '#rrggbb | none'
        : prop.type === 'numbers' ? 'numbers, e.g. "8 4"'
          : `${prop.type}${prop.min != null ? ` ≥ ${prop.min}` : ''}${prop.max != null ? ` ≤ ${prop.max}` : ''}`;
  return `| \`${prop.name}\` | ${cell(values)} | ${cell(shown)} | ${prop.dispName} |`;
}

/** Groups names by their package: `mxgraph.flowchart.document` → `mxgraph.flowchart`. */
function byPackage(names: readonly string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const name of names) {
    const parts = name.split('.');
    const key = parts.length > 1 ? parts.slice(0, -1).join('.') : '(core)';
    groups.set(key, [...(groups.get(key) ?? []), parts.length > 1 ? parts[parts.length - 1] : name]);
  }
  return new Map([...groups.entries()].sort(([a], [b]) => (a === '(core)' ? -1 : b === '(core)' ? 1 : a.localeCompare(b))));
}

export function diagramReference(): string {
  const lines: string[] = [];
  const out = (...text: string[]) => lines.push(...text);
  out('', '---', '', '# Reference (generated from DeckWerk\'s diagram engine)', '');

  out('## Commands', '', '```bash',
    '# Build from a compact spec (draw.io units, relative to the diagram origin; one transaction):',
    'slide-agent diagram add . --slide 5 \\',
    '  --vertex \'id=enc label="Encoder" style="rounded=1;fillColor=#dae8fc;strokeColor=#6c8ebf" x=40 y=40 w=140 h=60\' \\',
    '  --vertex \'id=db label="Store" shape=library:Cylinder\' \\',
    '  --edge \'id=e1 from=enc to=db label="write" style="edgeStyle=orthogonalEdgeStyle;endArrow=block;endFill=1"\' \\',
    '  --layout layered --direction right',
    '#   or --json spec.json  with {"vertices":[{id,label,style,x,y,w,h,shape,parent}], "edges":[{id,from,to,label,style,points}]}',
    '',
    '# Restyle cells (draw.io ids or element ids; * = every cell), keys draw.io sets alongside are set too:',
    'slide-agent diagram style . --slide 5 --cells enc,db --set fillColor=#d5e8d4 --set "strokeColor=#82b366;fontStyle=1"',
    'slide-agent diagram style . --slide 5 --cells e1 --set edgeStyle=elbowEdgeStyle --unset exitX,exitY',
    'slide-agent diagram style . --slide 5 --cells enc --label "Encoder<br><i>ViT-B</i>"',
    '',
    '# Lay out (draw.io\'s Arrange > Layout):',
    'slide-agent diagram layout . --slide 5 --algo layered --direction right --spacing 40 --layer-spacing 60',
    'slide-agent diagram layout . --slide 5 --algo tree --cells root,a,b,c',
    '',
    '# Reveal it cell by cell, each on a click:',
    'slide-agent diagram build . --slide 5 --order flow',
    '',
    '# Inspect, check, look:',
    'slide-agent diagram list . --slide 5',
    'slide-agent validate . --slide 5          # diagramProblems: dangling connectors, unknown shapes, …',
    'slide-agent render . --slide 5 --output /tmp/fig',
    '```', '');

  out('Spec keys — vertex: `id label style x y w h shape parent` (`shape=<name>` sets the style\'s shape,',
    '`shape=library:<title>` inserts a shape-library entry with its own style and size; `style` keys go on top).',
    'Edge: `id from to label style points parent` (`points="x,y x,y"`, draw.io units). Quote values with spaces;',
    'labels are HTML when the style has `html=1` (added unless you write `html`). Shapes without x/y go in a row',
    'to the right; `--layout` places everything anyway.', '');

  out('Dependent keys `diagram style` sets with the one you name (draw.io\'s Format panel), unless you set them too:',
    '`rotation` turns the element; `rounded` → `roundedPerimeter` (shapes), `rounded`/`curved` exclude each other',
    '(connectors); `edgeStyle` clears waypoints (`--keep-waypoints` keeps them) and `curved`/`noEdgeStyle`;',
    'a connector `shape` drops the old shape\'s sizes; `labelPosition`/`verticalLabelPosition` set `align`/',
    '`verticalAlign` to match; `fontColor=none` → `noLabel=1`; `sketch=1` → `curveFitting=1;jiggle=2`;',
    '`source/targetPerimeterSpacing` → `fixedPointSpacing=1`; `dashPattern` → `dashed=1`; `html` converts the label.',
    '`--style "<whole string>"` replaces the style as Edit Style does.', '');

  out('## Layouts', '', '| draw.io menu | --algo | --direction | engine |', '|---|---|---|---|');
  for (const p of LAYOUT_PRESETS) {
    const engine = p.algorithm === 'circle' ? 'mxCircleLayout' : `ELK ${elkOptions({ algorithm: p.algorithm })['elk.algorithm']}`;
    out(`| ${p.title} | ${p.algorithm} | ${p.direction ?? '—'} | ${engine} |`);
  }
  out('', '`--spacing` = space between shapes (draw.io units; circle: the smallest radius, default 100),',
    '`--layer-spacing` = between layers of a flow, `--cells` = only these shapes (and connectors among them),',
    '`--parent <cell>` = the children of a container, `--corners keep|straight|rounded|curved` (flows default to',
    'rounded, as draw.io does), `--at x,y` = top-left corner (default: stays where it was), `--elk key=value` =',
    'any ELK option. Containers and groups are placed as one shape; their contents move with them. Flows keep',
    'ELK\'s route as waypoints of live orthogonal connectors; trees use orthogonal stems; radial, organic and',
    'circle use straight connectors. The output reports `bounds` and warns when the result leaves the slide.',
    '', 'ELK defaults (draw.io\'s): ```' + JSON.stringify(elkOptions({ algorithm: 'layered' })) + '```', '');

  // Style keys
  const dv = NAMED_STYLES.defaultVertex;
  const de = NAMED_STYLES.defaultEdge;
  out('## Style keys', '', `Defaults every vertex starts from: \`${Object.entries(dv).map(([k, v]) => `${k}=${v}`).join(';')}\``,
    `Defaults every connector starts from: \`${Object.entries(de).map(([k, v]) => `${k}=${v}`).join(';')}\``,
    '`default` as a colour is black for lines and text, white for fills. `key=none` removes a key.', '');
  out('### Core keys', '', '| key | values | default |', '|---|---|---|');
  const core: Array<[string, string, string]> = [
    ['shape', 'a name from "Shapes" below', 'rectangle (label)'],
    ['fillColor / strokeColor / fontColor', '#rrggbb, none, default', 'default'],
    ['gradientColor', '#rrggbb, none', 'none'],
    ['gradientDirection', F.GRADIENT_DIRECTIONS.join(' | '), 'south'],
    ['strokeWidth', 'number', '1'],
    ['dashed / dashPattern', '0 | 1 / "8 8"', '0'],
    ['rounded / arcSize / absoluteArcSize', '0 | 1 / percent / 0 | 1', '0 / 20 / 0'],
    ['opacity / fillOpacity / strokeOpacity / textOpacity', '0–100', '100'],
    ['shadow / glass / sketch', '0 | 1', '0'],
    ['rotation', 'degrees', '0'],
    ['flipH / flipV', '0 | 1', '0'],
    ['direction', 'north | east | south | west', 'east'],
    ['aspect', 'fixed', '—'],
    ['fontSize / fontFamily', 'number / name', `${dv.fontSize} / ${dv.fontFamily}`],
    ['fontStyle', 'bits: 1 bold, 2 italic, 4 underline, 8 strike', '0'],
    ['align / verticalAlign', 'left|center|right / top|middle|bottom', 'center / middle'],
    ['labelPosition / verticalLabelPosition', 'left|center|right / top|middle|bottom', 'center / middle'],
    ['spacing, spacingTop/Left/Bottom/Right', 'number', '2, 0'],
    ['whiteSpace', 'wrap', '—'],
    ['html', '0 | 1 (label is HTML)', '0'],
    ['horizontal', '0 (vertical text) | 1', '1'],
    ['labelBackgroundColor / labelBorderColor', '#rrggbb, none', 'none (connectors: default)'],
    ['noLabel', '0 | 1', '0'],
    ['edgeStyle', 'see "Edge styles"', 'none (straight)'],
    ['startArrow / endArrow', 'see "Arrowheads"', `none / ${de.endArrow}`],
    ['startFill / endFill', '0 | 1', '1'],
    ['startSize / endSize', 'number', '6'],
    ['exitX, exitY / entryX, entryY', '0–1 on the box (port)', '—'],
    ['exitDx, exitDy / entryDx, entryDy', 'offset from the port', '0'],
    ['exitPerimeter / entryPerimeter', '0 | 1', '1'],
    ['jettySize', 'auto | number', 'auto'],
    ['curved', '0 | 1', '0'],
    ['flowAnimation', '0 | 1 (moving dashes)', '0'],
  ];
  for (const [k, v, d] of core) out(`| \`${k}\` | ${cell(v)} | ${cell(d)} |`);
  out('');

  for (const [title, el] of [['Vertex properties', fake('vertex', 'shape=rectangle;rounded=1;shadow=1;sketch=1;multiple=1')], ['Connector properties', fake('connector', 'edgeStyle=orthogonalEdgeStyle;curved=1;flowAnimation=1;flowAnimationType=ring;sketch=1;shadow=1')]] as const) {
    const props = F.cellProperties([el]);
    const ctx = F.propertyContext([el]);
    out(`### ${title} (draw.io's Property list)`, '', '| key | values | default | name |', '|---|---|---|---|');
    for (const prop of props) out(propertyRow(prop, ctx));
    out('');
  }
  out('### Shape-specific keys', '');
  for (const [shape, props] of Object.entries(F.SHAPE_PROPERTIES)) {
    const ctx: F.PropertyContext = { style: resolveStyle(`shape=${shape}`, 'vertex'), vertices: 1, edges: 0 };
    const names = props.filter((p) => p.type !== 'separator').map((p) => {
      const def = p.getDefaultValue ? p.getDefaultValue(ctx) : p.defVal;
      return `\`${p.name}\`${def == null || def === '' ? '' : `=${def === true ? 1 : def === false ? 0 : def}`}`;
    });
    if (names.length > 0) out(`- **${shape}**: ${[...new Set(names)].join(', ')}`);
  }
  out('');

  out('### Named styles', '', 'A token without `=` merges a named style: ' + Object.keys(NAMED_STYLES).map((n) => `\`${n}\``).join(', ') + '.', '');

  out('## Edge styles', '', '| Waypoints menu | keys |', '|---|---|');
  for (const choice of F.EDGE_STYLES) out(`| ${choice.title} | \`${choice.changes.filter(([, v]) => v != null).map(([k, v]) => `${k}=${v}`).join(';') || '(no edgeStyle)'}\` |`);
  out('', 'Also `edgeStyle=segmentEdgeStyle`, `loopEdgeStyle`, `sideToSideEdgeStyle`, `topToBottomEdgeStyle`.',
    '', 'Connector shapes (`shape=`): ' + EDGE_SHAPES.map((s) => `\`${s}\``).join(', ') + '.', '');

  out('## Arrowheads', '', `\`startArrow\`/\`endArrow\` (${MARKER_NAMES.length}): ` + ['none', ...MARKER_NAMES].map((m) => `\`${m}\``).join(', ') + '.',
    'Filled or open with `startFill`/`endFill` (0 open, 1 filled) where the marker has a fill.', '');

  out('## Label positions', '', '| position | labelPosition | verticalLabelPosition | align | verticalAlign |', '|---|---|---|---|---|');
  for (const [name, [lp, vlp, a, va]] of Object.entries(F.LABEL_POSITIONS)) out(`| ${F.LABEL_POSITION_TITLES[name as F.LabelPosition]} | ${lp} | ${vlp} | ${a} | ${va} |`);
  out('');

  out('## Shapes', '', `Shape classes (${SHAPE_NAMES.length}), by package — write \`shape=<package>.<name>\`, or the bare name for (core):`, '');
  for (const [pkg, names] of byPackage(SHAPE_NAMES)) out(`- **${pkg}**: ${names.join(', ')}`);
  const stencils = shippedStencilNames();
  out('', `XML stencils (${stencils.length}), by package — \`shape=<package>.<name>\`:`, '');
  for (const [pkg, names] of byPackage(stencils)) out(`- **${pkg}**: ${names.join(', ')}`);
  out('');

  out('## Shape library', '', 'Insert one with `diagram add --vertex \'shape=library:<title or id>\'` (exact title, else the best search match).', '');
  for (const palette of PALETTES) {
    out(`### ${palette.title}`, '');
    for (const item of palette.items) {
      const top = item.cells.filter((c) => c.parent == null);
      const style = top.length === 1 && item.cells.length === 1 ? top[0].style : `(${item.cells.length} cells)`;
      out(`- \`${item.id}\` **${item.title || '(untitled)'}** ${item.width}×${item.height}: \`${style}\``);
    }
    out('');
  }
  return lines.join('\n');
}

/** Rendered examples: one SVG per library entry and per arrowhead, plus an index.html. */
export async function writeDiagramExamples(dir: string): Promise<number> {
  await mkdir(join(dir, 'library'), { recursive: true });
  await mkdir(join(dir, 'arrows'), { recursive: true });
  let count = 0;
  const cards: string[] = [];
  for (const palette of PALETTES) {
    for (const item of palette.items) {
      const file = `library/${item.id}.svg`;
      await writeFile(join(dir, file), itemSvg(item, { width: 120, height: 90, border: 4 }), 'utf8');
      cards.push(`<figure><img src="${file}" alt=""><figcaption>${item.id}<br>${escapeHtml(item.title)}</figcaption></figure>`);
      count++;
    }
  }
  for (const marker of MARKER_NAMES) {
    for (const fill of ['1', '0']) {
      const style = resolveStyle(`endArrow=${marker};endFill=${fill};startArrow=none;strokeWidth=1.5;endSize=10;`, 'edge');
      const body = edgeSvg(style, [{ x: 10, y: 20 }, { x: 110, y: 20 }]);
      const file = `arrows/${marker}-${fill}.svg`;
      await writeFile(join(dir, file), `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40" viewBox="0 0 120 40">${body}</svg>`, 'utf8');
      cards.push(`<figure><img src="${file}" alt=""><figcaption>endArrow=${marker}<br>endFill=${fill}</figcaption></figure>`);
      count++;
    }
  }
  await writeFile(join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Diagram examples</title>
<style>body{font:12px system-ui;display:flex;flex-wrap:wrap;gap:8px}figure{margin:0;width:130px;text-align:center}img{border:1px solid #ddd;background:#fff}</style>
${cards.join('\n')}\n`, 'utf8');
  return count;
}

/** A Markdown table cell: pipes escaped. */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|');
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
