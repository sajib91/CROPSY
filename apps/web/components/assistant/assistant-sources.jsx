'use client';

import { Badge } from '@/components/ui';

function sourceLink(url) {
  const value = String(url || '').trim();
  return /^https?:\/\//i.test(value) ? value : null;
}

function DetailRow({ label, value }) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <p className="text-caption text-content-muted">
      <span className="font-semibold text-content">{label}: </span>
      {String(value)}
    </p>
  );
}

function ScoreBadge({ score, labels }) {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  return <Badge tone="neutral">{`${labels.score} ${score.toFixed(3)}`}</Badge>;
}

export function AssistantCitations({ labels, citations }) {
  const items = Array.isArray(citations) ? citations.filter(Boolean) : [];
  if (items.length === 0) {
    return <p className="text-body-sm text-content-muted">{labels.noCitations}</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((citation, index) => {
        const href = sourceLink(citation.sourceUrl);
        const title =
          citation.title || citation.sourceName || citation.documentId || `#${index + 1}`;
        return (
          <li
            key={`${citation.documentId || 'citation'}-${citation.chunkId || index}`}
            className="flex flex-col gap-2 rounded-control border border-line bg-surface-muted/40 p-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-body-sm font-semibold text-content">{title}</p>
              <ScoreBadge score={citation.score} labels={labels} />
            </div>
            <DetailRow label={labels.section} value={citation.section} />
            <DetailRow label={labels.sourceName} value={citation.sourceName} />
            <DetailRow label={labels.publisher} value={citation.publisher} />
            <DetailRow label={labels.publishedAt} value={citation.publishedAt} />
            <DetailRow label={labels.jurisdiction} value={citation.jurisdiction} />
            <DetailRow label={labels.license} value={citation.licenseCode} />
            {citation.excerpt ? (
              <p className="whitespace-pre-wrap border-l-2 border-brand-300 pl-3 text-caption text-content-muted">
                {citation.excerpt}
              </p>
            ) : null}
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-caption font-semibold text-brand-700 hover:underline dark:text-brand-300"
              >
                {labels.openSource} ↗
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function AssistantReferences({ labels, references }) {
  const items = Array.isArray(references) ? references.filter(Boolean) : [];
  if (items.length === 0) {
    return <p className="text-body-sm text-content-muted">{labels.noReferences}</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((reference, index) => {
        const href = sourceLink(reference.sourceUrl || reference.citation?.sourceUrl);
        const title =
          reference.title || reference.sourceName || reference.assetId || `#${index + 1}`;
        return (
          <li
            key={`${reference.assetId || 'reference'}-${reference.chunkId || index}`}
            className="flex flex-col gap-2 rounded-control border border-line bg-surface-muted/40 p-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-body-sm font-semibold text-content">{title}</p>
              <ScoreBadge score={reference.score} labels={labels} />
            </div>
            <DetailRow label={labels.assetId} value={reference.assetId} />
            <DetailRow label={labels.section} value={reference.section} />
            <DetailRow label={labels.sourceName} value={reference.sourceName} />
            <DetailRow label={labels.license} value={reference.licenseCode} />
            {reference.excerpt ? (
              <p className="whitespace-pre-wrap border-l-2 border-brand-300 pl-3 text-caption text-content-muted">
                {reference.excerpt}
              </p>
            ) : null}
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-caption font-semibold text-brand-700 hover:underline dark:text-brand-300"
              >
                {labels.openSource} ↗
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
