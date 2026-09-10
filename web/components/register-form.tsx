'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import styles from '../app/register/register.module.css';

type Tx = { step: string; hash: string; url: string };

type SuccessResult = {
  ok: true;
  label: string;
  ensName: string;
  txs: Tx[];
  message: string;
};

type Method = 'GET' | 'POST';

const SAMPLE = {
  label: 'airquality',
  description: 'Air quality index by city',
  method: 'GET' as Method,
  price: '$0.001',
  url: 'https://your-host/airquality/current',
  requiredFields: 'aqi, city, category',
};

function sanitizeLabel(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function RegisterForm() {
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [method, setMethod] = useState<Method>('GET');
  const [price, setPrice] = useState('');
  const [url, setUrl] = useState('');
  const [requiredFields, setRequiredFields] = useState('');

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SuccessResult | null>(null);

  const preview = useMemo(
    () => (label ? `${label}.agentindex.eth` : 'yourlabel.agentindex.eth'),
    [label],
  );

  function fillSample() {
    setLabel(SAMPLE.label);
    setDescription(SAMPLE.description);
    setMethod(SAMPLE.method);
    setPrice(SAMPLE.price);
    setUrl(SAMPLE.url);
    setRequiredFields(SAMPLE.requiredFields);
    setError(null);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;

    setError(null);
    setResult(null);
    setPending(true);

    const fields = requiredFields
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          label,
          url,
          method,
          price,
          description,
          requiredFields: fields,
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | SuccessResult
        | { error?: string }
        | null;

      if (!res.ok) {
        const message =
          (data && 'error' in data && data.error) ||
          `Registration failed (HTTP ${res.status}).`;
        setError(message);
        return;
      }

      if (!data || !('ok' in data) || !data.ok) {
        setError('Unexpected response from the registrar.');
        return;
      }

      setResult(data);
    } catch {
      setError('Network error — could not reach the registrar. Try again.');
    } finally {
      setPending(false);
    }
  }

  if (result) {
    return (
      <div className={`tile ${styles.panel}`} role="status">
        <div className={styles.successHead}>
          <span className={styles.successDot} aria-hidden="true" />
          <h2 className={styles.panelTitle}>Registered on-chain</h2>
        </div>
        <p className={styles.ensLine}>
          <span className="dim">ENS name</span>{' '}
          <span className={styles.ensName}>{result.ensName}</span>
        </p>

        <ol className={styles.txList}>
          {result.txs.map((tx) => (
            <li key={tx.hash} className={styles.txItem}>
              <span className={styles.txStep}>{tx.step}</span>
              <a
                className={styles.txLink}
                href={tx.url}
                target="_blank"
                rel="noreferrer"
              >
                {tx.hash.slice(0, 10)}…{tx.hash.slice(-8)} ↗
              </a>
            </li>
          ))}
        </ol>

        {result.message ? (
          <p className={styles.successMsg}>{result.message}</p>
        ) : null}

        <p className={styles.successMsg}>
          Your service is registered — it&apos;ll be probed within a cycle.
        </p>

        <div className={styles.panelActions}>
          <Link className={styles.primaryLink} href={`/service/${result.label}`}>
            View its track record →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <fieldset className={styles.fieldset} disabled={pending}>
        <div className={styles.toolbar}>
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={fillSample}
          >
            Use sample
          </button>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="reg-label">
            Label
          </label>
          <input
            id="reg-label"
            className={styles.input}
            type="text"
            inputMode="text"
            autoComplete="off"
            placeholder="airquality"
            value={label}
            onChange={(e) => setLabel(sanitizeLabel(e.target.value))}
            required
            aria-describedby="reg-label-hint"
          />
          <p id="reg-label-hint" className={styles.hint}>
            Lowercase letters and digits only. Your name:{' '}
            <span className={styles.preview}>{preview}</span>
          </p>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="reg-description">
            Description
          </label>
          <input
            id="reg-description"
            className={styles.input}
            type="text"
            autoComplete="off"
            placeholder="Air quality index by city"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="reg-method">
              Method
            </label>
            <select
              id="reg-method"
              className={styles.input}
              value={method}
              onChange={(e) => setMethod(e.target.value as Method)}
              required
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="reg-price">
              Price
            </label>
            <input
              id="reg-price"
              className={styles.input}
              type="text"
              autoComplete="off"
              placeholder="$0.001"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="reg-url">
            Endpoint URL
          </label>
          <input
            id="reg-url"
            className={styles.input}
            type="url"
            autoComplete="off"
            placeholder="https://your-host/airquality/current"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="reg-fields">
            Required fields
          </label>
          <input
            id="reg-fields"
            className={styles.input}
            type="text"
            autoComplete="off"
            placeholder="aqi, city, category"
            value={requiredFields}
            onChange={(e) => setRequiredFields(e.target.value)}
            required
            aria-describedby="reg-fields-hint"
          />
          <p id="reg-fields-hint" className={styles.hint}>
            Comma-separated. This is the spec the prober verifies your honesty
            against.
          </p>
        </div>

        {error ? (
          <div className={styles.alert} role="alert">
            {error}
          </div>
        ) : null}

        <div className={styles.submitRow}>
          <button type="submit" className={styles.submit} disabled={pending}>
            {pending ? (
              <>
                <span className={styles.spinner} aria-hidden="true" />
                Registering on-chain…
              </>
            ) : (
              'Register on-chain'
            )}
          </button>
          {pending ? (
            <p className={styles.pendingMsg} role="status">
              Registering on-chain… this takes ~a minute (ENS subname + manifest
              records).
            </p>
          ) : null}
        </div>
      </fieldset>
    </form>
  );
}
