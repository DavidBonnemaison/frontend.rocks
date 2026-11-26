import { describe, expect, it } from 'vitest';
import { contentEnv, verifierEnv } from '@/lib/proof/nightly/env';

describe('nightly environment isolation', () => {
  const sampleEnv: NodeJS.ProcessEnv = {
    PATH: '/usr/bin',
    HOME: '/home/runner',
    NODE_ENV: 'test',
    GITHUB_TOKEN: 'ghs_readonly_token',
    NIGHTLY_PR_TOKEN: 'github_pat_secret',
    CUSTOM_API_KEY: 'gm_secret',
    MY_SECRET_VALUE: 'shh',
    DB_PASSWORD: 'pw',
    NETLIFY_HOOK_URL: 'https://example.test/hook',
    FRONTEND_ROCKS_ROOT: '/workspace/site',
  };

  it('contentEnv strips all secret, token, key, password, and hook variables including GITHUB_TOKEN', () => {
    const env = contentEnv(sampleEnv);
    expect(env.PATH).toBe('/usr/bin');
    expect(env.HOME).toBe('/home/runner');
    expect(env.NODE_ENV).toBe('test');
    expect(env.FRONTEND_ROCKS_ROOT).toBe('/workspace/site');

    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.NIGHTLY_PR_TOKEN).toBeUndefined();
    expect(env.CUSTOM_API_KEY).toBeUndefined();
    expect(env.MY_SECRET_VALUE).toBeUndefined();
    expect(env.DB_PASSWORD).toBeUndefined();
    expect(env.NETLIFY_HOOK_URL).toBeUndefined();
  });

  it('verifierEnv keeps only GITHUB_TOKEN among sensitive variables when defined', () => {
    const env = verifierEnv(sampleEnv);
    expect(env.GITHUB_TOKEN).toBe('ghs_readonly_token');
    expect(env.NIGHTLY_PR_TOKEN).toBeUndefined();
    expect(env.CUSTOM_API_KEY).toBeUndefined();
    expect(env.MY_SECRET_VALUE).toBeUndefined();
    expect(env.DB_PASSWORD).toBeUndefined();
    expect(env.NETLIFY_HOOK_URL).toBeUndefined();
  });

  it('verifierEnv omits GITHUB_TOKEN when not set in base environment', () => {
    const env = verifierEnv({ PATH: '/usr/bin' });
    expect(env.GITHUB_TOKEN).toBeUndefined();
    expect(env.PATH).toBe('/usr/bin');
  });
});
