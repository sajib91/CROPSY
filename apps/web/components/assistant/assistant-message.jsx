'use client';

import { Badge } from '@/components/ui';
import { AssistantFeedback } from './assistant-feedback';
import { AssistantCitations, AssistantReferences } from './assistant-sources';

function formatDate(value, locale) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function Meta({ label, value }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <p className="text-caption text-content-muted">
      <span className="font-semibold text-content">{label}: </span>
      {String(value)}
    </p>
  );
}

function ListBlock({ title, items, render, empty }) {
  return (
    <details className="rounded-control border border-line bg-surface-muted/30 p-3">
      <summary className="cursor-pointer text-body-sm font-semibold text-content">{title}</summary>
      <div className="mt-2 flex flex-col gap-2">
        {items?.length
          ? items.map((item, index) => <div key={index}>{render(item, index)}</div>)
          : empty}
      </div>
    </details>
  );
}

function StatusBadge({ status, labels }) {
  if (!status) return null;
  const tone =
    status === 'ok'
      ? 'success'
      : ['insufficient_evidence', 'model_unavailable', 'quality_rejected', 'UNVERIFIED'].includes(
            status,
          )
        ? 'warning'
        : 'neutral';
  return <Badge tone={tone}>{`${labels.statusLabel}: ${status}`}</Badge>;
}

function Claims({ labels, facts, predictions }) {
  const claimItems = [
    ...(Array.isArray(facts) ? facts.map((item) => ({ kind: labels.facts, ...item })) : []),
    ...(Array.isArray(predictions)
      ? predictions.map((item) => ({ kind: labels.predictions, ...item }))
      : []),
  ];

  return (
    <ListBlock
      title={labels.claimsTitle}
      items={claimItems}
      empty={<p className="text-caption text-content-muted">{labels.noClaims}</p>}
      render={(claim, index) => (
        <div className="flex flex-col gap-1 border-l-2 border-brand-300 pl-3">
          <p className="text-body-sm text-content">
            <span className="font-semibold">{claim.kind}: </span>
            {claim.text}
          </p>
          <p className="text-caption text-content-muted">
            {[claim.status, claim.timeframe, claim.asOf].filter(Boolean).join(' · ')}
          </p>
          {Array.isArray(claim.sourceDocumentIds) && claim.sourceDocumentIds.length > 0 ? (
            <p className="text-caption text-content-muted">{claim.sourceDocumentIds.join(', ')}</p>
          ) : null}
          <span className="sr-only">{index + 1}</span>
        </div>
      )}
    />
  );
}

function AssistantAnswer({ message, labels, canFeedback, feedbackState, onFeedback }) {
  const result = message.result || {};
  const answer = result.answer || message.content || labels.shortAnswerUnavailable;
  const traceId = result.traceId;
  const details = [result.model, result.provider, result.detectedLanguage, result.intent]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={result.status} labels={labels} />
        {result.advisory ? <Badge tone="info">{labels.advisory}</Badge> : null}
        {result.isFollowUp ? <Badge tone="brand">{labels.followUp}</Badge> : null}
        {result.status === 'insufficient_evidence' ? (
          <Badge tone="warning">{labels.insufficientEvidence}</Badge>
        ) : null}
      </div>

      <p className="whitespace-pre-wrap text-body-sm text-content">{answer}</p>
      {details ? <p className="text-caption text-content-muted">{details}</p> : null}
      <Meta label={labels.trace} value={traceId} />

      <Claims labels={labels} facts={result.facts} predictions={result.predictions} />

      <ListBlock
        title={labels.citationsTitle}
        items={result.citations}
        empty={<p className="text-caption text-content-muted">{labels.noCitations}</p>}
        render={(citation, index) => (
          <AssistantCitations labels={labels} citations={[citation]} key={index} />
        )}
      />

      <ListBlock
        title={labels.referencesTitle}
        items={result.evidence}
        empty={<p className="text-caption text-content-muted">{labels.noReferences}</p>}
        render={(reference, index) => (
          <div
            key={index}
            className="flex flex-wrap gap-x-4 gap-y-1 rounded-control border border-line p-2 text-caption text-content-muted"
          >
            <Meta label={labels.assetId} value={reference.documentId} />
            <Meta label={labels.section} value={reference.section} />
            <Meta label={labels.sourceName} value={reference.sourceName} />
            <Meta label={labels.jurisdiction} value={reference.jurisdiction} />
            <Meta label={labels.publishedAt} value={reference.publishedAt} />
            <Meta label={labels.score} value={reference.score} />
          </div>
        )}
      />

      <ListBlock
        title={labels.uncertaintiesTitle}
        items={result.uncertainties}
        empty={<p className="text-caption text-content-muted">{labels.noUncertainties}</p>}
        render={(item, index) => (
          <p key={index} className="text-caption text-content">
            <span className="font-semibold">{item.code || labels.uncertainty}: </span>
            {item.message}
          </p>
        )}
      />

      <ListBlock
        title={labels.safetyTitle}
        items={result.safetyNotes}
        empty={null}
        render={(item, index) => (
          <p key={index} className="text-caption text-content">
            {item.message || item.text || item.code}
          </p>
        )}
      />

      <ListBlock
        title={labels.limitationsTitle}
        items={result.limitations}
        empty={<p className="text-caption text-content-muted">{labels.noLimitations}</p>}
        render={(item, index) => (
          <p key={index} className="text-caption text-content">
            {String(item)}
          </p>
        )}
      />

      {result.retrieval || result.citationValidation ? (
        <details className="rounded-control border border-line bg-surface-muted/30 p-3">
          <summary className="cursor-pointer text-body-sm font-semibold text-content">
            {labels.retrievalTitle}
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-caption text-content-muted">
            {JSON.stringify(
              { retrieval: result.retrieval, citationValidation: result.citationValidation },
              null,
              2,
            )}
          </pre>
        </details>
      ) : null}

      {traceId ? (
        <div className="border-t border-line pt-3">
          <AssistantFeedback
            labels={labels}
            canFeedback={canFeedback}
            state={feedbackState?.[message.id]}
            onSubmit={(value) => onFeedback(message, value)}
          />
        </div>
      ) : null}
    </div>
  );
}

function ImageAnalysis({ message, labels, canFeedback, feedbackState, onFeedback }) {
  const result = message.result || {};
  const explanation = result.explanation || {};
  const prediction = result.prediction || {};
  const candidates = Array.isArray(prediction.candidates) ? prediction.candidates : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={result.status} labels={labels} />
        {result.advisory ? <Badge tone="info">{labels.advisory}</Badge> : null}
      </div>
      {explanation.summary ? (
        <p className="whitespace-pre-wrap text-body-sm text-content">{explanation.summary}</p>
      ) : null}
      <Meta label={labels.observation} value={prediction.observations} />
      <Meta label={labels.uncertainty} value={result.uncertainty} />
      {typeof result.confidence === 'number' ? (
        <Meta label={labels.confidence} value={result.confidence.toFixed(3)} />
      ) : null}
      <Meta label={labels.confidenceBasis} value={result.confidenceBasis} />
      <Meta label={labels.trace} value={result.traceId} />

      <ListBlock
        title={labels.candidates}
        items={candidates}
        empty={null}
        render={(item, index) => (
          <p key={index} className="text-caption text-content">
            <span className="font-semibold">{item.label}: </span>
            {typeof item.confidence === 'number' ? item.confidence.toFixed(3) : ''}
            {item.basis ? ` — ${item.basis}` : ''}
          </p>
        )}
      />

      <ListBlock
        title={labels.referencesTitle}
        items={result.references}
        empty={<p className="text-caption text-content-muted">{labels.noReferences}</p>}
        render={(reference, index) => (
          <AssistantReferences labels={labels} references={[reference]} key={index} />
        )}
      />

      <ListBlock
        title={labels.limitationsTitle}
        items={result.limitations}
        empty={<p className="text-caption text-content-muted">{labels.noLimitations}</p>}
        render={(item, index) => (
          <p key={index} className="text-caption text-content">
            {String(item)}
          </p>
        )}
      />

      <ListBlock
        title={labels.nextSteps}
        items={result.nextSteps}
        empty={null}
        render={(step, index) => (
          <p key={index} className="text-caption text-content">
            <span className="font-semibold">{step.action}: </span>
            {step.reason}
          </p>
        )}
      />

      {result.analysisId && result.traceId ? (
        <div className="border-t border-line pt-3">
          <AssistantFeedback
            labels={labels}
            canFeedback={canFeedback}
            state={feedbackState?.[message.id]}
            onSubmit={(value) => onFeedback(message, value)}
          />
        </div>
      ) : null}
    </div>
  );
}

function DocumentUpload({ message, labels }) {
  const result = message.result || {};
  const eligibilityReported = typeof result.citationEligible === 'boolean';
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={result.status} labels={labels} />
        {eligibilityReported ? (
          <Badge tone={result.citationEligible ? 'success' : 'neutral'}>
            {result.citationEligible ? labels.eligible : labels.notEligible}
          </Badge>
        ) : null}
      </div>
      <Meta label={labels.assetId} value={result.assetId} />
      <Meta label={labels.assetKind} value={result.assetKind} />
      <Meta label={labels.eligibilityReason} value={result.citationEligibilityReason} />
      <Meta label={labels.chunkCount} value={result.chunkCount} />
    </div>
  );
}

export function AssistantMessage({
  message,
  labels,
  locale,
  canFeedback,
  feedbackState,
  onFeedback,
}) {
  const isUser = message.kind === 'user';
  const createdAt = formatDate(message.createdAt, locale);
  const label =
    message.kind === 'user'
      ? labels.userLabel
      : message.kind === 'assistant'
        ? labels.assistantLabel
        : message.kind === 'image'
          ? labels.imageLabel
          : labels.documentLabel;

  return (
    <article
      className={`flex flex-col gap-2 rounded-card border p-4 ${
        isUser
          ? 'ml-auto max-w-[90%] border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-950/30'
          : 'mr-auto w-full border-line bg-surface'
      }`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-caption font-semibold text-brand-700 dark:text-brand-300">
          {label}
        </span>
        {createdAt ? <span className="text-caption text-content-subtle">{createdAt}</span> : null}
      </header>

      {message.kind === 'assistant' ? (
        <AssistantAnswer
          message={message}
          labels={labels}
          canFeedback={canFeedback}
          feedbackState={feedbackState}
          onFeedback={onFeedback}
        />
      ) : null}
      {message.kind === 'image' ? (
        <ImageAnalysis
          message={message}
          labels={labels}
          canFeedback={canFeedback}
          feedbackState={feedbackState}
          onFeedback={onFeedback}
        />
      ) : null}
      {message.kind === 'document' ? <DocumentUpload message={message} labels={labels} /> : null}
      {isUser ? (
        <p className="whitespace-pre-wrap text-body-sm text-content">{message.content}</p>
      ) : null}
    </article>
  );
}
