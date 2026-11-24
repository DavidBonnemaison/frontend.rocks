import type { LoadedAutopsy, LoadedConcept } from './content-loader';
import { formatDomainLabel } from './ui-strings';

export const SITE_URL = 'https://frontend.rocks';

export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitProductionPitfalls(markdown: string): {
  mainPitfalls: string;
  whenNotToUse: string;
} {
  const lines = markdown.split('\n');
  const mainLines: string[] = [];
  const whenNotLines: string[] = [];

  for (const line of lines) {
    if (/^\s*-\s+\*\*When not to use\b/i.test(line)) {
      whenNotLines.push(line);
    } else {
      mainLines.push(line);
    }
  }

  return {
    mainPitfalls: mainLines.join('\n').trim(),
    whenNotToUse: whenNotLines.join('\n').trim(),
  };
}

function truncateCleanly(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  if (maxLength <= 1) return text.slice(0, maxLength);
  const sliced = text.slice(0, maxLength - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  const base = lastSpace > Math.floor(maxLength * 0.5) ? sliced.slice(0, lastSpace) : sliced;
  return `${base.replace(/[\s,;:\-—]+$/, '')}…`;
}

export function formatConceptTitle(title: string): string {
  const full = `${title} — Browser Internals & Production Pitfalls | frontend.rocks`;
  if (full.length <= 60) return full;

  const medium = `${title} — Browser Internals | frontend.rocks`;
  if (medium.length <= 60) return medium;

  const shortSuffix = ' | frontend.rocks';
  const simple = `${title}${shortSuffix}`;
  if (simple.length <= 60) return simple;

  return `${truncateCleanly(title, 60 - shortSuffix.length)}${shortSuffix}`;
}

export function formatAutopsyTitle(symptom: string, caseNumber: number): string {
  const suffix = ` — Autopsy #${String(caseNumber).padStart(2, '0')} | frontend.rocks`;
  const maxSymptomLen = Math.max(10, 60 - suffix.length);
  const shortSymptom = truncateCleanly(symptom, maxSymptomLen);
  return `${shortSymptom}${suffix}`;
}

export function formatVsTitle(titleA: string, titleB: string): string {
  const full = `${titleA} vs ${titleB}: Mechanical Trade-Offs | frontend.rocks`;
  if (full.length <= 60) return full;

  const shortSuffix = ' | frontend.rocks';
  const medium = `${titleA} vs ${titleB}${shortSuffix}`;
  if (medium.length <= 60) return medium;

  return `${truncateCleanly(`${titleA} vs ${titleB}`, 60 - shortSuffix.length)}${shortSuffix}`;
}

const ORGANIZATION_REF = {
  '@type': 'Organization',
  name: 'frontend.rocks',
  url: SITE_URL,
};

export interface JsonLdGraph {
  '@context': 'https://schema.org';
  '@graph': Record<string, unknown>[];
}

export function buildConceptJsonLd(
  concept: LoadedConcept,
  dateModified?: string
): JsonLdGraph {
  const { frontmatter, sections } = concept;
  const pageUrl = `${SITE_URL}/concepts/${frontmatter.id}/`;
  const { mainPitfalls, whenNotToUse } = splitProductionPitfalls(sections.production_pitfalls);

  const faqEntries: Record<string, unknown>[] = [
    {
      '@type': 'Question',
      name: `What problem does ${frontmatter.title} solve?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: frontmatter.summary_tldr,
      },
    },
  ];

  const pitfallsText = stripMarkdown(mainPitfalls);
  if (pitfallsText.length > 0) {
    faqEntries.push({
      '@type': 'Question',
      name: `Why does ${frontmatter.title} fail in production?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: pitfallsText,
      },
    });
  }

  const whenNotText = stripMarkdown(whenNotToUse);
  if (whenNotText.length > 0) {
    faqEntries.push({
      '@type': 'Question',
      name: `When should you avoid ${frontmatter.title}?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: whenNotText,
      },
    });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        '@id': `${pageUrl}#article`,
        headline: frontmatter.title,
        description: frontmatter.summary_tldr,
        url: pageUrl,
        dateModified: dateModified ?? frontmatter.last_verified_at,
        proficiencyLevel: 'Expert',
        inLanguage: 'en',
        author: ORGANIZATION_REF,
        publisher: ORGANIZATION_REF,
        citation: frontmatter.sources,
      },
      {
        '@type': 'FAQPage',
        '@id': `${pageUrl}#faq`,
        mainEntity: faqEntries,
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${pageUrl}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: `${SITE_URL}/`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: formatDomainLabel(frontmatter.domain),
            item: `${SITE_URL}/index-list/`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: frontmatter.title,
            item: pageUrl,
          },
        ],
      },
    ],
  };
}

export function buildAutopsyJsonLd(
  autopsy: LoadedAutopsy,
  dateModified?: string
): JsonLdGraph {
  const { frontmatter, sections } = autopsy;
  const pageUrl = `${SITE_URL}/autopsies/${frontmatter.id}/`;

  const incidentText = stripMarkdown(sections.incident_report);
  const fixText = stripMarkdown(sections.architectural_fix);

  const faqEntries: Record<string, unknown>[] = [];
  if (incidentText.length > 0) {
    faqEntries.push({
      '@type': 'Question',
      name: `What causes: ${frontmatter.symptom}`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: incidentText,
      },
    });
  }
  if (fixText.length > 0) {
    faqEntries.push({
      '@type': 'Question',
      name: `How do you fix ${frontmatter.title}?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: fixText,
      },
    });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        '@id': `${pageUrl}#article`,
        headline: frontmatter.title,
        description: frontmatter.symptom,
        url: pageUrl,
        dateModified: dateModified ?? frontmatter.last_verified_at,
        proficiencyLevel: 'Expert',
        inLanguage: 'en',
        author: ORGANIZATION_REF,
        publisher: ORGANIZATION_REF,
        citation: frontmatter.sources,
      },
      ...(faqEntries.length > 0
        ? [
            {
              '@type': 'FAQPage',
              '@id': `${pageUrl}#faq`,
              mainEntity: faqEntries,
            },
          ]
        : []),
      {
        '@type': 'BreadcrumbList',
        '@id': `${pageUrl}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: `${SITE_URL}/`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Architecture Autopsies',
            item: `${SITE_URL}/autopsies/`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: frontmatter.title,
            item: pageUrl,
          },
        ],
      },
    ],
  };
}

export function formatSymptomTitle(title: string): string {
  const shortSuffix = ' | frontend.rocks';
  const full = `${title}${shortSuffix}`;
  if (full.length <= 60) return full;
  return `${truncateCleanly(title, 60 - shortSuffix.length)}${shortSuffix}`;
}

export function buildVsJsonLd(params: {
  slug: string;
  titleA: string;
  titleB: string;
  summary: string;
  sources: string[];
  dateModified: string;
  faq?: Array<{ question: string; answer: string }>;
}): JsonLdGraph {
  const pageUrl = `${SITE_URL}/vs/${params.slug}/`;
  const headline = `${params.titleA} vs ${params.titleB}`;

  const faqEntities = (
    params.faq && params.faq.length > 0
      ? params.faq
      : [
          {
            question: `What is the mechanical difference between ${params.titleA} and ${params.titleB}?`,
            answer: params.summary,
          },
        ]
  ).map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.answer,
    },
  }));

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        '@id': `${pageUrl}#article`,
        headline,
        description: params.summary,
        url: pageUrl,
        dateModified: params.dateModified,
        proficiencyLevel: 'Expert',
        inLanguage: 'en',
        author: ORGANIZATION_REF,
        publisher: ORGANIZATION_REF,
        citation: params.sources,
      },
      {
        '@type': 'FAQPage',
        '@id': `${pageUrl}#faq`,
        mainEntity: faqEntities,
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${pageUrl}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: `${SITE_URL}/`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Comparisons',
            item: `${SITE_URL}/vs/`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: headline,
            item: pageUrl,
          },
        ],
      },
    ],
  };
}

export function buildSymptomJsonLd(params: {
  slug: string;
  title: string;
  summary: string;
  devtoolsSignature?: string;
  sources?: string[];
  dateModified?: string;
}): JsonLdGraph {
  const pageUrl = `${SITE_URL}/symptoms/${params.slug}/`;

  const faqEntities = [
    {
      '@type': 'Question',
      name: `What causes: ${params.title}?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: params.summary,
      },
    },
    ...(params.devtoolsSignature
      ? [
          {
            '@type': 'Question',
            name: `How do you identify "${params.title}" in DevTools?`,
            acceptedAnswer: {
              '@type': 'Answer',
              text: params.devtoolsSignature,
            },
          },
        ]
      : []),
  ];

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        '@id': `${pageUrl}#article`,
        headline: params.title,
        description: params.summary,
        url: pageUrl,
        ...(params.dateModified ? { dateModified: params.dateModified } : {}),
        proficiencyLevel: 'Expert',
        inLanguage: 'en',
        author: ORGANIZATION_REF,
        publisher: ORGANIZATION_REF,
        ...(params.sources && params.sources.length > 0 ? { citation: params.sources } : {}),
      },
      {
        '@type': 'FAQPage',
        '@id': `${pageUrl}#faq`,
        mainEntity: faqEntities,
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${pageUrl}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: `${SITE_URL}/`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Production Symptoms',
            item: `${SITE_URL}/symptoms/`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: params.title,
            item: pageUrl,
          },
        ],
      },
    ],
  };
}
