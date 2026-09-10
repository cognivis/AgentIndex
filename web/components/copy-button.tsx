'use client';

import { useState } from 'react';

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" onClick={onCopy} aria-label={label ?? 'Copy to clipboard'}>
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
