'use client';

import { useState } from 'react';
import { Button, InlineError, Input } from '@/components/ui';

export function AssistantFeedback({ labels, canFeedback, state, onSubmit }) {
  const [rating, setRating] = useState(null);
  const [comment, setComment] = useState('');

  if (!canFeedback) {
    return <p className="text-caption text-content-muted">{labels.feedbackUnavailable}</p>;
  }

  if (state?.status === 'saved') {
    return <p className="text-caption text-success">{labels.feedbackSaved}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-caption font-semibold text-content">{labels.feedbackPrompt}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={rating === 5 ? 'primary' : 'secondary'}
          disabled={state?.status === 'busy'}
          onClick={() => setRating(5)}
        >
          {labels.helpful}
        </Button>
        <Button
          size="sm"
          variant={rating === 1 ? 'primary' : 'secondary'}
          disabled={state?.status === 'busy'}
          onClick={() => setRating(1)}
        >
          {labels.notHelpful}
        </Button>
      </div>
      {rating ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={labels.feedbackComment}
            maxLength={2000}
            aria-label={labels.feedbackComment}
          />
          <Button
            size="sm"
            loading={state?.status === 'busy'}
            loadingText={labels.feedbackSubmitting}
            onClick={() => onSubmit({ rating, comment })}
          >
            {labels.feedbackSubmit}
          </Button>
        </div>
      ) : null}
      {state?.status === 'unconfirmed' ? (
        <p className="text-caption text-content-muted">{labels.feedbackUnconfirmed}</p>
      ) : null}
      {state?.status === 'error' ? (
        <InlineError
          title={labels.feedbackError}
          description={state.error?.message}
          className="py-2"
        />
      ) : null}
    </div>
  );
}
