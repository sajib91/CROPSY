import { AssistantWorkspace } from '@/components/assistant/assistant-workspace';
import { AuthGate } from '@/components/auth/auth-forms';
import { requireDictionary } from '@/lib/i18n/server';
import { createLocalizedPageMetadata } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export function generateMetadata({ params }) {
  return createLocalizedPageMetadata(params.locale, 'aiAssistant', '/ai-assistant');
}

export default function AiAssistantPage({ params }) {
  const { locale } = params;
  const dictionary = requireDictionary(locale);

  return (
    <AuthGate locale={locale} dictionary={dictionary}>
      <AssistantWorkspace
        locale={locale}
        page={dictionary.pages.aiAssistant}
        dictionary={dictionary}
      />
    </AuthGate>
  );
}
