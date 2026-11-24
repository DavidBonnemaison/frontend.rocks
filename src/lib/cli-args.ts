export type CliOptionKind = 'string' | 'boolean';
export type CliArgs<S extends Record<string, CliOptionKind>> = {
  [K in keyof S]?: S[K] extends 'boolean' ? boolean : string;
} & { _: string[] };

export class CliArgsError extends Error {}

/**
 * One syntax only: `--key value` (space) and a bare `--flag` for a boolean. Throws CliArgsError
 * on an unknown option, a missing value or the glued form `--key=value`. Tokens without `--`
 * go to `_`. A repeated option keeps the last value.
 */
export function parseCliArgsStrict<S extends Record<string, CliOptionKind>>(
  argv: string[],
  spec: S,
): CliArgs<S> {
  const out: Record<string, string | boolean | string[]> = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      (out._ as string[]).push(token);
      continue;
    }
    if (token.includes('=')) {
      throw new CliArgsError(`use "--key value", not "--key=value" (got ${token})`);
    }
    const name = token.slice(2);
    if (!Object.prototype.hasOwnProperty.call(spec, name)) {
      throw new CliArgsError(`unknown option ${token}`);
    }
    if (spec[name] === 'boolean') {
      out[name] = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new CliArgsError(`missing value for ${token}`);
    }
    out[name] = value;
    i++;
  }
  return out as CliArgs<S>;
}

/** Same, but prints the message on stderr and exits with code 2. Use it in every main(). */
export function parseCliArgs<S extends Record<string, CliOptionKind>>(
  argv: string[],
  spec: S,
): CliArgs<S> {
  try {
    return parseCliArgsStrict(argv, spec);
  } catch (error) {
    if (error instanceof CliArgsError) {
      console.error(error.message);
      process.exit(2);
    }
    throw error;
  }
}
