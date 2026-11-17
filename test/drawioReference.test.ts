import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  comparePngs,
  decodePng,
  encodePng,
  listDrawioFixtures,
  loadDrawioFixture,
  referenceCells,
  referenceJsonPath,
  referencePngPath,
  referenceSvgPath,
} from './support/drawioReference.js';

/**
 * The draw.io reference set is complete and consistent: every fixture has
 * the JSON, SVG and PNG that scripts/drawio-reference.mts records from
 * draw.io, and the JSON describes exactly the cells DeckWerk's reader finds.
 * When this fails after editing a fixture, regenerate the references (see
 * the header of scripts/drawio-reference.mts).
 */

const fixtures = listDrawioFixtures();

describe('draw.io reference fixtures', () => {
  it('exist', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(20);
  });

  for (const name of fixtures) {
    describe(name, () => {
      it('has a reference JSON, SVG and PNG for every page', async () => {
        expect(existsSync(referenceJsonPath(name)), `${name}.reference.json`).toBe(true);
        const { document, reference } = await loadDrawioFixture(name);
        expect(reference.fixture).toBe(`${name}.drawio`);
        expect(reference.pages.map((page) => page.index)).toEqual(document.pages.map((_, i) => i));
        for (const [i, page] of reference.pages.entries()) {
          expect(page.id).toBe(document.pages[i].id);
          expect(page.name).toBe(document.pages[i].name);
          const svg = readFileSync(referenceSvgPath(name, i), 'utf8');
          expect(svg).toMatch(/<svg[\s>]/);
          const size = /<svg[^>]*\swidth="([\d.]+)(?:px)?"[^>]*\sheight="([\d.]+)(?:px)?"/.exec(svg);
          expect(size && [Number(size[1]), Number(size[2])]).toEqual([page.svg.width, page.svg.height]);
          expect(page.svg.file).toBe(`${name}.${i}.svg`);
          const png = decodePng(readFileSync(referencePngPath(name, i)));
          expect(page.png.file).toBe(`${name}.${i}.png`);
          expect([png.width, png.height]).toEqual([page.png.width, page.png.height]);
          expect([png.width, png.height]).toEqual([
            Math.round(page.svg.width * page.png.scale),
            Math.round(page.svg.height * page.png.scale),
          ]);
        }
      });

      it('describes exactly the cells the reader finds', async () => {
        const { document, reference } = await loadDrawioFixture(name);
        for (const [i, page] of document.pages.entries()) {
          const refPage = reference.pages[i];
          expect(refPage.cells.map((cell) => cell.id).sort()).toEqual(page.cells.map((cell) => cell.id).sort());
          const byId = referenceCells(refPage);
          for (const cell of page.cells) {
            const ref = byId.get(cell.id)!;
            expect(ref.kind, cell.id).toBe(cell.kind);
            expect(ref.parent, cell.id).toBe(cell.parent);
            expect(ref.style, cell.id).toBe(cell.style);
            if (cell.kind === 'edge' && ref.state) {
              expect(ref.state.edge?.points.length, cell.id).toBeGreaterThanOrEqual(2);
            }
          }
          // Every drawn cell carries its numbers.
          const drawn = refPage.cells.filter((cell) => cell.state);
          expect(drawn.length).toBeGreaterThan(0);
          for (const cell of drawn) {
            expect(Number.isFinite(cell.state!.x) && Number.isFinite(cell.state!.width), cell.id).toBe(true);
          }
        }
      });

      it("matches the reader's geometry", async () => {
        const { document, reference } = await loadDrawioFixture(name);
        for (const [i, page] of document.pages.entries()) {
          const byId = referenceCells(reference.pages[i]);
          for (const cell of page.cells) {
            const geometry = byId.get(cell.id)!.geometry;
            if (!cell.geometry) {
              expect(geometry, cell.id).toBeNull();
              continue;
            }
            expect(geometry, cell.id).not.toBeNull();
            const g = cell.geometry;
            const round = (n: number) => Math.round(n * 1000) / 1000;
            expect([g.x, g.y, g.width, g.height].map(round), cell.id)
              .toEqual([geometry!.x, geometry!.y, geometry!.width, geometry!.height]);
            expect(g.relative, cell.id).toBe(geometry!.relative);
            expect(g.points ?? null, cell.id).toEqual(geometry!.points);
            expect(g.sourcePoint ?? null, cell.id).toEqual(geometry!.sourcePoint);
            expect(g.targetPoint ?? null, cell.id).toEqual(geometry!.targetPoint);
            expect(g.offset ?? null, cell.id).toEqual(geometry!.offset);
          }
        }
      });
    });
  }
});

describe('drawioReference PNG helpers', () => {
  it('round-trip a PNG and find no difference against itself', () => {
    const name = fixtures[0];
    const bytes = readFileSync(referencePngPath(name, 0));
    const image = decodePng(bytes);
    const again = decodePng(encodePng(image));
    expect([again.width, again.height]).toEqual([image.width, image.height]);
    expect(Buffer.from(again.data).equals(Buffer.from(image.data))).toBe(true);
    const same = comparePngs(bytes, image);
    expect(same.differing).toBe(0);
    expect(same.sizeMismatch).toBe(false);
  });

  it('count a changed block as differing', () => {
    const image = decodePng(readFileSync(referencePngPath(fixtures[0], 0)));
    const changed = { ...image, data: Uint8Array.from(image.data) };
    for (let y = 10; y < 30; y++) {
      for (let x = 10; x < 30; x++) {
        const o = (y * image.width + x) * 4;
        changed.data[o] = 255; changed.data[o + 1] = 0; changed.data[o + 2] = 255; changed.data[o + 3] = 255;
      }
    }
    const result = comparePngs(image, changed);
    expect(result.differing).toBeGreaterThan(300);
    expect(result.fraction).toBeCloseTo(result.differing / (image.width * image.height));
  });
});
