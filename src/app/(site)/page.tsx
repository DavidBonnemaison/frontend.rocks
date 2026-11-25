import React from 'react';
import Link from 'next/link';
import { ArrowRight, Compass, Flame, Radar } from 'lucide-react';
import {
  getAllAutopsies,
  getAllConcepts,
  getAllDigests,
  getLearningPaths,
} from '@/lib/content-loader';
import { getFeaturedSymptoms } from '@/config/symptoms';
import { formatFailureModeLabel, UI_STRINGS } from '@/lib/ui-strings';
import { PathPreview, type PathPreviewConcept } from '@/components/home/PathPreview';
import { LearningPathCard } from '@/components/home/LearningPathCard';
import './home.css';

export default function HomePage() {
  const concepts = getAllConcepts();
  const allAutopsies = getAllAutopsies();
  const autopsies = allAutopsies.slice(0, 3);
  const conceptMap = new Map(concepts.map((c) => [c.frontmatter.id, c]));
  const paths = getLearningPaths();
  const symptoms = getFeaturedSymptoms();
  const latestDigest = getAllDigests()[0] ?? null;

  const replacementSignals = concepts
    .flatMap((c) =>
      c.frontmatter.relations
        .filter((r) => r.type === 'replaces')
        .map((r) => ({
          modern: c.frontmatter,
          legacyId: r.target_id,
          legacy: conceptMap.get(r.target_id)?.frontmatter,
          note: r.note,
        }))
    )
    .slice(0, 3);

  const firstPath = paths[0];
  const firstPathConcepts: PathPreviewConcept[] = firstPath
    ? firstPath.concepts
        .map((cid) => conceptMap.get(cid))
        .filter((c): c is NonNullable<typeof c> => Boolean(c))
        .map((c) => ({
          id: c.frontmatter.id,
          title: c.frontmatter.title,
          domain: c.frontmatter.domain,
          maturity_status: c.frontmatter.maturity_status,
          summary_tldr: c.frontmatter.summary_tldr,
          hasLab: c.lab !== null,
        }))
    : [];

  return (
    <div className="home-page">
      {/* Editorial Hero */}
      <section className="home-hero" aria-labelledby="home-hero-title">
        <div className="home-hero-eyebrow">
          <span>{UI_STRINGS.home.heroEyebrow}</span>
        </div>
        <h1 id="home-hero-title" className="home-hero-title">
          {UI_STRINGS.brand.heroTitle}
        </h1>
        <p className="home-hero-subtitle">{UI_STRINGS.brand.heroSubtitle}</p>
        <div className="home-hero-ctas">
          <Link href="/concepts/css-stacking-context#lab" className="lab-btn lab-btn-primary">
            {UI_STRINGS.brand.primaryCta}
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
          <Link href="/graph" className="lab-btn">
            <Compass size={15} aria-hidden="true" />
            {UI_STRINGS.brand.secondaryCta}
          </Link>
        </div>
      </section>

      {/* Door A — Guided Learning Paths */}
      <section className="home-section" aria-labelledby="door-a-title">
        <div className="home-section-head">
          <h2 id="door-a-title" className="home-section-title">
            {UI_STRINGS.home.pathsTitle}
          </h2>
          <p className="home-section-subtitle">{UI_STRINGS.home.pathsSubtitle}</p>
        </div>

        <div className="home-paths-grid">
          {paths.map((p) => {
            const labCount = p.concepts.filter((cid) => conceptMap.get(cid)?.lab != null).length;
            return (
              <LearningPathCard
                key={p.id}
                id={p.id}
                title={p.title}
                description={p.description}
                estimatedMinutes={p.estimatedMinutes}
                labCount={labCount}
                concepts={p.concepts}
              />
            );
          })}
        </div>

        {firstPath && (
          <PathPreview
            pathId={firstPath.id}
            pathTitle={firstPath.title}
            concepts={firstPathConcepts}
          />
        )}
      </section>

      {/* Door B — Debug by Production Symptom */}
      <section className="home-section" aria-labelledby="door-b-title">
        <div className="home-section-head">
          <h2 id="door-b-title" className="home-section-title">
            <Flame size={18} aria-hidden="true" />
            <span>{UI_STRINGS.home.symptomsTitle}</span>
          </h2>
          <p className="home-section-subtitle">{UI_STRINGS.home.symptomsSubtitle}</p>
        </div>

        <div className="home-symptoms-list">
          {symptoms.map((s) => {
            const primaryConceptId = s.concept_ids[0];
            const target = primaryConceptId ? conceptMap.get(primaryConceptId) : undefined;
            return (
              <Link
                key={s.slug}
                href={`/symptoms/${s.slug}/`}
                className="home-symptom-row"
                data-analytics-event="symptom_search"
                data-analytics-target={s.slug}
              >
                <span className="home-symptom-quote">&ldquo;{s.search_title}&rdquo;</span>
                <span className="home-symptom-badge">
                  <span>{target?.frontmatter.title ?? primaryConceptId}</span>
                  <ArrowRight size={13} aria-hidden="true" />
                </span>
              </Link>
            );
          })}
        </div>

        <div className="home-signals-actions">
          <Link href="/symptoms/" className="lab-btn">
            {UI_STRINGS.home.symptomsBrowseAll}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* Door C — Latest Watch & Obsolescence Signals */}
      <section className="home-section" aria-labelledby="door-c-title">
        <div className="home-section-head">
          <h2 id="door-c-title" className="home-section-title">
            <Radar size={18} aria-hidden="true" />
            <span>{UI_STRINGS.home.signalsTitle}</span>
          </h2>
          <p className="home-section-subtitle">{UI_STRINGS.home.signalsSubtitle}</p>
        </div>

        <div className="home-signals-grid">
          {replacementSignals.map((sig) => (
            <article key={`${sig.modern.id}-${sig.legacyId}`} className="home-card">
              <div className="home-signal-pair">
                <Link href={`/concepts/${sig.legacyId}`} className="home-signal-legacy">
                  {sig.legacy?.title ?? sig.legacyId}
                </Link>
                <span aria-hidden="true" className="home-signal-arrow">
                  <ArrowRight size={14} aria-hidden="true" />
                </span>
                <Link href={`/concepts/${sig.modern.id}`} className="home-signal-modern">
                  {sig.modern.title}
                </Link>
              </div>
              <p className="home-card-desc">{sig.note}</p>
            </article>
          ))}
        </div>

        <div className="home-signals-actions">
          <Link href="/obsolescence" className="lab-btn">
            {UI_STRINGS.home.signalsViewAllObsolescence}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
          <Link href="/digest" className="lab-btn">
            {latestDigest
              ? `${UI_STRINGS.home.signalsViewCuratedWatch}: ${latestDigest.title}`
              : UI_STRINGS.home.signalsViewCuratedWatch}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* Door D — Architecture Autopsies */}
      <section className="home-section" aria-labelledby="door-d-title">
        <div className="home-section-head">
          <h2 id="door-d-title" className="home-section-title">
            <Flame size={18} aria-hidden="true" />
            <span>{UI_STRINGS.autopsies.homeSectionTitle}</span>
          </h2>
          <p className="home-section-subtitle">{UI_STRINGS.autopsies.homeSectionSubtitle}</p>
        </div>

        {autopsies.length > 0 && (
          <div className="home-paths-grid">
            {autopsies.map((a) => (
              <article key={a.frontmatter.id} className="home-card">
                <div className="home-path-meta">
                  <span className="badge badge-accent">
                    {UI_STRINGS.autopsies.casePrefix}
                    {String(a.frontmatter.case_number).padStart(2, '0')}
                  </span>
                  <span className="badge">{formatFailureModeLabel(a.frontmatter.failure_mode)}</span>
                </div>
                <h3 className="home-card-title">{a.frontmatter.title}</h3>
                <p className="home-card-desc">{a.frontmatter.symptom}</p>
                <div className="home-card-footer">
                  <Link href={`/autopsies/${a.frontmatter.id}`} className="home-card-link">
                    <span>Inspect autopsy</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="home-signals-actions">
          <Link href="/autopsies" className="lab-btn">
            {UI_STRINGS.autopsies.viewAllAutopsies(allAutopsies.length)}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
