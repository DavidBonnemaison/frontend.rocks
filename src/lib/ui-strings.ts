export const UI_STRINGS = {
  brand: {
    name: 'frontend.rocks',
    heroTitle: 'How Browsers Actually Work, Without the Marketing Gloss',
    heroSubtitle:
      'Interactive mechanical models of rendering, layout, event loops, and modern web platform primitives.',
    primaryCta: 'Try a Lab in 30s',
    secondaryCta: 'Explore the Concept Map',
  },
  nav: {
    home: 'Home',
    concepts: 'Concepts',
    autopsies: 'Autopsies',
    symptoms: 'Symptoms',
    index: 'Index',
    graph: 'Concept Map',
    radar: 'Radar',
    curatedWatch: 'Curated Watch',
    obsolescenceRadar: 'Obsolescence Radar',
    searchPlaceholder: 'Search concepts, APIs, or symptoms...',
  },
  home: {
    heroEyebrow: 'Browser Internals & Platform Primitives',
    pathsTitle: 'Guided Learning Paths',
    pathsSubtitle:
      'Follow curated sequences from foundational rendering mechanics to production-ready platform primitives.',
    pathsMinLabel: 'min',
    pathsLabsLabel: 'interactive labs',
    pathsConceptsLabel: 'concepts',
    pathsStartCta: 'Start path',
    pathsPreviewTitle: 'Interactive Path Preview',
    pathsPreviewHint: 'Select any step to preview what it unlocks before diving in.',
    pathsOpenConcept: 'Open concept',
    symptomsTitle: 'Debug by Production Symptom',
    symptomsSubtitle:
      'Jump straight to the browser mechanism and failure mode behind real production bugs.',
    symptomsJumpLabel: 'Inspect root cause',
    symptomsBrowseAll: 'Browse all production symptoms',
    signalsTitle: 'Latest Watch & Obsolescence Signals',
    signalsSubtitle:
      'Historical workarounds replaced by native browser primitives, plus recent engine shifts.',
    signalsViewAllObsolescence: 'Open Obsolescence Radar',
    signalsViewCuratedWatch: 'Read Curated Watch',
  },
  graph: {
    title: 'Concept Map',
    subtitle:
      'Directed dependency graph of browser internals, prerequisites, and native replacements. Hover or click any node or edge to inspect its mechanical explanation.',
    domainLabel: 'Domain',
    maturityLabel: 'Maturity',
    allOption: 'All',
    indexLink: 'Filterable Index View',
    viewGraph: 'Visual Graph',
    viewTree: 'Dependency Tree',
    viewDomainGroups: 'Domain Groups',
    edgesLegendTitle: 'Edges',
    edgePanelTitle: 'Edge Explanation',
    nodePanelTitle: 'Selected Concept',
    emptyPanelHint:
      'Hover or click any concept node or connecting edge to inspect its mechanical explanation.',
    openConcept: 'Open Concept',
    treeDepthPrefix: 'Layer',
    treePrerequisites: 'Prerequisites',
    treeConnections: 'Outgoing Connections',
    treeNoConnections: 'Foundational node (no prerequisites).',
  },
  sections: {
    curatedWatch: 'Curated Watch',
    interactiveSimulator: 'Interactive Simulator',
    prerequisites: 'Prerequisites',
    usefulPrerequisites: 'Useful Prerequisites',
    underTheHood: 'Under the Hood',
    connectionsAndNextSteps: 'Connections & Logical Next Steps',
    primarySources: 'Primary Sources',
  },
  relations: {
    requires: 'Prerequisites',
    usefulPrerequisites: 'Useful Prerequisites',
    whatThisUnlocks: 'What This Unlocks',
    underTheHood: 'Under the Hood',
    oftenConfusedWith: 'Often Confused With',
    replaces: 'Replaces',
    replacedBy: 'Replaced By',
  },
  callouts: {
    mentalModel: 'Mental Model',
    productionPitfall: 'Production Pitfall',
    whenNotToUse: 'When Not to Use',
  },
  toc: {
    inBrief: 'In Brief',
    lab: 'Lab',
    underTheHood: 'Under the Hood',
    genealogy: 'Genealogy',
    productionPitfalls: 'Production Pitfalls',
    connections: 'Connections',
    sources: 'Sources',
  },
  obsolescence: {
    legacyPattern: 'Legacy Pattern',
    superseded: 'Superseded',
    replacesPrefix: 'Replaces Legacy Pattern:',
    supersededPrefix: 'Superseded, replaced by:',
    radarTitle: 'Obsolescence Radar',
    radarSubtitle: 'Historical JS/CSS workarounds replaced by native browser primitives.',
    nativeReplacement: 'Native Replacement',
  },
  maturity: {
    'baseline-widely': 'Baseline · Widely',
    'baseline-newly': 'Baseline · Newly',
    'interop-experimental': 'Limited availability',
    'legacy-pattern': 'Legacy Pattern',
    superseded: 'Superseded',
  } as Record<string, string>,
  digestCategories: {
    'obsolescence-alert': 'Obsolescence Alert',
    'spec-update': 'Spec Update',
    'browser-release': 'Browser Release',
    'deep-dive': 'Deep Dive',
  } as Record<string, string>,
  domains: {
    'rendering-pipeline': 'Rendering Pipeline',
    'css-layout': 'CSS & Layout',
    'js-runtime': 'JS Runtime',
    'dom-events': 'DOM & Events',
    'network-perf': 'Network & Performance',
    'state-architecture': 'State & Architecture',
    'software-architecture': 'Software Architecture',
    'web-apis': 'Web APIs',
    'security-a11y': 'Security & Accessibility',
    'framework-internals': 'Framework Internals',
    'testing-verification': 'Testing & Verification',
  } as Record<string, string>,
  failureModes: {
    'silent-data-corruption': 'Silent Data Corruption',
    'main-thread-freeze': 'Main-Thread Freeze',
    'memory-exhaustion': 'Memory Exhaustion',
    'cascading-latency': 'Cascading Latency',
    'hydration-desync': 'Hydration Desync',
    'false-positive-ci': 'False-Positive CI',
  } as Record<string, string>,
  autopsies: {
    title: 'Architecture Autopsies',
    subtitle:
      'Cross-layer post-mortems tracing real production failures across 4 to 6 browser and framework mechanisms.',
    eyebrow: 'Case Files · Cross-Layer Post-Mortems',
    allFailureModes: 'All Failure Modes',
    casePrefix: 'Case #',
    readingTimeSuffix: 'min read',
    causalChainTitle: 'Causal Chain Traversed',
    causalChainSubtitle:
      'Step-by-step propagation across atomic concepts. Hover or click any step to inspect the underlying mechanism.',
    incidentReportTitle: 'The Incident & The False Culprit',
    failureSimulatorTitle: 'Failure Reproduction Lab',
    layerDissectionTitle: 'Layer-by-Layer Dissection',
    architecturalFixTitle: 'Architectural Fix & Invariants',
    seenInAutopsies: 'Seen in Architecture Autopsies',
    homeSectionTitle: 'Architecture Autopsies',
    homeSectionSubtitle:
      'Production incidents don’t respect module boundaries. Follow the causal chain from symptom to root invariant.',
    viewAllAutopsies: (count: number) => `Browse all ${count} Architecture Autopsies`,
  },
  controls: {
    enabled: 'On',
    disabled: 'Off',
  },
  PROOF: {
    chipClaims: (n: number) => `${n} claim${n === 1 ? '' : 's'}`,
    chipProvenIn: 'proven in',
    chipChecked: 'checked',
    panelTitle: 'Proof',
    panelIntro:
      'Every factual sentence on this page is backed by one of the claims below. Experiments run in real browser engines; quotes are checked word for word against the source.',
    colClaim: 'Claim',
    colType: 'Type',
    colProof: 'Proof',
    status: {
      pending: 'Not checked yet',
      proven: 'Proven',
      diverges: 'Engines disagree',
      failed: 'Failing',
      stale: 'Source changed, re-checking',
    },
    engineCell: {
      pass: 'pass',
      fail: 'fail',
      error: 'inconclusive',
      missing: 'no result yet',
      'not-run': 'out of scope',
    },
    type: {
      observable: 'Experiment',
      measured: 'Measurement',
      normative: 'Spec quote',
      implementation: 'Engine source',
      support: 'Compat data',
      derived: 'Derived',
    },
    methodLink: 'How proofs work',
  },
  INSTRUMENTS: {
    queueViewLegend: 'Reconstructed from the order recorded in your browser',
    layerStackDeclaredLabel: 'Declared order',
    layerStackDisagree: 'The declared order disagrees with what your browser hit',
    frameBudgetNotEnoughFrames: 'Not enough frames recorded',
    noDataAtPath: (path: string) => `No data at path "${path}"`,
    emptyObservation: 'No observations recorded.',
  },
} as const;

export function formatMaturityLabel(status: string | null | undefined): string {
  if (!status) return '';
  return UI_STRINGS.maturity[status] ?? status;
}

export function formatDigestCategory(category: string): string {
  return UI_STRINGS.digestCategories[category] ?? category;
}

export function formatDomainLabel(domain: string): string {
  return UI_STRINGS.domains[domain] ?? domain;
}

export function formatFailureModeLabel(mode: string): string {
  return UI_STRINGS.failureModes[mode] ?? mode;
}

export type UiStrings = typeof UI_STRINGS;
