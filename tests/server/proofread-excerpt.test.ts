import { describe, expect, it } from 'vitest';
import {
  CONTEXT_MARK,
  excerpt,
} from '../../server/thei/ai/templates/sources/proofread';

/**
 * A proofreading batch shows a text's paragraphs not proofread yet, with the
 * one around each to read them by — marked as proofread already, so a model
 * fixes nothing there — and the rest left out.
 */
describe('a proofreading excerpt', () => {
  const parts = ['One.', 'Two.', 'Three.', 'Four.', 'Five.'];

  it('marks the paragraphs shown only around those given', () => {
    expect(excerpt(parts, new Set([2])).split('\n\n')).toEqual([
      '…',
      `${CONTEXT_MARK}\nTwo.`,
      'Three.',
      `${CONTEXT_MARK}\nFour.`,
      '…',
    ]);
  });

  it('shows a whole text given whole without a mark', () => {
    expect(excerpt(parts, new Set([0, 1, 2, 3, 4]))).not.toContain(
      CONTEXT_MARK,
    );
  });
});
