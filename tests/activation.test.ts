import { describe, expect, it, vi } from 'vitest';
import { whenActivated } from '../src/lib/activation';

function makeFakeDocument(prerendering: boolean) {
  const target = new EventTarget();
  return Object.assign(target, { prerendering }) as unknown as Document;
}

describe('whenActivated', () => {
  it('invokes callback immediately when document is not prerendering', () => {
    const doc = makeFakeDocument(false);
    const fn = vi.fn();
    whenActivated(fn, doc);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('waits for prerenderingchange and invokes callback only once', () => {
    const doc = makeFakeDocument(true);
    const fn = vi.fn();
    whenActivated(fn, doc);
    expect(fn).not.toHaveBeenCalled();

    doc.dispatchEvent(new Event('prerenderingchange'));
    expect(fn).toHaveBeenCalledTimes(1);

    doc.dispatchEvent(new Event('prerenderingchange'));
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
