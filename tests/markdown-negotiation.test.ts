import { describe, expect, it } from 'vitest';
import markdownNegotiation from '../netlify/edge-functions/markdown-negotiation';

function makeContext(rewriteResponse: Response, nextResponse: Response) {
  return {
    rewrite: async () => rewriteResponse,
    next: async () => nextResponse,
  };
}

const markdownRequest = (pathname: string) =>
  new Request(`https://frontend.rocks${pathname}`, { headers: { accept: 'text/markdown' } });

describe('markdown negotiation edge function', () => {
  it('falls back to the HTML page when the Markdown twin does not exist (404)', async () => {
    const next = new Response('html');
    const res = await markdownNegotiation(
      markdownRequest('/concepts/css-stacking-context/'),
      makeContext(new Response('', { status: 404 }), next)
    );
    expect(res).toBe(next);
    expect(await res.text()).toBe('html');
  });

  it('serves the twin as text/markdown when it exists', async () => {
    const res = await markdownNegotiation(
      markdownRequest('/concepts/fixture-concept-a/'),
      makeContext(new Response('# Twin'), new Response('html'))
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/markdown');
    expect(await res.text()).toBe('# Twin');
  });

  it('ignores requests that do not ask for Markdown', async () => {
    const next = new Response('html');
    const res = await markdownNegotiation(
      new Request('https://frontend.rocks/concepts/fixture-concept-a/'),
      makeContext(new Response('# Twin'), next)
    );
    expect(res).toBe(next);
  });

  it('keeps the upstream Vary tokens and adds Accept', async () => {
    const res = await markdownNegotiation(
      markdownRequest('/concepts/fixture-concept-a/'),
      makeContext(
        new Response('# Twin', { headers: { Vary: 'Accept-Encoding' } }),
        new Response('html')
      )
    );
    expect(res.headers.get('Vary')).toBe('Accept-Encoding, Accept');
  });

  it('does not repeat Accept when the upstream Vary already has it', async () => {
    const res = await markdownNegotiation(
      markdownRequest('/concepts/fixture-concept-a/'),
      makeContext(
        new Response('# Twin', { headers: { Vary: 'accept, Accept-Encoding' } }),
        new Response('html')
      )
    );
    expect(res.headers.get('Vary')).toBe('accept, Accept-Encoding');
  });

  it('sets Vary: Accept when the upstream response has none', async () => {
    const res = await markdownNegotiation(
      markdownRequest('/concepts/fixture-concept-a/'),
      makeContext(new Response('# Twin'), new Response('html'))
    );
    expect(res.headers.get('Vary')).toBe('Accept');
  });
});
