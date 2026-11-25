/**
 * Runs `fn` when the document is active: immediately on normal navigations,
 * or once on `prerenderingchange` for Speculation Rules prerendered pages.
 */
export function whenActivated(fn: () => void, doc: Document = document): void {
  if ((doc as Document & { prerendering?: boolean }).prerendering) {
    doc.addEventListener('prerenderingchange', () => fn(), { once: true });
  } else {
    fn();
  }
}
