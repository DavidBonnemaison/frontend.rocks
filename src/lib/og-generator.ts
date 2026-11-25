import fs from 'fs';
import path from 'path';
import satori, { type Font } from 'satori';
import { Resvg } from '@resvg/resvg-js';
import type { LoadedAutopsy, LoadedConcept } from './content-loader';
import type { MaturityStatus } from './schemas';
import type { VsPair } from './vs-pairs';
import {
  formatDomainLabel,
  formatFailureModeLabel,
  formatMaturityLabel,
} from './ui-strings';

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

let cachedFonts: Font[] | null = null;

function loadLocalInterFonts(): Font[] {
  if (cachedFonts) return cachedFonts;

  const fontDir = path.join(process.cwd(), 'node_modules', '@fontsource', 'inter', 'files');
  const regular = fs.readFileSync(path.join(fontDir, 'inter-latin-400-normal.woff'));
  const semiBold = fs.readFileSync(path.join(fontDir, 'inter-latin-600-normal.woff'));
  const bold = fs.readFileSync(path.join(fontDir, 'inter-latin-700-normal.woff'));

  cachedFonts = [
    { name: 'Inter', data: regular, weight: 400, style: 'normal' },
    { name: 'Inter', data: semiBold, weight: 600, style: 'normal' },
    { name: 'Inter', data: bold, weight: 700, style: 'normal' },
  ];
  return cachedFonts;
}

function getMaturityColors(status: MaturityStatus | null): {
  bg: string;
  text: string;
  border: string;
} {
  switch (status) {
    case 'baseline-widely':
      return {
        bg: 'rgba(16, 185, 129, 0.14)',
        text: '#6ee7b7',
        border: 'rgba(16, 185, 129, 0.42)',
      };
    case 'baseline-newly':
      return {
        bg: 'rgba(56, 189, 248, 0.14)',
        text: '#7dd3fc',
        border: 'rgba(56, 189, 248, 0.42)',
      };
    case 'interop-experimental':
      return {
        bg: 'rgba(245, 158, 11, 0.14)',
        text: '#fcd34d',
        border: 'rgba(245, 158, 11, 0.42)',
      };
    case 'legacy-pattern':
    case 'superseded':
      return {
        bg: 'rgba(245, 118, 66, 0.14)',
        text: '#fdba74',
        border: 'rgba(245, 118, 66, 0.42)',
      };
    case null:
      return {
        bg: 'rgba(152, 164, 181, 0.12)',
        text: '#98a4b5',
        border: 'rgba(152, 164, 181, 0.32)',
      };
  }
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const sliced = text.slice(0, maxLen - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  const base = lastSpace > Math.floor(maxLen * 0.5) ? sliced.slice(0, lastSpace) : sliced;
  return `${base.replace(/[\s,;:\-—]+$/, '')}…`;
}

async function svgToPngBuffer(
  element: unknown,
  width = OG_WIDTH,
  height = OG_HEIGHT
): Promise<Buffer> {
  const fonts = loadLocalInterFonts();
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
  const { frontmatter } = concept;
  const domainLabel = formatDomainLabel(frontmatter.domain);
  const maturityLabel = formatMaturityLabel(frontmatter.maturity_status);
  const maturityColors = getMaturityColors(frontmatter.maturity_status);
  const titleText = truncateText(frontmatter.title, 72);
  const tldrText = truncateText(frontmatter.summary_tldr, 195);

  const tree = {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: '#0b0d11',
        color: '#eef2f7',
        padding: '54px 64px',
        fontFamily: 'Inter',
        border: '1px solid #252c38',
      },
      children: [
        // Top Header Row
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          backgroundColor: '#12161d',
                          border: '1px solid #252c38',
                          fontSize: '20px',
                          fontWeight: 700,
                          color: '#38bdf8',
                        },
                        children: 'frontend.rocks',
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          backgroundColor: '#181d26',
                          border: '1px solid #252c38',
                          fontSize: '18px',
                          fontWeight: 600,
                          color: '#eef2f7',
                        },
                        children: domainLabel,
                      },
                    },
                  ],
                },
              },
              ...(maturityLabel
                ? [
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          padding: '8px 18px',
                          borderRadius: '999px',
                          backgroundColor: maturityColors.bg,
                          border: `1px solid ${maturityColors.border}`,
                          fontSize: '18px',
                          fontWeight: 600,
                          color: maturityColors.text,
                        },
                        children: maturityLabel,
                      },
                    },
                  ]
                : []),
            ],
          },
        },
        // Center Content
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: '22px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: titleText.length > 42 ? '46px' : '54px',
                    fontWeight: 700,
                    lineHeight: 1.12,
                    letterSpacing: '-0.02em',
                    color: '#eef2f7',
                  },
                  children: titleText,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '24px',
                    fontWeight: 400,
                    lineHeight: 1.45,
                    color: '#98a4b5',
                  },
                  children: tldrText,
                },
              },
            ],
          },
        },
        // Bottom Footer Row
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid #252c38',
              paddingTop: '24px',
              width: '100%',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '19px',
                    fontWeight: 600,
                    color: '#98a4b5',
                  },
                  children: 'Browser Internals & Production Pitfalls',
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: '19px',
                    fontWeight: 600,
                    color: '#38bdf8',
                  },
                  children: `frontend.rocks/concepts/${frontmatter.id}`,
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

export async function renderAutopsyOgPng(
  autopsy: LoadedAutopsy,
  conceptTitles: Map<string, string>
): Promise<Buffer> {
  const { frontmatter } = autopsy;
  const caseBadge = `AUTOPSY #${String(frontmatter.case_number).padStart(2, '0')}`;
  const failureLabel = formatFailureModeLabel(frontmatter.failure_mode);
  const titleText = truncateText(frontmatter.title, 72);
  const symptomText = truncateText(frontmatter.symptom, 140);

  const steps = [...frontmatter.traversed_concepts]
    .sort((a, b) => a.step_order - b.step_order)
    .slice(0, 4);

  const stepChildren = steps.flatMap((step, idx) => {
    const label = truncateText(conceptTitles.get(step.concept_id) ?? step.concept_id, 24);
    const pill = {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 14px',
          borderRadius: '8px',
          backgroundColor: '#12161d',
          border: '1px solid #252c38',
          fontSize: '16px',
          fontWeight: 600,
          color: '#eef2f7',
        },
        children: [
          {
            type: 'span',
            props: {
              style: { color: '#38bdf8', fontWeight: 700 },
              children: `${step.step_order}.`,
            },
          },
          {
            type: 'span',
            props: {
              children: label,
            },
          },
        ],
      },
    };

    if (idx === steps.length - 1) return [pill];
    return [
      pill,
      {
        type: 'div',
        props: {
          style: {
            display: 'flex',
            alignItems: 'center',
            fontSize: '20px',
            fontWeight: 700,
            color: '#38bdf8',
          },
          children: '→',
        },
      },
    ];
  });

  const tree = {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: '#0b0d11',
        color: '#eef2f7',
        padding: '50px 64px',
        fontFamily: 'Inter',
        border: '1px solid #252c38',
      },
      children: [
        // Top Bar
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: { display: 'flex', alignItems: 'center', gap: '12px' },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          backgroundColor: '#12161d',
                          border: '1px solid #252c38',
                          fontSize: '20px',
                          fontWeight: 700,
                          color: '#38bdf8',
                        },
                        children: 'frontend.rocks',
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          backgroundColor: 'rgba(56, 189, 248, 0.14)',
                          border: '1px solid rgba(56, 189, 248, 0.42)',
                          fontSize: '18px',
                          fontWeight: 700,
                          color: '#7dd3fc',
                        },
                        children: caseBadge,
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
                    padding: '8px 18px',
                    borderRadius: '999px',
                    backgroundColor: 'rgba(245, 118, 66, 0.14)',
                    border: '1px solid rgba(245, 118, 66, 0.42)',
                    fontSize: '18px',
                    fontWeight: 600,
                    color: '#fdba74',
                  },
                  children: failureLabel,
                },
              },
            ],
          },
        },
        // Center Title & Symptom
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: titleText.length > 44 ? '42px' : '48px',
                    fontWeight: 700,
                    lineHeight: 1.15,
                    letterSpacing: '-0.02em',
                    color: '#eef2f7',
                  },
                  children: titleText,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    padding: '14px 18px',
                    borderRadius: '10px',
                    backgroundColor: '#12161d',
                    border: '1px solid #252c38',
                    fontSize: '21px',
                    lineHeight: 1.4,
                    color: '#98a4b5',
                  },
                  children: `Symptom: ${symptomText}`,
                },
              },
            ],
          },
        },
        // Causal Chain Strip
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '10px',
                  },
                  children: stepChildren,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderTop: '1px solid #252c38',
                    paddingTop: '18px',
                    width: '100%',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: { fontSize: '18px', fontWeight: 600, color: '#98a4b5' },
                        children: 'Architecture Autopsy · Root Cause Dissection',
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: { fontSize: '18px', fontWeight: 600, color: '#38bdf8' },
                        children: `frontend.rocks/autopsies/${frontmatter.id}`,
                      },
                    },
                  ],
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

const COVER_WIDTH = 1000;
const COVER_HEIGHT = 420;

export async function renderAutopsyCoverPng(
  autopsy: LoadedAutopsy,
  conceptTitles: Map<string, string>
): Promise<Buffer> {
  const { frontmatter } = autopsy;
  const caseBadge = `AUTOPSY #${String(frontmatter.case_number).padStart(2, '0')}`;
  const failureLabel = formatFailureModeLabel(frontmatter.failure_mode);
  const titleText = truncateText(frontmatter.title, 68);
  const symptomText = truncateText(frontmatter.symptom, 115);

  const steps = [...frontmatter.traversed_concepts]
    .sort((a, b) => a.step_order - b.step_order)
    .slice(0, 4);

  const stepChildren = steps.flatMap((step, idx) => {
    const label = truncateText(conceptTitles.get(step.concept_id) ?? step.concept_id, 20);
    const pill = {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 11px',
          borderRadius: '6px',
          backgroundColor: '#12161d',
          border: '1px solid #252c38',
          fontSize: '14px',
          fontWeight: 600,
          color: '#eef2f7',
        },
        children: [
          {
            type: 'span',
            props: {
              style: { color: '#38bdf8', fontWeight: 700 },
              children: `${step.step_order}.`,
            },
          },
          {
            type: 'span',
            props: { children: label },
          },
        ],
      },
    };

    if (idx === steps.length - 1) return [pill];
    return [
      pill,
      {
        type: 'div',
        props: {
          style: {
            display: 'flex',
            alignItems: 'center',
            fontSize: '16px',
            fontWeight: 700,
            color: '#38bdf8',
          },
          children: '→',
        },
      },
    ];
  });

  const tree = {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: '#0b0d11',
        color: '#eef2f7',
        padding: '34px 48px',
        fontFamily: 'Inter',
        border: '1px solid #252c38',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: { display: 'flex', alignItems: 'center', gap: '10px' },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          padding: '6px 14px',
                          borderRadius: '8px',
                          backgroundColor: '#12161d',
                          border: '1px solid #252c38',
                          fontSize: '17px',
                          fontWeight: 700,
                          color: '#38bdf8',
                        },
                        children: 'frontend.rocks',
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          padding: '6px 14px',
                          borderRadius: '8px',
                          backgroundColor: 'rgba(56, 189, 248, 0.14)',
                          border: '1px solid rgba(56, 189, 248, 0.42)',
                          fontSize: '16px',
                          fontWeight: 700,
                          color: '#7dd3fc',
                        },
                        children: caseBadge,
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
                    padding: '6px 14px',
                    borderRadius: '999px',
                    backgroundColor: 'rgba(245, 118, 66, 0.14)',
                    border: '1px solid rgba(245, 118, 66, 0.42)',
                    fontSize: '15px',
                    fontWeight: 600,
                    color: '#fdba74',
                  },
                  children: failureLabel,
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
              gap: '12px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: titleText.length > 44 ? '30px' : '35px',
                    fontWeight: 700,
                    lineHeight: 1.15,
                    letterSpacing: '-0.02em',
                    color: '#eef2f7',
                  },
                  children: titleText,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    backgroundColor: '#12161d',
                    border: '1px solid #252c38',
                    fontSize: '17px',
                    lineHeight: 1.35,
                    color: '#98a4b5',
                  },
                  children: `Symptom: ${symptomText}`,
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
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: '8px',
            },
            children: stepChildren,
          },
        },
      ],
    },
  };

  return svgToPngBuffer(tree, COVER_WIDTH, COVER_HEIGHT);
}

export async function renderVsOgPng(pair: VsPair): Promise<Buffer> {
  const { primary, secondary, relationType, note } = pair;
  const pFm = primary.frontmatter;
  const sFm = secondary.frontmatter;
  const pColors = getMaturityColors(pFm.maturity_status);
  const sColors = getMaturityColors(sFm.maturity_status);
  const titleA = truncateText(pFm.title, 36);
  const titleB = truncateText(sFm.title, 36);
  const verdictText = truncateText(note, 180);

  const tree = {
    type: 'div',
    props: {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: '#0b0d11',
        color: '#eef2f7',
        padding: '50px 64px',
        fontFamily: 'Inter',
        border: '1px solid #252c38',
      },
      children: [
        // Top Header
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              width: '100%',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  },
                  children: [
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          backgroundColor: '#12161d',
                          border: '1px solid #252c38',
                          fontSize: '20px',
                          fontWeight: 700,
                          color: '#38bdf8',
                        },
                        children: 'frontend.rocks',
                      },
                    },
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          padding: '8px 16px',
                          borderRadius: '8px',
                          backgroundColor: '#181d26',
                          border: '1px solid #252c38',
                          fontSize: '18px',
                          fontWeight: 600,
                          color: '#eef2f7',
                        },
                        children:
                          relationType === 'replaces'
                            ? 'Native Replacement'
                            : 'Mechanical Comparison',
                      },
                    },
                  ],
                },
              },
              ...(pFm.maturity_status || sFm.maturity_status
                ? [
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        },
                        children: [
                          ...(pFm.maturity_status
                            ? [
                                {
                                  type: 'div',
                                  props: {
                                    style: {
                                      display: 'flex',
                                      padding: '6px 14px',
                                      borderRadius: '999px',
                                      backgroundColor: pColors.bg,
                                      border: `1px solid ${pColors.border}`,
                                      fontSize: '15px',
                                      fontWeight: 600,
                                      color: pColors.text,
                                    },
                                    children: formatMaturityLabel(pFm.maturity_status),
                                  },
                                },
                              ]
                            : []),
                          ...(pFm.maturity_status && sFm.maturity_status
                            ? [
                                {
                                  type: 'div',
                                  props: {
                                    style: { fontSize: '16px', color: '#98a4b5', fontWeight: 700 },
                                    children: 'vs',
                                  },
                                },
                              ]
                            : []),
                          ...(sFm.maturity_status
                            ? [
                                {
                                  type: 'div',
                                  props: {
                                    style: {
                                      display: 'flex',
                                      padding: '6px 14px',
                                      borderRadius: '999px',
                                      backgroundColor: sColors.bg,
                                      border: `1px solid ${sColors.border}`,
                                      fontSize: '15px',
                                      fontWeight: 600,
                                      color: sColors.text,
                                    },
                                    children: formatMaturityLabel(sFm.maturity_status),
                                  },
                                },
                              ]
                            : []),
                        ],
                      },
                    },
                  ]
                : []),
            ],
          },
        },
        // Center Comparison Title & Verdict
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
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'baseline',
                    gap: '14px',
                    fontSize: '42px',
                    fontWeight: 700,
                    lineHeight: 1.15,
                    letterSpacing: '-0.02em',
                    color: '#eef2f7',
                  },
                  children: [
                    { type: 'span', props: { children: titleA } },
                    {
                      type: 'span',
                      props: { style: { color: '#38bdf8', fontSize: '34px' }, children: 'vs' },
                    },
                    { type: 'span', props: { children: titleB } },
                  ],
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    padding: '16px 20px',
                    borderRadius: '10px',
                    backgroundColor: '#12161d',
                    border: '1px solid #252c38',
                    fontSize: '21px',
                    lineHeight: 1.4,
                    color: '#98a4b5',
                  },
                  children: verdictText,
                },
              },
            ],
          },
        },
        // Footer
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid #252c38',
              paddingTop: '20px',
              width: '100%',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: { fontSize: '18px', fontWeight: 600, color: '#98a4b5' },
                  children: 'Mechanical Trade-Offs · Browser Internals',
                },
              },
              {
                type: 'div',
                props: {
                  style: { fontSize: '18px', fontWeight: 600, color: '#38bdf8' },
                  children: `frontend.rocks/vs/${pair.slug}`,
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

