'use client';

import { Badge, Button, EmptyState, InlineError, LoadingState } from '@/components/ui';

function formatDate(value, locale) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function AssistantConversationList({
  labels,
  locale,
  conversations,
  state,
  activeId,
  onSelect,
  onNew,
  onRetry,
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-subheading font-semibold text-content">
          {labels.header.conversationsTitle}
        </h2>
        <Button size="sm" variant="secondary" onClick={onNew}>
          {labels.header.newConversation}
        </Button>
      </div>

      {state.status === 'loading' ? (
        <LoadingState label={labels.header.loadingConversations} className="py-8" />
      ) : null}

      {state.status === 'error' ? (
        <InlineError
          title={labels.header.conversationsError}
          description={state.error?.message}
          retryLabel={labels.header.retry}
          onRetry={onRetry}
        />
      ) : null}

      {state.status === 'ready' && conversations.length === 0 ? (
        <EmptyState compact title={labels.header.noConversations} />
      ) : null}

      {state.status === 'ready' && conversations.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {conversations.map((conversation) => {
            const id = conversation.conversationId;
            const active = id === activeId;
            const updatedAt = formatDate(conversation.updatedAt, locale);
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onSelect(id)}
                  aria-current={active ? 'true' : undefined}
                  className={`flex w-full flex-col gap-1 rounded-control border p-3 text-left transition-colors ${
                    active
                      ? 'border-brand-300 bg-brand-50 dark:border-brand-800 dark:bg-brand-950/40'
                      : 'border-line bg-surface hover:border-line-strong'
                  }`}
                >
                  <span className="line-clamp-2 text-body-sm font-semibold text-content">
                    {conversation.title || id}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {conversation.language ? (
                      <Badge tone="neutral">{conversation.language}</Badge>
                    ) : null}
                    {updatedAt ? (
                      <span className="text-caption text-content-muted">{updatedAt}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
