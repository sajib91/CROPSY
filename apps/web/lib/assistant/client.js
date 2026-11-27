import { dashboardGet, dashboardPost } from '../dashboard/client';

const AI_BASE = '/intelligence/ai';

// Every call goes through the same-origin dashboard proxy. The browser never
// holds an AI service URL, shared secret, or tenant/user identity header.
export function getAssistantCapabilities() {
  return dashboardGet(`${AI_BASE}/capabilities`);
}

export function listAssistantConversations() {
  return dashboardGet(`${AI_BASE}/conversations`);
}

export function getAssistantConversation(conversationId) {
  return dashboardGet(`${AI_BASE}/conversations/${encodeURIComponent(conversationId)}`);
}

export function createAssistantConversation({ language }) {
  return dashboardPost(`${AI_BASE}/conversations`, { language });
}

export function sendAssistantChat(body) {
  return dashboardPost(`${AI_BASE}/chat`, body);
}

export function submitAssistantFeedback({ traceId, rating, comment }) {
  return dashboardPost(`${AI_BASE}/feedback`, {
    traceId,
    rating,
    ...(comment ? { comment } : {}),
  });
}

export function analyzeAssistantImage({
  language,
  contentBase64,
  mimeType,
  filename,
  subjectType,
  analysisKind,
  question,
}) {
  return dashboardPost(`${AI_BASE}/image-analysis/analyze`, {
    language,
    subjectType,
    analysisKind,
    contentBase64,
    mimeType,
    filename,
    question,
    includeReferences: true,
    assetIds: [],
  });
}

export function submitImageAnalysisFeedback({ analysisId, traceId, rating, comment }) {
  return dashboardPost(`${AI_BASE}/image-analysis/feedback`, {
    analysisId,
    traceId,
    rating,
    comment,
    labels: [],
    correctionLabel: '',
  });
}

// User uploads are deliberately UNVERIFIED. The license sentinel is an
// explicit "not supplied" marker required by the strict gateway schema; it is
// never presented as a real license or as permission to cite the document.
const UNSPECIFIED_LICENSE = {
  code: 'UNSPECIFIED',
  url: 'urn:cropsy:license:unspecified',
  attributionRequired: false,
  verified: false,
};

export function ingestAssistantAsset({
  assetId,
  title,
  filename,
  mimeType,
  language,
  text = '',
  contentBase64 = '',
}) {
  return dashboardPost(`${AI_BASE}/multimodal/assets`, {
    assetId,
    title,
    filename,
    mimeType,
    language,
    documentType: 'other',
    version: 'v1',
    status: 'UNVERIFIED',
    source: {
      name: title,
      url: '',
      publisher: '',
      publishedAt: '',
      authors: [],
      authority: '',
      jurisdiction: '',
    },
    license: UNSPECIFIED_LICENSE,
    sourceVersion: '',
    text,
    contentBase64,
    visualQuestion: '',
    isPlantImage: false,
  });
}
