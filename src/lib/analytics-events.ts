export const ANALYTICS_EVENTS = [
  'experiment_interact',
  'experiment_fix_success',
  'proof_panel_open', // Reserved: wired when proof receipts land (EPIC-30)
  'proof_run_in_browser', // Reserved: wired when in-browser proof verification lands (EPIC-30)
  'symptom_search',
  'search_query',
  'search_zero_results',
  'paste_bug_submit',
  'paste_bug_match',
  'path_step_complete',
  'spec_link_click',
  'embed_copy',
  'theme_toggle', // Reserved: wired when theme switcher lands (EPIC-39)
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

/** Events counted server-side only (never emitted by the browser). */
export const SERVER_EVENTS = ['mcp_call'] as const;
export type ServerEvent = (typeof SERVER_EVENTS)[number];

export const ALL_EVENTS = [...ANALYTICS_EVENTS, ...SERVER_EVENTS] as const;
export type AllEvent = (typeof ALL_EVENTS)[number];

/**
 * `target` identifies a site object (lab id, concept id, symptom slug, MCP tool name).
 * Never user-typed content. Any value that does not match TARGET_RE is dropped.
 */
export const TARGET_RE = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)?$/;

/** Allowed properties per event. Any other key is ignored. Values: PROP_VALUE_RE or boolean. */
export const EVENT_PROPS: Partial<Record<AnalyticsEvent, readonly string[]>> = {
  paste_bug_submit: ['kind'],
  paste_bug_match: ['kind', 'matched', 'stage'],
  proof_run_in_browser: ['engine', 'outcome'], // engine: blink | gecko | webkit | unknown; outcome: all-confirmed | some-failed
};

export const PROP_VALUE_RE = /^[a-z0-9-]{1,32}$/;

export type EventProps = Record<string, string | boolean>;

export interface ParsedEventPath {
  name: AllEvent;
  target: string | null;
  props: Record<string, string>;
}

const ALL_EVENTS_SET: ReadonlySet<string> = new Set(ALL_EVENTS);

/**
 * Encodes an event, optional site-object target, and allowlisted properties into a
 * GoatCounter path: `<event>[/<target>][;<key>=<value>...]`.
 */
export function serializeEventPath(
  event: AnalyticsEvent | ServerEvent,
  target?: string,
  props?: EventProps,
): string {
  let path: string = event;
  if (typeof target === 'string' && TARGET_RE.test(target)) {
    path = `${event}/${target}`;
  }

  const allowedKeys = EVENT_PROPS[event as AnalyticsEvent];
  if (!props || !allowedKeys || allowedKeys.length === 0) {
    return path;
  }

  const allowedSet = new Set(allowedKeys);
  const pairs: string[] = [];
  for (const key of Object.keys(props).sort()) {
    if (!allowedSet.has(key)) continue;
    const raw = props[key];
    if (typeof raw === 'boolean') {
      pairs.push(`${key}=${raw ? 'true' : 'false'}`);
    } else if (typeof raw === 'string' && PROP_VALUE_RE.test(raw)) {
      pairs.push(`${key}=${raw}`);
    }
  }

  return pairs.length > 0 ? `${path};${pairs.join(';')}` : path;
}

/**
 * Inverse of `serializeEventPath`. Returns null for unknown event names.
 */
export function parseEventPath(rawPath: string): ParsedEventPath | null {
  const trimmed = rawPath.replace(/^\/+/, '');
  if (!trimmed) return null;

  const [base, ...propTokens] = trimmed.split(';');
  const slashIdx = base.indexOf('/');
  const name = slashIdx === -1 ? base : base.slice(0, slashIdx);
  if (!ALL_EVENTS_SET.has(name)) {
    return null;
  }

  const rawTarget = slashIdx === -1 ? null : base.slice(slashIdx + 1);
  const target = rawTarget !== null && TARGET_RE.test(rawTarget) ? rawTarget : null;

  const allowedKeys = EVENT_PROPS[name as AnalyticsEvent];
  const allowedSet = allowedKeys ? new Set(allowedKeys) : null;
  const props: Record<string, string> = {};

  if (allowedSet) {
    for (const token of propTokens) {
      const eqIdx = token.indexOf('=');
      if (eqIdx === -1) continue;
      const key = token.slice(0, eqIdx);
      const value = token.slice(eqIdx + 1);
      if (allowedSet.has(key) && PROP_VALUE_RE.test(value)) {
        props[key] = value;
      }
    }
  }

  return {
    name: name as AllEvent,
    target,
    props,
  };
}
