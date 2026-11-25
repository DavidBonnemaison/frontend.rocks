import { describe, expect, it, vi } from 'vitest';
import { CliArgsError, parseCliArgs, parseCliArgsStrict } from '../src/lib/cli-args';

const spec = { engines: 'string', only: 'string', 'dry-run': 'boolean' } as const;

describe('parseCliArgsStrict', () => {
  it('reads a string option written with a space', () => {
    expect(parseCliArgsStrict(['--engines', 'firefox'], spec)).toEqual({
      engines: 'firefox',
      _: [],
    });
  });

  it('rejects the glued form --key=value', () => {
    expect(() => parseCliArgsStrict(['--engines=firefox'], spec)).toThrow(CliArgsError);
    expect(() => parseCliArgsStrict(['--engines=firefox'], spec)).toThrow(
      'use "--key value", not "--key=value"',
    );
  });

  it('rejects a value option that is the last token', () => {
    expect(() => parseCliArgsStrict(['--engines'], spec)).toThrow(CliArgsError);
  });

  it('rejects a value option followed by another option', () => {
    expect(() => parseCliArgsStrict(['--engines', '--only', 'x'], spec)).toThrow(CliArgsError);
  });

  it('rejects an unknown option', () => {
    expect(() => parseCliArgsStrict(['--nope'], spec)).toThrow(CliArgsError);
  });

  it('reads a boolean flag', () => {
    expect(parseCliArgsStrict(['--dry-run'], spec)).toEqual({ 'dry-run': true, _: [] });
  });

  it('collects bare tokens in _', () => {
    expect(parseCliArgsStrict(['page-a', '--dry-run', 'page-b'], spec)._).toEqual([
      'page-a',
      'page-b',
    ]);
  });

  it('keeps the last value of a repeated option', () => {
    expect(parseCliArgsStrict(['--only', 'a', '--only', 'b'], spec).only).toBe('b');
  });
});

describe('parseCliArgs', () => {
  it('exits with code 2 and a message on stderr for a bad option', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => parseCliArgs(['--engines=firefox'], spec)).toThrow('exit');
    expect(exit).toHaveBeenCalledWith(2);
    expect(err).toHaveBeenCalledWith(expect.stringContaining('use "--key value"'));
    exit.mockRestore();
    err.mockRestore();
  });
});
