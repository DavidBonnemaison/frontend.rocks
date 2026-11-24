'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { formatDomainLabel } from '@/lib/ui-strings';
import './CausalChainStepper.css';

export interface CausalChainStepItem {
  conceptId: string;
  stepOrder: number;
  title: string;
  domain: string;
  roleInChain: string;
  summaryTldr: string;
}

export function CausalChainStepper({ steps }: { steps: CausalChainStepItem[] }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="causal-chain-wrapper" data-testid="causal-chain-stepper">
      <ol className="causal-chain-track" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {steps.map((step) => {
          const isHovered = hoveredId === step.conceptId;
          return (
            <li
              key={step.conceptId}
              className="causal-step-card"
              onMouseEnter={() => setHoveredId(step.conceptId)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div className="causal-step-header">
                <span className="causal-step-order">
                  {String(step.stepOrder).padStart(2, '0')}
                </span>
                <span className="causal-step-domain">{formatDomainLabel(step.domain)}</span>
              </div>

              <Link href={`/concepts/${step.conceptId}`} className="causal-step-title">
                <span>{step.title}</span>
                <ArrowRight size={14} aria-hidden="true" />
              </Link>

              <p className="causal-step-role">{step.roleInChain}</p>

              {isHovered && step.summaryTldr && (
                <div className="causal-step-tldr" role="note">
                  {step.summaryTldr}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
