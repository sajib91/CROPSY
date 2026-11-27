import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { endpoints } from '../lib/api/endpoints';
import { useResource } from '../lib/hooks/useResource';
import { pickDocument } from '../lib/media/document';
import { pickImage } from '../lib/media/image';
import {
  Badge,
  Button,
  Card,
  ErrorState,
  LoadingState,
  Notice,
  OptionPicker,
  Screen,
  ScreenHeader,
  Tabs,
  TextField,
} from '../lib/ui/components';
import { useApp } from '../state/AppContext';

const SUBJECT_TYPES = ['crop', 'leaf', 'fruit', 'plant'];
const ANALYSIS_KINDS = ['general', 'disease', 'pest', 'nutrient'];

function newAssetId() {
  const random = Math.random().toString(36).slice(2, 10);
  return `mobile-asset-${Date.now()}-${random}`;
}

export default function AssistantScreen() {
  const { api, t, language } = useApp();
  const aiLanguage = language === 'bn' ? 'bn' : 'en';
  const [tab, setTab] = useState('ask');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [assetId, setAssetId] = useState('');
  const [subjectType, setSubjectType] = useState('crop');
  const [analysisKind, setAnalysisKind] = useState('disease');
  const [crop, setCrop] = useState('');
  const [region, setRegion] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [conversationId, setConversationId] = useState(null);

  const conversations = useResource('ai-conversations', () =>
    api.get(endpoints.intelligence.conversations),
  );

  const runAsk = useCallback(async () => {
    if (!question.trim()) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const result = await api.post(endpoints.intelligence.ask, {
        question: question.trim(),
        language: aiLanguage,
      });
      setAnswer(result);
    } catch (askError) {
      setError(askError);
    } finally {
      setBusy(false);
    }
  }, [aiLanguage, api, question]);

  const runAnalyze = async () => {
    if (!selectedImage) return;
    setBusy(true);
    setError(null);
    setAnswer(null);
    try {
      const result = await api.post(endpoints.intelligence.analyzeImage, {
        subjectType,
        analysisKind,
        language: aiLanguage,
        contentBase64: selectedImage.base64,
        mimeType: selectedImage.mimeType,
        filename: selectedImage.fileName,
        ...(crop.trim() ? { crop: crop.trim() } : {}),
        ...(region.trim() ? { region: region.trim() } : {}),
        ...(question.trim() ? { question: question.trim() } : {}),
        ...(assetId ? { assetIds: [assetId] } : {}),
      });
      setAnswer(result);
    } catch (analyzeError) {
      setError(analyzeError);
    } finally {
      setBusy(false);
    }
  };

  const uploadDocument = async () => {
    setBusy(true);
    setError(null);
    try {
      const document = await pickDocument();
      if (!document) return;
      const nextAssetId = newAssetId();
      await api.post(endpoints.intelligence.multimodalAssets, {
        assetId: nextAssetId,
        title: document.name,
        filename: document.name,
        mimeType: document.mimeType,
        documentType: 'other',
        language: aiLanguage,
        source: { name: t('appName') },
        license: {
          code: 'USER_PROVIDED',
          url: 'https://cropsy.app/licenses/user-provided',
        },
        contentBase64: document.base64,
        status: 'UNVERIFIED',
        isPlantImage: false,
      });
      setAssetId(nextAssetId);
      setSelectedDocument(document);
      setAnswer({ message: t('ai.documentUploaded') });
    } catch (uploadError) {
      setError(uploadError);
    } finally {
      setBusy(false);
    }
  };

  const sendChat = async () => {
    if (!chatInput.trim()) return;
    setBusy(true);
    setError(null);
    const outgoing = { role: 'user', content: chatInput.trim() };
    setMessages((previous) => [...previous, outgoing]);
    setChatInput('');
    try {
      const result = await api.post(endpoints.intelligence.chat, {
        message: outgoing.content,
        language: aiLanguage,
        ...(conversationId ? { conversationId } : {}),
      });
      const reply = {
        role: 'assistant',
        content:
          result?.answer ||
          result?.message ||
          result?.response ||
          result?.text ||
          JSON.stringify(result),
      };
      setMessages((previous) => [...previous, reply]);
      if (result?.conversationId) setConversationId(result.conversationId);
      conversations.refresh();
    } catch (chatError) {
      setError(chatError);
    } finally {
      setBusy(false);
    }
  };

  const resultText = answer
    ? answer.answer || answer.message || answer.response || answer.text || JSON.stringify(answer)
    : null;
  const list = Array.isArray(conversations.data)
    ? conversations.data
    : conversations.data?.conversations || [];

  return (
    <Screen
      header={<ScreenHeader title={t('ai.title')} subtitle={t('ai.subtitle')} />}
      refreshing={tab === 'chat' ? conversations.refreshing : undefined}
      onRefresh={tab === 'chat' ? conversations.refresh : undefined}
    >
      <Tabs
        tabs={[
          { key: 'ask', label: t('common.ask') },
          { key: 'image', label: t('common.image') },
          { key: 'chat', label: t('common.conversation') },
          { key: 'documents', label: t('common.document') },
        ]}
        active={tab}
        onChange={setTab}
      />
      <Notice tone="warning">{t('common.advisoryOnly')}</Notice>

      {tab === 'ask' ? (
        <Card className="mt-4">
          <TextField
            label={t('ai.question')}
            value={question}
            onChangeText={setQuestion}
            placeholder={t('ai.askPlaceholder')}
            multiline
          />
          <Button title={t('ai.askButton')} loading={busy} onPress={runAsk} />
        </Card>
      ) : null}

      {tab === 'image' ? (
        <Card className="mt-4">
          <OptionPicker
            label={t('ai.subjectType')}
            options={SUBJECT_TYPES.map((value) => ({ value, label: value }))}
            value={subjectType}
            onChange={setSubjectType}
          />
          <OptionPicker
            label={t('ai.analysisKind')}
            options={ANALYSIS_KINDS.map((value) => ({ value, label: value }))}
            value={analysisKind}
            onChange={setAnalysisKind}
          />
          <TextField label={t('ai.crop')} value={crop} onChangeText={setCrop} />
          <TextField label={t('ai.region')} value={region} onChangeText={setRegion} />
          <TextField
            label={t('ai.question')}
            value={question}
            onChangeText={setQuestion}
            placeholder={t('ai.question')}
          />
          <View className="mb-4 flex-row gap-2">
            <View className="flex-1">
              <Button
                title={t('ai.chooseImage')}
                variant="secondary"
                onPress={async () => {
                  try {
                    setSelectedImage(await pickImage({ source: 'library' }));
                    setError(null);
                  } catch (imageError) {
                    setError(imageError);
                  }
                }}
              />
            </View>
            <View className="flex-1">
              <Button
                title={t('ai.takePhoto')}
                variant="secondary"
                onPress={async () => {
                  try {
                    setSelectedImage(await pickImage({ source: 'camera' }));
                    setError(null);
                  } catch (imageError) {
                    setError(imageError);
                  }
                }}
              />
            </View>
          </View>
          {selectedImage ? <Badge tone="success">{selectedImage.fileName}</Badge> : null}
          {assetId ? <Badge tone="info">{t('ai.assetLinked')}</Badge> : null}
          <View className="mt-4">
            <Button title={t('common.analyze')} loading={busy} onPress={runAnalyze} />
          </View>
        </Card>
      ) : null}

      {tab === 'chat' ? (
        <View className="mt-4">
          <Card>
            <Button
              title={t('ai.newChat')}
              variant="secondary"
              onPress={() => {
                setConversationId(null);
                setMessages([]);
              }}
            />
            {conversations.error ? (
              <ErrorState
                message={conversations.error.message}
                onRetry={conversations.refresh}
                retryLabel={t('common.retry')}
              />
            ) : null}
            {conversations.loading ? <LoadingState label={t('common.loading')} /> : null}
            {list.length === 0 && !conversations.loading ? (
              <Notice>{t('ai.noConversations')}</Notice>
            ) : null}
          </Card>
          <Card className="mt-3">
            <View className="h-72">
              <ScrollView>
                {messages.length === 0 ? (
                  <Text className="mt-10 text-center text-sm text-slate-500">
                    {t('common.noMessages')}
                  </Text>
                ) : null}
                {messages.map((message, index) => (
                  <View
                    key={`${message.role}-${index}`}
                    className={`mb-3 max-w-[85%] rounded-xl px-4 py-3 ${
                      message.role === 'user' ? 'ml-auto bg-emerald-500/20' : 'mr-auto bg-slate-800'
                    }`}
                  >
                    <Text className="text-xs font-semibold uppercase text-slate-400">
                      {message.role === 'user' ? t('common.you') : t('common.assistantRole')}
                    </Text>
                    <Text className="mt-1 text-sm leading-5 text-slate-100">{message.content}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
            <View className="mt-3">
              <TextField
                value={chatInput}
                onChangeText={setChatInput}
                placeholder={t('ai.sendPlaceholder')}
              />
              <Button title={t('common.send')} loading={busy} onPress={sendChat} />
            </View>
          </Card>
        </View>
      ) : null}

      {tab === 'documents' ? (
        <Card className="mt-4">
          <Button
            title={t('ai.chooseDocument')}
            variant="secondary"
            loading={busy}
            onPress={uploadDocument}
          />
          {selectedDocument ? (
            <View className="mt-3">
              <Badge tone="info">{selectedDocument.name}</Badge>
              {assetId ? <Badge tone="success">{t('ai.assetLinked')}</Badge> : null}
            </View>
          ) : null}
        </Card>
      ) : null}

      {error ? <ErrorState message={error.message} /> : null}
      {resultText && tab !== 'chat' ? (
        <Card className="mt-4">
          <Text className="mb-2 text-sm font-semibold text-white">{t('ai.analysisResult')}</Text>
          <Text className="text-sm leading-6 text-slate-300">{resultText}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}
