import type { Slide } from '@shared/deck.js';
import { applyParagraphVisibility } from '@shared/paragraphs.js';
import type { SlideState } from '@shared/timeline.js';
import { curvedShadowClasses } from '@shared/shapeShadow.js';
import { applyTermStates } from './equationBuilds.js';
import { applyCodeLineState } from './codeRender.js';
import { syncConnectorFlow } from './diagramMotion.js';

/**
 * Apply the resolved, motion-free endpoint of one build state.
 *
 * The player, presenter preview, and PDF renderer use this same function. This
 * keeps visibility, paragraph builds, and build classes identical everywhere.
 */
export function applyStaticSlideState(
  stage: ParentNode,
  slide: Slide,
  state: SlideState,
): void {
  applyParagraphVisibility(stage, state);
  applyTermStates(stage, slide, state);
  applyCodeLineState(stage, slide, state);
  const nodes = new Map(
    [...stage.querySelectorAll<HTMLElement>('[data-element-id]')]
      .map((node) => [node.dataset.elementId ?? '', node] as const),
  );
  for (const element of slide.elements) {
    const node = nodes.get(element.id);
    if (!node) continue;
    const visible = state.visible.has(element.id);
    node.style.visibility = visible ? 'visible' : 'hidden';
    node.style.pointerEvents = visible ? '' : 'none';
    // An `opacity` build's fade, on top of the element's own opacity.
    const factor = state.opacity?.get(element.id);
    node.style.opacity = String(factor === undefined ? element.opacity : element.opacity * factor);
    // A connector's flow, as its style says or a `flow` build left it.
    if (element.type === 'connector') syncConnectorFlow(node, element, state.flowing?.get(element.id));
    node.className = [
      'element',
      `element-${element.type}`,
      ...(state.classes.get(element.id) ?? element.class),
      ...curvedShadowClasses(element.style),
    ].join(' ');
  }
}
