'use client';

import { useState } from 'react';
import styles from './mcp-console.module.css';

type ToolId = 'resolve_data_need' | 'find_service' | 'check_trust';

type Tool = {
  id: ToolId;
  label: string;
  argName: string;
  placeholder: string;
  examples: string[];
  defaultValue: string;
};

const TOOLS: Tool[] = [
  {
    id: 'resolve_data_need',
    label: 'resolve_data_need',
    argName: 'task',
    placeholder: 'get current weather for singapore',
    examples: ['current weather', 'translate to French', 'token prices'],
    defaultValue: 'current weather',
  },
  {
    id: 'find_service',
    label: 'find_service',
    argName: 'need',
    placeholder: 'token prices',
    examples: ['weather data', 'token prices', 'translation'],
    defaultValue: '',
  },
  {
    id: 'check_trust',
    label: 'check_trust',
    argName: 'name',
    placeholder: 'weatherpro.agentindex.eth',
    examples: ['scamco', 'weatherpro', 'weatherpro.agentindex.eth'],
    defaultValue: '',
  },
];

// Recommendation / verdict tokens we lightly colorize inside the JSON block.
const GOOD = new Set(['trusted']);
const WARN = new Set(['caution', 'unproven']);
const BAD = new Set(['avoid']);

function renderJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

/**
 * Split the pretty JSON into lines and wrap recommendation string values in a
 * colored span so 'avoid' / 'trusted' pop, without a full syntax highlighter.
 */
function Highlighted({ json }: { json: string }) {
  const lines = json.split('\n');
  return (
    <>
      {lines.map((line, i) => {
        const match = line.match(/"(recommendation|verdict)":\s*"([^"]+)"/);
        if (match) {
          const verdict = match[2];
          const cls = GOOD.has(verdict)
            ? styles.good
            : BAD.has(verdict)
              ? styles.bad
              : WARN.has(verdict)
                ? styles.warn
                : undefined;
          const idx = line.indexOf(`"${verdict}"`);
          const before = line.slice(0, idx);
          const after = line.slice(idx + verdict.length + 2);
          return (
            <span key={i} className={styles.line}>
              {before}
              <span className={cls}>&quot;{verdict}&quot;</span>
              {after}
              {'\n'}
            </span>
          );
        }
        return (
          <span key={i} className={styles.line}>
            {line}
            {'\n'}
          </span>
        );
      })}
    </>
  );
}

export function McpConsole() {
  const [toolId, setToolId] = useState<ToolId>('resolve_data_need');
  const [value, setValue] = useState<string>(TOOLS[0].defaultValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);
  // The call we actually ran (frozen at run time) so the echo matches the shown result.
  const [ranCall, setRanCall] = useState<string | null>(null);

  const tool = TOOLS.find((t) => t.id === toolId)!;
  const trimmed = value.trim();
  const callEcho = `${tool.label}({ ${tool.argName}: ${JSON.stringify(trimmed)} })`;

  function selectTool(id: ToolId) {
    if (id === toolId) return;
    const next = TOOLS.find((t) => t.id === id)!;
    setToolId(id);
    setValue(next.defaultValue);
    setError(null);
    setResult(null);
    setRanCall(null);
  }

  async function run() {
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setRanCall(callEcho);

    try {
      let res: Response;
      if (tool.id === 'resolve_data_need') {
        res = await fetch('/api/resolve', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ task: trimmed }),
        });
      } else if (tool.id === 'find_service') {
        res = await fetch(`/api/find?need=${encodeURIComponent(trimmed)}`);
      } else {
        res = await fetch(`/api/trust?name=${encodeURIComponent(trimmed)}`);
      }

      const text = await res.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          `Non-JSON response (HTTP ${res.status})${text ? `: ${text.slice(0, 200)}` : ''}`,
        );
      }

      if (!res.ok) {
        // Surface the endpoint's own error shape if present, else a status line.
        const msg =
          data && typeof data === 'object' && 'error' in data
            ? String((data as { error: unknown }).error)
            : `Request failed (HTTP ${res.status})`;
        setError(msg);
        setResult(data);
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      run();
    }
  }

  return (
    <div className={styles.console}>
      <div
        className={styles.tabs}
        role="tablist"
        aria-label="Choose an index tool"
      >
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === toolId}
            className={`${styles.tab} ${t.id === toolId ? styles.tabOn : ''}`}
            onClick={() => selectTool(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className={styles.inputRow}>
        <label className={styles.srOnly} htmlFor="mcp-arg">
          {tool.argName}
        </label>
        <span className={styles.argLabel} aria-hidden="true">
          {tool.argName}
        </span>
        <input
          id="mcp-arg"
          className={styles.input}
          type="text"
          value={value}
          placeholder={tool.placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          className={styles.run}
          onClick={run}
          disabled={!trimmed || loading}
        >
          {loading ? 'Running…' : 'Run'}
        </button>
      </div>

      <div className={styles.chips}>
        {tool.examples.map((ex) => (
          <button
            key={ex}
            type="button"
            className={styles.exampleChip}
            onClick={() => setValue(ex)}
          >
            {ex}
          </button>
        ))}
      </div>

      <div className={styles.echoLabel}>Call</div>
      <pre className={styles.echo} aria-live="polite">
        <code>{ranCall ?? callEcho}</code>
      </pre>

      <div className={styles.echoLabel}>Response</div>
      <div className={styles.panel} role="region" aria-label="Tool response">
        {loading && <div className={styles.status}>Calling the index…</div>}
        {!loading && error && (
          <div className={`${styles.status} ${styles.errorText}`}>{error}</div>
        )}
        {!loading && result != null && (
          <pre className={styles.json} tabIndex={0}>
            <code>
              <Highlighted json={renderJson(result)} />
            </code>
          </pre>
        )}
        {!loading && !error && result == null && (
          <div className={styles.status}>
            Pick a tool, tweak the input, and hit Run to see the live index
            response.
          </div>
        )}
      </div>

      <p className={styles.caption}>
        These are the same tools your agent calls over MCP — copy the config
        above to use them in Claude or Cursor.
      </p>
    </div>
  );
}
