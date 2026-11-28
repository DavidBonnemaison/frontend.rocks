'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { DomainLabel } from '@/components/ui/DomainLabel/DomainLabel';
import type { Domain, MaturityStatus } from '@/lib/schemas';
import './ConceptInlineLink.css';

export interface ConceptPreviewData {
  id: string;
  title: string;
  domain: Domain;
  maturity_status: MaturityStatus | null;
  summary_tldr: string;
}

interface ConceptInlineLinkProps {
  href: string;
  preview: ConceptPreviewData;
  children: React.ReactNode;
}

export function ConceptInlineLink({ href, preview, children }: ConceptInlineLinkProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardId = useId();

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const handleOpen = () => {
    clearCloseTimer();
    setIsOpen(true);
  };

  const handleDelayedClose = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 120);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  useEffect(() => {
    return () => clearCloseTimer();
  }, []);

  return (
    <span
      ref={containerRef}
      className="concept-inline-wrapper"
      onMouseEnter={handleOpen}
      onMouseLeave={handleDelayedClose}
    >
      <a
        href={href}
        className="concept-inline-link"
        aria-describedby={isOpen ? cardId : undefined}
        onFocus={handleOpen}
        onBlur={handleDelayedClose}
      >
        {children}
      </a>
      <button
        type="button"
        className="concept-inline-info-btn"
        aria-label={`Preview ${preview.title}`}
        aria-expanded={isOpen}
        aria-controls={isOpen ? cardId : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          clearCloseTimer();
          setIsOpen((prev) => !prev);
        }}
      >
        <Info size={12} strokeWidth={1.5} aria-hidden="true" />
      </button>

      {isOpen && (
        <span
          id={cardId}
          role="tooltip"
          className="concept-preview-card"
          onMouseEnter={handleOpen}
          onMouseLeave={handleDelayedClose}
        >
          <DomainLabel domain={preview.domain} />
          <span className="concept-preview-title">{preview.title}</span>
          <span className="concept-preview-tldr">{preview.summary_tldr}</span>
        </span>
      )}
    </span>
  );
}
