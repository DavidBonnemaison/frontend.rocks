import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { MDXRemote } from 'next-mdx-remote/rsc';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, ArrowUpRight, Clock, Flame } from 'lucide-react';
import { getAllAutopsies, getAllConcepts, getAutopsyById } from '@/lib/content-loader';
import { formatFailureModeLabel, UI_STRINGS } from '@/lib/ui-strings';
import { InteractiveLabRenderer } from '@/components/labs/InteractiveLabRenderer';
import type { InteractivePrimitiveConfig, AutopsyCaseFile } from '@/lib/schemas';
import {
  ConceptInlineLink,
  type ConceptPreviewData,
} from '@/components/concepts/ConceptInlineLink';
import { ConceptCodeBlock } from '@/components/concepts/ConceptCodeBlock';
import type { Metadata } from 'next';
import {
  CausalChainStepper,
  type CausalChainStepItem,
} from '@/components/autopsies/CausalChainStepper';
import { CaseFileCard } from '@/components/autopsies/CaseFileCard';
import { DevToolsDetective } from '@/components/autopsies/DevToolsDetective';
import {
  buildAutopsyJsonLd,
  formatAutopsyTitle,
  SITE_URL,
} from '@/lib/seo-schema';
import '../autopsy-detail.css';
import { isPublished, robotsForStatus } from '@/lib/publication';
import type { Claim } from '@/lib/proof/claim-schema';
import { getAllClaims, getClaimsForPage } from '@/lib/proof/claims-loader';
import {
  buildClaimsBySlug,
  createProofMdxComponents,
} from '@/components/proof/mdx-components';
import { ProofChip } from '@/components/proof/ProofChip';
import { ProofDegradedBanner } from '@/components/proof/ProofDegradedBanner';
import { ProofPanel } from '@/components/proof/ProofPanel';
import { summarizePageProof } from '@/lib/proof/page-proof';

let cachedClaimsById: Map<string, Claim> | null = null;
function getClaimsById(): Map<string, Claim> {
  if (!cachedClaimsById) {
    cachedClaimsById = new Map(getAllClaims().map((c) => [c.id, c]));
  }
  return cachedClaimsById;
}

export function generateStaticParams() {
  return getAllAutopsies().map((a) => ({ slug: a.frontmatter.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const autopsy = getAutopsyById(slug);
  if (!autopsy) return {};

  const { frontmatter } = autopsy;
  const title = formatAutopsyTitle(frontmatter.symptom, frontmatter.case_number);
  const description = frontmatter.symptom;
  const canonicalUrl = `${SITE_URL}/autopsies/${frontmatter.id}/`;
  const ogImageUrl = `${SITE_URL}/og/autopsies/${frontmatter.id}.png`;

  return {
    title,
    description,
    robots: robotsForStatus(frontmatter.proof_status, frontmatter.id),
    alternates: {
      canonical: canonicalUrl,
      ...(isPublished(frontmatter.proof_status, frontmatter.id) ? { types: { 'text/markdown': `${SITE_URL}/autopsies/${frontmatter.id}.md` } } : {}),
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: 'article',
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: frontmatter.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

function MdxBlock({
  pageId,
  source,
  conceptPreviews,
  causalSteps,
  lab,
  caseFile,
}: {
  pageId: string;
  source: string;
  conceptPreviews: Record<string, ConceptPreviewData>;
  causalSteps: CausalChainStepItem[];
  lab: InteractivePrimitiveConfig | null;
  caseFile: AutopsyCaseFile;
}) {
  const proofComponents = createProofMdxComponents({
    pageId,
    claimsBySlug: buildClaimsBySlug(getClaimsForPage(pageId)?.claims ?? []),
    claimsById: getClaimsById(),
  });
  return (
    <div className="mdx-prose autopsy-prose">
      <MDXRemote
        source={source}
        components={{
          ...proofComponents,
          h2: ({ children, ...rest }) => (
            <h2 className="autopsy-narrative-h2" {...rest}>
              {children}
            </h2>
          ),
          a: ({ href, children, ...rest }) => {
            if (href) {
              const match = /^\/concepts\/([a-z0-9-]+)(?:[/?#].*)?$/.exec(href);
              if (match && conceptPreviews[match[1]]) {
                return (
                  <ConceptInlineLink href={href} preview={conceptPreviews[match[1]]}>
                    {children}
                  </ConceptInlineLink>
                );
              }
              if (href.startsWith('/')) {
                return (
                  <Link href={href} {...rest}>
                    {children}
                  </Link>
                );
              }
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1"
                {...rest}
              >
                <span>{children}</span>
                <ArrowUpRight size={14} className="shrink-0" aria-hidden="true" />
              </a>
            );
          },
          pre: (props) => <ConceptCodeBlock {...props} />,
          CausalChainStepper: () => (
            <div id="causal-chain" className="autopsy-inline-widget">
              <CausalChainStepper steps={causalSteps} />
            </div>
          ),
          FailureSimulator: () =>
            lab ? (
              <div id="failure-simulator" className="autopsy-inline-widget">
                <div id="lab">
                  <InteractiveLabRenderer config={lab} />
                </div>
              </div>
            ) : null,
          CaseFile: () => <CaseFileCard caseFile={caseFile} />,
        }}
        options={{
          mdxOptions: {
            remarkPlugins: [remarkGfm],
          },
        }}
      />
    </div>
  );
}

export default async function AutopsyDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const autopsy = getAutopsyById(slug);
  if (!autopsy) notFound();

  const allConcepts = getAllConcepts();
  const conceptMap = new Map(allConcepts.map((c) => [c.frontmatter.id, c.frontmatter]));

  const conceptPreviews: Record<string, ConceptPreviewData> = {};
  for (const c of allConcepts) {
    conceptPreviews[c.frontmatter.id] = {
      id: c.frontmatter.id,
      title: c.frontmatter.title,
      domain: c.frontmatter.domain,
      maturity_status: c.frontmatter.maturity_status,
      summary_tldr: c.frontmatter.summary_tldr,
    };
  }

  const { frontmatter, lab } = autopsy;

  const causalSteps: CausalChainStepItem[] = [...frontmatter.traversed_concepts]
    .sort((a, b) => a.step_order - b.step_order)
    .map((tc) => {
      const target = conceptMap.get(tc.concept_id);
      return {
        conceptId: tc.concept_id,
        stepOrder: tc.step_order,
        title: target?.title ?? tc.concept_id,
        domain: target?.domain ?? 'web-apis',
        roleInChain: tc.role_in_chain,
        summaryTldr: target?.summary_tldr ?? '',
      };
    });

  const jsonLd = buildAutopsyJsonLd(autopsy);
  const proof = summarizePageProof(frontmatter.id, frontmatter.proof_status);
  const showProof = proof !== null && proof.effectiveStatus !== 'unverified';

  return (
    <article className="autopsy-article">
      {isPublished(autopsy.frontmatter.proof_status, autopsy.frontmatter.id) && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <div style={{ marginBottom: '18px' }}>
        <Link
          href="/autopsies"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.86rem',
            color: 'var(--text-muted)',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={14} aria-hidden="true" />
          <span>{UI_STRINGS.autopsies.title}</span>
        </Link>
      </div>

      <header style={{ marginBottom: '28px' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '12px',
          }}
        >
          <span className="badge badge-accent">
            {UI_STRINGS.autopsies.casePrefix}
            {String(frontmatter.case_number).padStart(2, '0')}
          </span>
          <span className="badge" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Flame size={12} aria-hidden="true" />
            {formatFailureModeLabel(frontmatter.failure_mode)}
          </span>
          <span
            className="badge"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <Clock size={12} aria-hidden="true" />
            {frontmatter.reading_time_min} {UI_STRINGS.autopsies.readingTimeSuffix}
          </span>
          {showProof && <ProofChip summary={proof} />}
        </div>

        <h1 style={{ margin: '0 0 14px', fontSize: 'clamp(1.65rem, 3vw, 2.2rem)', lineHeight: 1.2 }}>
          {frontmatter.title}
        </h1>

        {showProof && proof.effectiveStatus === 'degraded' && (
          <ProofDegradedBanner summary={proof} />
        )}

        <div
          className="callout-card"
          style={{
            padding: '14px 16px',
            borderRadius: 'var(--radius-md, 10px)',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
          }}
        >
          <strong style={{ color: 'var(--accent)', fontSize: '0.82rem', textTransform: 'uppercase' }}>
            Production Symptom
          </strong>
          <p style={{ margin: '6px 0 0', fontSize: '0.98rem', lineHeight: 1.5 }}>
            {frontmatter.symptom}
          </p>
        </div>

        {frontmatter.case_type === 'composite' && (
          <p
            className="autopsy-composite-note"
            data-testid="composite-case-note"
            style={{
              margin: '12px 0 0',
              fontSize: '0.86rem',
              fontStyle: 'italic',
              color: 'var(--text-muted)',
            }}
          >
            Composite case. The bug is real and painfully common; the people are made up.
          </p>
        )}
      </header>

      {frontmatter.case_file && (
        <DevToolsDetective
          slug={frontmatter.id}
          caseFile={frontmatter.case_file}
          failureMode={frontmatter.failure_mode}
          hasSimulator={Boolean(lab)}
        />
      )}

      <div id="incident-report" className="autopsy-narrative-body">
        <MdxBlock
          pageId={frontmatter.id}
          source={autopsy.body}
          conceptPreviews={conceptPreviews}
          causalSteps={causalSteps}
          lab={lab}
          caseFile={frontmatter.case_file}
        />
      </div>

      {showProof && <ProofPanel summary={proof} />}

      {/* Primary Sources */}
      <section id="sources" aria-labelledby="sec-sources" style={{ marginTop: '2.5rem' }}>
        <h2 id="sec-sources" className="autopsy-narrative-h2">
          {UI_STRINGS.sections.primarySources}
        </h2>
        <div className="autopsy-prose">
          <ul>
            {frontmatter.sources.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-analytics-event="spec_link_click"
                  data-analytics-target={frontmatter.id}
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          Last verified: {frontmatter.last_verified_at}
        </p>
      </section>
    </article>
  );
}

