import path from 'node:path';

/** Root of the public repository. Scripts of the private repository set FRONTEND_ROCKS_ROOT=site. */
export const SITE_ROOT = path.resolve(process.env.FRONTEND_ROCKS_ROOT ?? process.cwd());
/** FRONTEND_ROCKS_CONTENT_DIR (tests, fixtures) takes priority over FRONTEND_ROCKS_ROOT. */
export const CONTENT_DIR = path.resolve(process.env.FRONTEND_ROCKS_CONTENT_DIR ?? path.join(SITE_ROOT, 'content'));
export const PUBLIC_DIR = path.join(SITE_ROOT, 'public');
