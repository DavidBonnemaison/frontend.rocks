import fs from 'node:fs';
import path from 'node:path';
import satori, { type Font } from 'satori';
import { Resvg } from '@resvg/resvg-js';
import type { ProductionSymptomConfig } from '@/config/symptoms';
import type { LoadedAutopsy, LoadedConcept } from './content-loader';
import { renderSchematic } from './design/schematic';
import { getSnapshotsForExperiment } from './design/schematics-loader';
import { SRGB } from './design/tokens.generated';
import { SITE_ROOT } from './paths';
import { formatDomainLabel } from './ui-strings';
import type { VsPair } from './vs-pairs';

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const COVER_WIDTH = 1000;
const COVER_HEIGHT = 420;

const LIGHT_ON_PIECES = new Set(['magenta', 'violet', 'cobalt']);

let cachedFonts: Font[] | null = null;

function loadOgFonts(): Font[] {
  if (cachedFonts) return cachedFonts;

  const newsreaderDir = path.join(SITE_ROOT, 'node_modules', '@fontsource', 'newsreader', 'files');
  const plexDir = path.join(SITE_ROOT, 'node_modules', '@fontsource', 'ibm-plex-mono', 'files');

  cachedFonts = [
    {
      name: 'Newsreader',
      data: fs.readFileSync(path.join(newsreaderDir, 'newsreader-latin-400-normal.woff')),
      weight: 400,
      style: 'normal',
    },
    {
      name: 'Newsreader',
      data: fs.readFileSync(path.join(newsreaderDir, 'newsreader-latin-700-normal.woff')),
      weight: 700,
      style: 'normal',
    },
    {
      name: 'IBM Plex Mono',
      data: fs.readFileSync(path.join(plexDir, 'ibm-plex-mono-latin-400-normal.woff')),
      weight: 400,
      style: 'normal',
    },
    {
      name: 'IBM Plex Mono',
      data: fs.readFileSync(path.join(plexDir, 'ibm-plex-mono-latin-600-normal.woff')),
      weight: 600,
      style: 'normal',
    },
  ];
  return cachedFonts;
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const sliced = text.slice(0, maxLen - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  const base = lastSpace > Math.floor(maxLen * 0.5) ? sliced.slice(0, lastSpace) : sliced;
  return `${base.replace(/[\s,;:\-—]+$/, '')}…`;
}

function firstExperimentIdFromMdx(body: string): string | null {
  const match = /<Experiment\s+[^>]*id=["']([a-z0-9-]+)["']/.exec(body);
  return match?.[1] ?? null;
}

function schematicDataUriForExperiment(
  experimentId: string | null,
  width: number,
  highlightHex: string,
  strokeHex: string
): string | null {
  if (!experimentId) return null;
  const snapshot = getSnapshotsForExperiment(experimentId)[0] ?? null;
  if (!snapshot) return null;
  const rawSvg = renderSchematic({ snapshot, width, highlight: highlightHex })
    .replace(/var\(--color-ink\)/g, strokeHex)
    .replace(/var\(--color-ink-muted\)/g, strokeHex)
    .replace(/var\(--piece-on\)/g, strokeHex)
    .replace(/var\(--color-accent\)/g, highlightHex);
  return `data:image/svg+xml;base64,${Buffer.from(rawSvg, 'utf-8').toString('base64')}`;
}

async function svgToPngBuffer(
  element: unknown,
  width = OG_WIDTH,
  height = OG_HEIGHT
): Promise<Buffer> {
  const fonts = loadOgFonts();
  const svg = await satori(element as Parameters<typeof satori>[0], {
    width,
    height,
    fonts,
  });

  const resvg = new Resvg(svg, {
    fitTo: {
      mode: 'width',
      value: width,
    },
  });

  return Buffer.from(resvg.render().asPng());
}

export async function renderConceptOgPng(concept: LoadedConcept): Promise<Buffer> {
  const { frontmatter, body, claims } = concept;
  const domainLabel = formatDomainLabel(frontmatter.domain).toUpperCase();
  const titleText = truncateText(frontmatter.title, 72);
  const tldrText = truncateText(frontmatter.summary_tldr, 160);
  const expId = firstExperimentIdFromMdx(body);
  const schematicUri = schematicDataUriForExperiment(
    expId,
    380,
    SRGB.light.accent,
    SRGB.light.ink
  );
  const isProven = frontmatter.proof_status === 'proven' && (claims?.claims.length ?? 0) > 0;
  const proofFooter = isProven
    ? `${claims!.claims.length} claims · tested in Chromium, Firefox, WebKit`
    : null;

  const tree = {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: SRGB.light.paper,
        color: SRGB.light.ink,
        padding: '56px 64px',
        fontFamily: 'Newsreader',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '40px',
              flexGrow: 1,
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px',
                    width: schematicUri ? '660px' : '100%',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontFamily: 'IBM Plex Mono',
                          fontSize: '18px',
                          fontWeight: 600,
                          letterSpacing: '0.06em',
                          color: SRGB.light['ink-muted'],
                        },
                        children: domainLabel,
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontFamily: 'Newsreader',
                          fontSize: '60px',
                          fontWeight: 700,
                          lineHeight: 1.08,
                          letterSpacing: '-0.015em',
                          color: SRGB.light.ink,
                        },
                        children: titleText,
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontFamily: 'Newsreader',
                          fontSize: '26px',
                          fontWeight: 400,
                          lineHeight: 1.4,
                          color: SRGB.light['ink-muted'],
                        },
                        children: tldrText,
                      },
                    },
                  ],
                },
              },
              ...(schematicUri
                ? [
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '380px',
                          height: '380px',
                          border: `1px solid ${SRGB.light.rule}`,
                          padding: '16px',
                        },
                        children: {
                          type: 'img',
                          props: {
                            src: schematicUri,
                            width: 348,
                            height: 260,
                          },
                        },
                      },
                    },
                  ]
                : []),
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: `1px solid ${SRGB.light.rule}`,
              paddingTop: '20px',
              width: '100%',
              fontFamily: 'IBM Plex Mono',
              fontSize: '18px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: { fontWeight: 600, color: SRGB.light.ink },
                  children: 'frontend.rocks',
                },
              },
              ...(proofFooter
                ? [
                    {
                      type: 'div',
                      props: {
                        style: { color: SRGB.light['ink-muted'] },
                        children: proofFooter,
                      },
                    },
                  ]
                : []),
            ],
          },
        },
      ],
    },
  };

  return svgToPngBuffer(tree);
}

function buildAutopsyPieceTree(
  autopsy: LoadedAutopsy,
  width: number,
  height: number
): unknown {
  const { frontmatter } = autopsy;
  const pieceHex = SRGB.piece[frontmatter.piece_color];
  const onHex = LIGHT_ON_PIECES.has(frontmatter.piece_color)
    ? SRGB.fixed.paper
    : SRGB.fixed.ink;
  const caseNum = `#${String(frontmatter.case_number).padStart(2, '0')}`;
  const titleText = truncateText(frontmatter.title, width < 1100 ? 60 : 72);
  const symptomText = truncateText(frontmatter.symptom, width < 1100 ? 100 : 130);

  const fmRecord = frontmatter as unknown as Record<string, unknown>;
  const reproId =
    typeof fmRecord.repro_experiment_id === 'string' ? fmRecord.repro_experiment_id : null;
  const schematicUri = schematicDataUriForExperiment(
    reproId,
    Math.round(width * 0.42),
    onHex,
    onHex
  );
  const compact = height < 500;

  return {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: pieceHex,
        padding: compact ? '28px 36px' : '44px 56px',
        fontFamily: 'Newsreader',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              width: '100%',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: compact ? '16px' : '20px',
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    color: onHex,
                  },
                  children: 'FRONTEND.ROCKS',
                },
              },
              schematicUri
                ? {
                    type: 'img',
                    props: {
                      src: schematicUri,
                      width: compact ? 280 : 380,
                      height: compact ? 140 : 200,
                    },
                  }
                : {
                    type: 'div',
                    props: {
                      style: {
                        fontFamily: 'IBM Plex Mono',
                        fontSize: compact ? '84px' : '136px',
                        fontWeight: 600,
                        lineHeight: 0.9,
                        color: onHex,
                      },
                      children: caseNum,
                    },
                  },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: compact ? '10px' : '16px',
              backgroundColor: SRGB.fixed.paper,
              color: SRGB.fixed.ink,
              borderTop: `6px solid ${pieceHex}`,
              borderBottom: `2px solid ${SRGB.fixed.ink}`,
              padding: compact ? '22px 28px' : '32px 40px',
              width: compact ? '780px' : '860px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: compact ? '15px' : '18px',
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    color: SRGB.fixed.ink,
                  },
                  children: `CASE ${caseNum}`,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontFamily: 'Newsreader',
                    fontSize: compact ? '34px' : '48px',
                    fontWeight: 700,
                    lineHeight: 1.1,
                    color: SRGB.fixed.ink,
                  },
                  children: titleText,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontFamily: 'Newsreader',
                    fontSize: compact ? '19px' : '24px',
                    fontWeight: 400,
                    lineHeight: 1.35,
                    color: SRGB.fixed.ink,
                  },
                  children: symptomText,
                },
              },
            ],
          },
        },
      ],
    },
  };
}

export async function renderAutopsyOgPng(
  autopsy: LoadedAutopsy,
  _conceptTitles?: Map<string, string>
): Promise<Buffer> {
  void _conceptTitles;
  return svgToPngBuffer(buildAutopsyPieceTree(autopsy, OG_WIDTH, OG_HEIGHT), OG_WIDTH, OG_HEIGHT);
}

export async function renderAutopsyCoverPng(
  autopsy: LoadedAutopsy,
  _conceptTitles?: Map<string, string>
): Promise<Buffer> {
  void _conceptTitles;
  return svgToPngBuffer(
    buildAutopsyPieceTree(autopsy, COVER_WIDTH, COVER_HEIGHT),
    COVER_WIDTH,
    COVER_HEIGHT
  );
}

export async function renderSymptomOgPng(
  symptom: Pick<ProductionSymptomConfig, 'slug' | 'search_title' | 'devtools_signature'>
): Promise<Buffer> {
  const titleText = truncateText(symptom.search_title, 76);
  const sigText = truncateText(symptom.devtools_signature, 200);

  const tree = {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: SRGB.light['paper-sunk'],
        color: SRGB.light.ink,
        padding: '56px 64px',
        fontFamily: 'Newsreader',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                    borderTop: `2px solid ${SRGB.light.ink}`,
                    borderBottom: `2px solid ${SRGB.light.ink}`,
                    padding: '24px 0',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontFamily: 'IBM Plex Mono',
                          fontSize: '16px',
                          fontWeight: 600,
                          letterSpacing: '0.06em',
                          color: SRGB.light.fail,
                        },
                        children: '× CONSOLE',
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          fontFamily: 'IBM Plex Mono',
                          fontSize: '24px',
                          fontWeight: 400,
                          lineHeight: 1.4,
                          color: SRGB.light.ink,
                        },
                        children: sigText,
                      },
                    },
                  ],
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontFamily: 'Newsreader',
                    fontSize: '46px',
                    fontWeight: 700,
                    lineHeight: 1.12,
                    color: SRGB.light.ink,
                  },
                  children: titleText,
                },
              },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: `1px solid ${SRGB.light.rule}`,
              paddingTop: '20px',
              fontFamily: 'IBM Plex Mono',
              fontSize: '18px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: { fontWeight: 600, color: SRGB.light.ink },
                  children: 'frontend.rocks',
                },
              },
              {
                type: 'div',
                props: {
                  style: { color: SRGB.light['ink-muted'] },
                  children: 'DEBUG · SYMPTOMS',
                },
              },
            ],
          },
        },
      ],
    },
  };

  return svgToPngBuffer(tree);
}

export async function renderDefaultOgPng(): Promise<Buffer> {
  const tree = {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: SRGB.light.paper,
        color: SRGB.light.ink,
        padding: '64px',
        fontFamily: 'Newsreader',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '24px',
              fontWeight: 600,
              letterSpacing: '0.04em',
              color: SRGB.light.ink,
            },
            children: 'frontend.rocks',
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontFamily: 'Newsreader',
                    fontSize: '76px',
                    fontWeight: 700,
                    lineHeight: 1.05,
                    letterSpacing: '-0.015em',
                    color: SRGB.light.ink,
                  },
                  children: 'Frontend, with receipts.',
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '20px',
                    color: SRGB.light['ink-muted'],
                  },
                  children: 'CHROMIUM · FIREFOX · WEBKIT',
                },
              },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: {
              borderTop: `1px solid ${SRGB.light.rule}`,
              paddingTop: '20px',
              fontFamily: 'IBM Plex Mono',
              fontSize: '18px',
              color: SRGB.light['ink-muted'],
            },
            children: 'Browser internals, architecture autopsies, and machine-checked claims.',
          },
        },
      ],
    },
  };

  return svgToPngBuffer(tree);
}

export async function renderVsOgPng(pair: VsPair): Promise<Buffer> {
  const titleA = truncateText(pair.primary.frontmatter.title, 36);
  const titleB = truncateText(pair.secondary.frontmatter.title, 36);
  const verdictText = truncateText(pair.note, 170);

  const tree = {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: SRGB.light.paper,
        color: SRGB.light.ink,
        padding: '56px 64px',
        fontFamily: 'Newsreader',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              fontFamily: 'IBM Plex Mono',
              fontSize: '18px',
              fontWeight: 600,
              letterSpacing: '0.06em',
              color: SRGB.light['ink-muted'],
            },
            children: pair.relationType === 'replaces' ? 'REPLACES' : 'MECHANICAL COMPARISON',
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontFamily: 'Newsreader',
                    fontSize: '56px',
                    fontWeight: 700,
                    lineHeight: 1.1,
                    color: SRGB.light.ink,
                  },
                  children: `${titleA} vs ${titleB}`,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontFamily: 'Newsreader',
                    fontSize: '26px',
                    lineHeight: 1.4,
                    color: SRGB.light['ink-muted'],
                  },
                  children: verdictText,
                },
              },
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: `1px solid ${SRGB.light.rule}`,
              paddingTop: '20px',
              fontFamily: 'IBM Plex Mono',
              fontSize: '18px',
            },
            children: [
              {
                type: 'div',
                props: { style: { fontWeight: 600, color: SRGB.light.ink }, children: 'frontend.rocks' },
              },
              {
                type: 'div',
                props: {
                  style: { color: SRGB.light['ink-muted'] },
                  children: `/vs/${pair.slug}`,
                },
              },
            ],
          },
        },
      ],
    },
  };

  return svgToPngBuffer(tree);
}
