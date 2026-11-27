'use client';

import { useRef } from 'react';
import { Button, Field, Select, Textarea } from '@/components/ui';
import { DOCUMENT_ACCEPT, IMAGE_ACCEPT } from '@/lib/assistant/files';

function readableSize(bytes) {
  if (typeof bytes !== 'number') return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AssistantComposer({
  labels,
  language,
  onLanguageChange,
  value,
  onChange,
  onSend,
  sending,
  canSend,
  followUpHint,
  attachment,
  onImageSelected,
  onDocumentSelected,
  onRemoveAttachment,
  subjectType,
  onSubjectTypeChange,
  analysisKind,
  onAnalysisKindChange,
  onAnalyzeImage,
  onUploadDocument,
  attachmentBusy,
}) {
  const imageInput = useRef(null);
  const documentInput = useRef(null);
  const busy = sending || attachmentBusy;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <Field label={labels.header.languageLabel} className="w-full sm:w-48">
          <Select value={language} onChange={(event) => onLanguageChange(event.target.value)}>
            <option value="en">{labels.header.languageEn}</option>
            <option value="bn">{labels.header.languageBn}</option>
            <option value="both">{labels.header.languageBoth}</option>
          </Select>
        </Field>
        <p className="flex-1 text-caption text-content-muted">{followUpHint}</p>
      </div>

      {attachment ? (
        <div className="flex flex-col gap-3 rounded-control border border-line bg-surface-muted/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-col">
              <span className="text-body-sm font-semibold text-content">
                {attachment.type === 'image'
                  ? labels.composer.imageAttached
                  : labels.composer.documentAttached}
              </span>
              <span className="text-caption text-content-muted">
                {attachment.file.name} · {readableSize(attachment.file.size)}
              </span>
            </div>
            <Button size="sm" variant="ghost" disabled={busy} onClick={onRemoveAttachment}>
              {labels.composer.removeAttachment}
            </Button>
          </div>

          {attachment.type === 'image' ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={labels.composer.subjectType}>
                  <Select
                    value={subjectType}
                    onChange={(event) => onSubjectTypeChange(event.target.value)}
                  >
                    <option value="crop">{labels.composer.subjectCrop}</option>
                    <option value="leaf">{labels.composer.subjectLeaf}</option>
                    <option value="fruit">{labels.composer.subjectFruit}</option>
                    <option value="plant">{labels.composer.subjectPlant}</option>
                  </Select>
                </Field>
                <Field label={labels.composer.analysisKind}>
                  <Select
                    value={analysisKind}
                    onChange={(event) => onAnalysisKindChange(event.target.value)}
                  >
                    <option value="general">{labels.composer.kindGeneral}</option>
                    <option value="disease">{labels.composer.kindDisease}</option>
                    <option value="pest">{labels.composer.kindPest}</option>
                    <option value="nutrient">{labels.composer.kindNutrient}</option>
                  </Select>
                </Field>
              </div>
              <Button
                size="sm"
                loading={attachmentBusy}
                loadingText={labels.composer.analyzing}
                onClick={onAnalyzeImage}
              >
                {labels.composer.analyzeImage}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              loading={attachmentBusy}
              loadingText={labels.composer.uploading}
              onClick={onUploadDocument}
            >
              {labels.composer.uploadDocument}
            </Button>
          )}
        </div>
      ) : null}

      <Field label={labels.composer.label}>
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (canSend) onSend();
            }
          }}
          placeholder={labels.composer.placeholder}
          disabled={busy}
          rows={3}
        />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <input
            ref={imageInput}
            type="file"
            accept={IMAGE_ACCEPT}
            className="sr-only"
            aria-label={labels.composer.attachImage}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImageSelected(file);
              event.target.value = '';
            }}
          />
          <input
            ref={documentInput}
            type="file"
            accept={DOCUMENT_ACCEPT}
            className="sr-only"
            aria-label={labels.composer.attachDocument}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onDocumentSelected(file);
              event.target.value = '';
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => imageInput.current?.click()}
          >
            {labels.composer.attachImage}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => documentInput.current?.click()}
          >
            {labels.composer.attachDocument}
          </Button>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            loading={sending}
            loadingText={labels.composer.sending}
            disabled={!canSend || Boolean(attachment) || busy}
            onClick={onSend}
          >
            {labels.composer.send}
          </Button>
          <span className="text-caption text-content-subtle">{labels.composer.enterHint}</span>
        </div>
      </div>
    </div>
  );
}
