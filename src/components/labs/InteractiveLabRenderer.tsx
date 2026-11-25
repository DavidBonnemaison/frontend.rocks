'use client';

import React, { useState } from 'react';
import { Check, Code2 } from 'lucide-react';
import type { InteractivePrimitiveConfig } from '@/lib/schemas';
import { track } from '@/lib/analytics';
import { StepMachineLab } from './StepMachineLab';
import { PatternComparatorLab } from './PatternComparatorLab';
import { ConstraintSimulatorLab } from './ConstraintSimulatorLab';
import { LiveSandboxLab } from './LiveSandboxLab';

export function getEmbedIframeSnippet(labId: string): string {
  return `<iframe src="https://frontend.rocks/embed/lab/${labId}/" width="100%" height="520" loading="lazy" style="border:1px solid #1e293b;border-radius:8px;"></iframe>`;
}

export function EmbedLabButton({ labId }: { labId: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const snippet = getEmbedIframeSnippet(labId);
    try {
      await navigator.clipboard.writeText(snippet);
      track('embed_copy', labId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = snippet;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      if (document.execCommand('copy')) {
        track('embed_copy', labId);
      }
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="lab-btn lab-btn-ghost lab-embed-btn"
      data-testid="lab-embed-button"
      aria-label={copied ? 'Embed code copied' : 'Copy embed iframe code'}
      title="Copy iframe embed code"
    >
      {copied ? <Check size={14} aria-hidden="true" /> : <Code2 size={14} aria-hidden="true" />}
      <span>{copied ? 'Copied' : 'Embed'}</span>
    </button>
  );
}

export function InteractiveLabRenderer({
  config,
  showEmbedButton = true,
}: {
  config: InteractivePrimitiveConfig;
  showEmbedButton?: boolean;
}) {
  const embedButton = showEmbedButton ? <EmbedLabButton labId={config.id} /> : null;

  switch (config.type) {
    case 'step-machine':
      return <StepMachineLab config={config} headerExtra={embedButton} />;
    case 'pattern-comparator':
      return <PatternComparatorLab config={config} headerExtra={embedButton} />;
    case 'constraint-simulator':
      return <ConstraintSimulatorLab config={config} headerExtra={embedButton} />;
    case 'live-sandbox':
      return <LiveSandboxLab config={config} headerExtra={embedButton} />;
  }
}
