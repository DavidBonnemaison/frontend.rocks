interface EdgeContext {
  next: () => Promise<Response>;
  rewrite: (url: string) => Promise<Response>;
}

const NEGOTIABLE_ROUTE_RE = /^\/(concepts|autopsies|vs)\/([a-z0-9-]+)\/?$/;

export default async function markdownNegotiation(
  request: Request,
  context: EdgeContext
): Promise<Response> {
  const accept = request.headers.get('accept') ?? '';
  if (!accept.toLowerCase().includes('text/markdown')) {
    return context.next();
  }

  const url = new URL(request.url);
  const match = NEGOTIABLE_ROUTE_RE.exec(url.pathname);
  if (!match) {
    return context.next();
  }

  const [, section, slug] = match;
  const targetPath = `/${section}/${slug}.md`;

  const response = await context.rewrite(targetPath);
  if (response.status === 404) {
    // No twin for this page (unverified content): serve the HTML page, which has noindex and a banner.
    return context.next();
  }
  const headers = new Headers(response.headers);
  headers.set('Content-Type', 'text/markdown; charset=utf-8');
  headers.set('Vary', 'Accept');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
