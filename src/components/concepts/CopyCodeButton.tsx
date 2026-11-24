'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';

export interface CopyCodeButtonProps {
  rawCode: string;
  label?: string;
  className?: string;
}

const FEEDBACK_DURATION_MS = 1800;

export function CopyCodeButton({ rawCode, label, className }: CopyCodeButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const triggerFeedback = () => {
    setCopied(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setCopied(false);
      timerRef.current = null;
    }, FEEDBACK_DURATION_MS);
  };

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(rawCode);
        triggerFeedback();
        return;
      }
      throw new Error('Clipboard API unavailable');
    } catch {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = rawCode;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        triggerFeedback();
      } catch {
        // Ignore if both Clipboard API and execCommand fail in restricted environments
      }
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={className ? `code-copy-btn ${className}` : 'code-copy-btn'}
      data-testid="copy-code-button"
      data-copied={copied ? 'true' : 'false'}
      aria-label={copied ? 'Copied to clipboard' : (label ?? 'Copy code to clipboard')}
    >
      {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}
