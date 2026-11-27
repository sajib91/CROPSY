'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/auth/auth-provider';
import { PageHero } from '@/components/site/marketing-page';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  InlineError,
  LoadingState,
} from '@/components/ui';
import { canAccess } from '@/lib/auth/roles';
import * as assistantApi from '@/lib/assistant/client';
import {
  createAssetId,
  isSupportedDocument,
  isSupportedImage,
  isTextDocument,
  MAX_DOCUMENT_BYTES,
  MAX_IMAGE_BYTES,
  readFileAsBase64,
  readFileAsText,
} from '@/lib/assistant/files';
import { AssistantAccessGate } from './assistant-access';
import { AssistantComposer } from './assistant-composer';
import { AssistantConversationList } from './assistant-conversation-list';
import { AssistantMessage } from './assistant-message';

function normalizeConversation(conversation) {
  return {
    conversationId: String(conversation.conversationId || ''),
    title: conversation.title || '',
    language: conversation.language || '',
    updatedAt: conversation.updatedAt || '',
    messages: Array.isArray(conversation.messages) ? conversation.messages : [],
  };
}

function normalizeHistoryMessage(message, index) {
  const isUser = message.role === 'user';
  return {
    id: message.messageId || `history-${index}`,
    kind: isUser ? 'user' : 'assistant',
    content: message.content || '',
    createdAt: message.createdAt || '',
    result: isUser
      ? null
      : {
          answer: message.content || '',
          citations: Array.isArray(message.citations) ? message.citations : [],
          traceId: message.traceId || '',
          language: message.language || '',
        },
  };
}

export function AssistantWorkspace({ locale, page, dictionary }) {
  const labels = dictionary.assistantUi;
  const { session } = useAuth();
  const canFeedback = canAccess(session, 'ai.feedback');

  const [language, setLanguage] = useState(locale === 'bn' ? 'bn' : 'en');
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [conversationsState, setConversationsState] = useState({ status: 'loading', error: null });
  const [historyState, setHistoryState] = useState({ status: 'idle', error: null });
  const [capabilitiesState, setCapabilitiesState] = useState({
    status: 'loading',
    data: null,
    error: null,
  });
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [chatState, setChatState] = useState({ status: 'idle', error: null });
  const [attachment, setAttachment] = useState(null);
  const [attachmentState, setAttachmentState] = useState({ status: 'idle', error: null });
  const [subjectType, setSubjectType] = useState('crop');
  const [analysisKind, setAnalysisKind] = useState('general');
  const [feedbackState, setFeedbackState] = useState({});
  const lastQuestion = useRef('');
  const transcriptRef = useRef(null);

  const refreshConversations = useCallback(async () => {
    setConversationsState({ status: 'loading', error: null });
    try {
      const data = await assistantApi.listAssistantConversations();
      setConversations(
        Array.isArray(data?.conversations) ? data.conversations.map(normalizeConversation) : [],
      );
      setConversationsState({ status: 'ready', error: null });
    } catch (error) {
      setConversationsState({ status: 'error', error });
    }
  }, []);

  useEffect(() => {
    refreshConversations();
    assistantApi
      .getAssistantCapabilities()
      .then((data) => setCapabilitiesState({ status: 'ready', data, error: null }))
      .catch((error) => setCapabilitiesState({ status: 'error', data: null, error }));
  }, [refreshConversations]);

  useEffect(() => {
    const node = transcriptRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, chatState.status, historyState.status, attachmentState.status]);

  const selectConversation = useCallback(async (id) => {
    setConversationId(id);
    setMessages([]);
    setHistoryState({ status: 'loading', error: null });
    try {
      const data = await assistantApi.getAssistantConversation(id);
      const history = Array.isArray(data?.messages) ? data.messages : [];
      setMessages(history.map(normalizeHistoryMessage));
      setHistoryState({ status: 'ready', error: null });
    } catch (error) {
      setHistoryState({ status: 'error', error });
    }
  }, []);

  const startNewConversation = useCallback(() => {
    setConversationId(null);
    setMessages([]);
    setHistoryState({ status: 'idle', error: null });
    setChatState({ status: 'idle', error: null });
    setDraft('');
    setFeedbackState({});
  }, []);

  const send = useCallback(
    async (overrideText) => {
      const text = String(overrideText ?? draft).trim();
      if (!text || attachment || chatState.status === 'sending') return;
      lastQuestion.current = text;
      setMessages((current) => [
        ...current,
        {
          id: `local-user-${Date.now()}`,
          kind: 'user',
          content: text,
          createdAt: new Date().toISOString(),
        },
      ]);
      setDraft('');
      setChatState({ status: 'sending', error: null });

      try {
        const result = await assistantApi.sendAssistantChat({
          message: text,
          language,
          ...(conversationId ? { conversationId } : {}),
          topK: 5,
          includeHistory: true,
          maxHistoryTurns: 8,
        });
        setConversationId(result?.conversationId || conversationId);
        setMessages((current) => [
          ...current,
          {
            id: result?.messageId || `local-assistant-${Date.now()}`,
            kind: 'assistant',
            content: result?.answer || '',
            createdAt: new Date().toISOString(),
            result,
          },
        ]);
        setChatState({ status: 'idle', error: null });
        refreshConversations();
      } catch (error) {
        setChatState({ status: 'error', error });
      }
    },
    [attachment, chatState.status, conversationId, draft, language, refreshConversations],
  );

  const selectAttachment = useCallback(
    (file, type) => {
      const supported = type === 'image' ? isSupportedImage(file) : isSupportedDocument(file);
      const maxBytes = type === 'image' ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES;
      if (!supported) {
        setAttachment(null);
        setAttachmentState({
          status: 'error',
          error: {
            title: labels.composer.unsupportedFile,
            message: labels.composer.unsupportedFile,
            retryable: false,
          },
        });
        return;
      }
      if (file.size > maxBytes) {
        setAttachment(null);
        setAttachmentState({
          status: 'error',
          error: {
            title: labels.composer.fileTooLarge,
            message: labels.composer.fileTooLarge,
            retryable: false,
          },
        });
        return;
      }
      setAttachmentState({ status: 'idle', error: null });
      setAttachment({ type, file });
    },
    [labels],
  );

  const analyzeImage = useCallback(async () => {
    if (!attachment || attachment.type !== 'image') return;
    const { file } = attachment;
    setAttachmentState({ status: 'busy', error: null });
    try {
      const contentBase64 = await readFileAsBase64(file);
      const result = await assistantApi.analyzeAssistantImage({
        language,
        contentBase64,
        mimeType: file.type,
        filename: file.name,
        subjectType,
        analysisKind,
        question: draft.trim(),
      });
      setMessages((current) => [
        ...current,
        {
          id: result?.analysisId || `local-image-${Date.now()}`,
          kind: 'image',
          content: result?.explanation?.summary || '',
          createdAt: result?.createdAt || new Date().toISOString(),
          result,
        },
      ]);
      setAttachment(null);
      setDraft('');
      setAttachmentState({ status: 'idle', error: null });
    } catch (error) {
      setAttachmentState({ status: 'error', error });
    }
  }, [analysisKind, attachment, draft, language, subjectType]);

  const uploadDocument = useCallback(async () => {
    if (!attachment || attachment.type !== 'document') return;
    const { file } = attachment;
    setAttachmentState({ status: 'busy', error: null });
    try {
      const textFile = isTextDocument(file);
      const text = textFile ? await readFileAsText(file) : '';
      const contentBase64 = textFile ? '' : await readFileAsBase64(file);
      const result = await assistantApi.ingestAssistantAsset({
        assetId: createAssetId(),
        title: file.name,
        filename: file.name,
        mimeType: file.type || (textFile ? 'text/plain' : 'application/pdf'),
        language,
        text,
        contentBase64,
      });
      setMessages((current) => [
        ...current,
        {
          id: result?.assetId || `local-document-${Date.now()}`,
          kind: 'document',
          content: result?.title || '',
          createdAt: new Date().toISOString(),
          result,
        },
      ]);
      setAttachment(null);
      setDraft('');
      setAttachmentState({ status: 'idle', error: null });
    } catch (error) {
      setAttachmentState({ status: 'error', error });
    }
  }, [attachment, language]);

  const submitFeedback = useCallback(async (message, value) => {
    setFeedbackState((current) => ({ ...current, [message.id]: { status: 'busy', error: null } }));
    try {
      const result =
        message.kind === 'image'
          ? await assistantApi.submitImageAnalysisFeedback({
              analysisId: message.result.analysisId,
              traceId: message.result.traceId || '',
              rating: value.rating,
              comment: value.comment || '',
            })
          : await assistantApi.submitAssistantFeedback({
              traceId: message.result.traceId,
              rating: value.rating,
              comment: value.comment || '',
            });
      setFeedbackState((current) => ({
        ...current,
        [message.id]: {
          status: result?.accepted === true ? 'saved' : 'unconfirmed',
          error: null,
        },
      }));
    } catch (error) {
      setFeedbackState((current) => ({
        ...current,
        [message.id]: { status: 'error', error },
      }));
    }
  }, []);

  const busy = chatState.status === 'sending' || attachmentState.status === 'busy';
  const capabilities = capabilitiesState.data;
  const hasCapabilityMetadata =
    (Array.isArray(capabilities?.modules) && capabilities.modules.length > 0) ||
    (Array.isArray(capabilities?.retrievalPipeline) && capabilities.retrievalPipeline.length > 0);

  return (
    <AssistantAccessGate dictionary={labels}>
      <div className="mx-auto flex max-w-7xl flex-col gap-section px-page py-section">
        <PageHero content={page} />

        <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <Card className="h-fit lg:sticky lg:top-6">
            <CardHeader>
              <CardTitle>{labels.header.conversationsTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <AssistantConversationList
                labels={labels}
                locale={locale}
                conversations={conversations}
                state={conversationsState}
                activeId={conversationId}
                onSelect={selectConversation}
                onNew={startNewConversation}
                onRetry={refreshConversations}
              />
            </CardContent>
          </Card>

          <Card className="flex min-h-[70vh] flex-col overflow-hidden">
            <CardHeader className="gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <CardTitle>{labels.header.title}</CardTitle>
                  <p className="text-body-sm text-content-muted">{labels.header.lead}</p>
                </div>
                <Button size="sm" variant="secondary" onClick={startNewConversation}>
                  {labels.header.newConversation}
                </Button>
              </div>
              <p className="text-caption text-content-muted">{labels.header.advisoryNote}</p>

              {capabilitiesState.status === 'loading' ? (
                <LoadingState label={labels.header.capabilitiesTitle} className="py-4" />
              ) : null}
              {capabilitiesState.status === 'error' ? (
                <InlineError
                  title={labels.header.capabilitiesTitle}
                  description={capabilitiesState.error?.message}
                />
              ) : null}
              {capabilitiesState.status === 'ready' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-caption font-semibold text-content">
                    {labels.header.capabilitiesTitle}:
                  </span>
                  {Array.isArray(capabilities?.languages) && capabilities.languages.length ? (
                    <Badge tone="neutral">{`${labels.header.languages}: ${capabilities.languages.join(', ')}`}</Badge>
                  ) : null}
                  {Array.isArray(capabilities?.modules) && capabilities.modules.length ? (
                    <details className="w-full">
                      <summary className="cursor-pointer text-caption font-semibold text-brand-700 dark:text-brand-300">
                        {labels.header.modules}
                      </summary>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {capabilities.modules.map((item) => (
                          <Badge key={item} tone="neutral">
                            {item}
                          </Badge>
                        ))}
                      </div>
                    </details>
                  ) : null}
                  {Array.isArray(capabilities?.retrievalPipeline) &&
                  capabilities.retrievalPipeline.length ? (
                    <details className="w-full">
                      <summary className="cursor-pointer text-caption font-semibold text-brand-700 dark:text-brand-300">
                        {labels.header.pipeline}
                      </summary>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {capabilities.retrievalPipeline.map((item) => (
                          <Badge key={item} tone="neutral">
                            {item}
                          </Badge>
                        ))}
                      </div>
                    </details>
                  ) : null}
                  {hasCapabilityMetadata ? null : (
                    <span className="text-caption text-content-muted">
                      {labels.header.noCapabilities}
                    </span>
                  )}
                </div>
              ) : null}
            </CardHeader>

            <div
              ref={transcriptRef}
              className="flex flex-1 flex-col gap-4 overflow-y-auto bg-surface-muted/20 p-card"
              aria-live="polite"
            >
              {messages.length === 0 &&
              historyState.status !== 'loading' &&
              historyState.status !== 'error' ? (
                <EmptyState
                  title={labels.transcript.emptyTitle}
                  description={labels.transcript.emptyLead}
                />
              ) : null}

              {messages.map((message) => (
                <AssistantMessage
                  key={message.id}
                  message={message}
                  labels={labels.transcript}
                  locale={locale}
                  canFeedback={canFeedback}
                  feedbackState={feedbackState}
                  onFeedback={submitFeedback}
                />
              ))}

              {historyState.status === 'loading' ? (
                <LoadingState label={labels.header.loadingConversations} />
              ) : null}
              {historyState.status === 'error' ? (
                <InlineError
                  title={labels.header.conversationsError}
                  description={historyState.error?.message}
                  retryLabel={labels.header.retry}
                  onRetry={() => conversationId && selectConversation(conversationId)}
                />
              ) : null}

              {chatState.status === 'sending' ? (
                <LoadingState
                  label={labels.transcript.processingTitle}
                  description={labels.transcript.processingLead}
                />
              ) : null}
              {chatState.status === 'error' ? (
                <InlineError
                  title={labels.composer.chatError}
                  description={chatState.error?.message}
                  retryLabel={labels.header.retry}
                  onRetry={() => send(lastQuestion.current)}
                />
              ) : null}

              {attachmentState.status === 'busy' ? (
                <LoadingState
                  label={
                    attachment?.type === 'image'
                      ? labels.composer.analyzing
                      : labels.composer.uploading
                  }
                />
              ) : null}
              {attachmentState.status === 'error' ? (
                <InlineError
                  title={
                    attachmentState.error?.title ??
                    (attachment?.type === 'image'
                      ? labels.composer.imageUploadError
                      : labels.composer.documentUploadError)
                  }
                  description={attachmentState.error?.message}
                  retryLabel={labels.header.retry}
                  onRetry={
                    attachmentState.error?.retryable === false
                      ? undefined
                      : attachment?.type === 'image'
                        ? analyzeImage
                        : uploadDocument
                  }
                />
              ) : null}
            </div>

            <div className="border-t border-line p-card">
              <AssistantComposer
                labels={labels}
                language={language}
                onLanguageChange={setLanguage}
                value={draft}
                onChange={setDraft}
                onSend={() => send()}
                sending={chatState.status === 'sending'}
                canSend={Boolean(draft.trim()) && !busy && !attachment}
                followUpHint={labels.composer.followUpHint}
                attachment={attachment}
                onImageSelected={(file) => selectAttachment(file, 'image')}
                onDocumentSelected={(file) => selectAttachment(file, 'document')}
                onRemoveAttachment={() => {
                  setAttachment(null);
                  setAttachmentState({ status: 'idle', error: null });
                }}
                subjectType={subjectType}
                onSubjectTypeChange={setSubjectType}
                analysisKind={analysisKind}
                onAnalysisKindChange={setAnalysisKind}
                onAnalyzeImage={analyzeImage}
                onUploadDocument={uploadDocument}
                attachmentBusy={attachmentState.status === 'busy'}
              />
            </div>
          </Card>
        </div>
      </div>
    </AssistantAccessGate>
  );
}
