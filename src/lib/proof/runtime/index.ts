export {
  notRunnableReason,
  runExperimentInBrowser,
  type BrowserRunReport,
  type BrowserRunStatus,
  type NotRunnableReason,
} from './browser';
export { canonicalJson, jsonEqual } from './canonical-json';
export {
  composeSources,
  paramsToCss,
  resolveParams,
  type ComposedSources,
  type ParamValues,
} from './compose';
export { BASE_CSS, buildExperimentDocument, SHIM_ORIGINS, type DocumentOptions } from './document';
export { evaluateCase, type CaseEvaluation, type Executor } from './evaluate';
export { mountLabFrame } from './lab-frame';
export { LAB_ORIGIN, LAB_ORIGIN_DEV, LAB_ORIGIN_PRODUCTION } from './lab-origin';
export {
  mountExperimentFrame,
  type MountedFrame,
  type MountRequest,
  type ObserveOptions,
} from './mount';
export { mountForBundle } from './mount-any';
export {
  CHANNEL,
  LOAD_TIMEOUT_MS,
  OBSERVE_TIMEOUT_MS,
  PRESENT_MAX_CHARS,
  RUNTIME_VERSION,
  type FrameConfig,
  type FrameToParent,
  type ParentToFrame,
  type RunResult,
} from './protocol';
export {
  escapeHtmlAttr,
  jsonForScript,
  sanitizeScriptContent,
  sanitizeStyleContent,
} from './sanitize';
