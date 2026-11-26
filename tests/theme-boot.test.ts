import { describe, expect, it } from 'vitest';
import { THEME_BOOT_SCRIPT } from '@/components/ui/ThemeToggle/theme-boot';

function runBoot(stored: string | null): string {
  const dataset: Record<string, string> = { theme: 'light' };
  const fakeDocument = { documentElement: { dataset } };
  const fakeStorage = {
    getItem(key: string) {
      return key === 'fr-theme' ? stored : null;
    },
  };
  const fn = new Function('document', 'localStorage', THEME_BOOT_SCRIPT);
  fn(fakeDocument, fakeStorage);
  return dataset.theme;
}

describe('THEME_BOOT_SCRIPT', () => {
  it('keeps light when fr-theme is absent', () => {
    expect(runBoot(null)).toBe('light');
  });

  it('sets dark when fr-theme is dark', () => {
    expect(runBoot('dark')).toBe('dark');
  });

  it('keeps light when fr-theme is light or an unknown value', () => {
    expect(runBoot('light')).toBe('light');
    expect(runBoot('system')).toBe('light');
  });
});
