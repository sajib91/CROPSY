'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { AlertTriangleIcon } from '../ui';

function detailMessage(details) {
  if (typeof details?.message === 'string') return details.message;
  if (typeof details?.code === 'string') return details.code;
  return null;
}

function fieldErrorsFrom(details) {
  const result = {};
  const groups = details?.fieldErrors || {};

  for (const [name, messages] of Object.entries(groups)) {
    if (Array.isArray(messages) && messages.length > 0) {
      result[name] = messages.join(' ');
    }
  }

  return result;
}

export function ErrorSummary({
  message,
  fields = {},
  retryAfterSeconds,
  retryAfterLabel,
  summaryRef,
}) {
  if (!message) return null;

  const names = Object.keys(fields);
  const retryAfterText =
    retryAfterSeconds && typeof retryAfterLabel === 'string'
      ? retryAfterLabel.replace('{seconds}', String(retryAfterSeconds))
      : null;

  return (
    <div
      ref={summaryRef}
      role="alert"
      tabIndex={-1}
      className="flex flex-col gap-2 rounded-control border border-danger-border bg-danger-bg p-4 focus-ring"
    >
      <p className="flex items-start gap-2 text-body-sm font-semibold text-content">
        <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
        <span>{message}</span>
      </p>
      {retryAfterText ? (
        <p className="pl-6 text-caption text-content-muted">{retryAfterText}</p>
      ) : null}
      {names.length > 0 ? (
        <ul className="ml-6 list-disc text-caption text-content-muted">
          {names.map((name) => (
            <li key={name}>
              <strong>{name}</strong>: {fields[name]}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function useAuthForm(labels = {}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [fields, setFields] = useState({});
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(null);
  const summaryRef = useRef(null);

  const clear = useCallback(() => {
    setMessage(null);
    setFields({});
    setRetryAfterSeconds(null);
  }, []);

  const fail = useCallback((error, fallback) => {
    setMessage(detailMessage(error?.details) || error?.message || fallback);
    setFields(fieldErrorsFrom(error?.details));
    setRetryAfterSeconds(error?.retryAfterSeconds ?? null);
    requestAnimationFrame(() => summaryRef.current?.focus());
  }, []);

  const failWith = useCallback((text, nextFields = {}) => {
    setMessage(text);
    setFields(nextFields);
    setRetryAfterSeconds(null);
    requestAnimationFrame(() => summaryRef.current?.focus());
  }, []);

  const run = useCallback(
    async (task, fallback) => {
      setBusy(true);
      clear();
      try {
        return await task();
      } catch (error) {
        fail(error, fallback);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [clear, fail],
  );

  const renderSummary = useCallback(
    () => (
      <ErrorSummary
        message={message}
        fields={fields}
        retryAfterSeconds={retryAfterSeconds}
        retryAfterLabel={labels.retryAfter}
        summaryRef={summaryRef}
      />
    ),
    [fields, labels.retryAfter, message, retryAfterSeconds],
  );

  return useMemo(
    () => ({
      busy,
      message,
      fields,
      run,
      failWith,
      renderSummary,
    }),
    [busy, message, fields, run, failWith, renderSummary],
  );
}
