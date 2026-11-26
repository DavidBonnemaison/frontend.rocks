const SECRET_ENV_RE = /KEY|TOKEN|SECRET|PASSWORD|HOOK/i;

/**
 * Environment without secrets or tokens: used for any step executing content code
 * (experiments, build scripts, aggregation, checks).
 */
export function contentEnv(
  baseEnv: Readonly<Record<string, string | undefined>> = process.env
): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(baseEnv)) {
    if (SECRET_ENV_RE.test(k)) continue;
    env[k] = v;
  }
  return env as NodeJS.ProcessEnv;
}

/**
 * Environment for network verifiers: they execute no content code and keep
 * GITHUB_TOKEN (read-only) for GitHub API rate limits.
 */
export function verifierEnv(
  baseEnv: Readonly<Record<string, string | undefined>> = process.env
): NodeJS.ProcessEnv {
  const env: Record<string, string | undefined> = { ...contentEnv(baseEnv) };
  if (baseEnv.GITHUB_TOKEN) {
    env.GITHUB_TOKEN = baseEnv.GITHUB_TOKEN;
  }
  return env as NodeJS.ProcessEnv;
}
