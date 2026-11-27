import '../globals.css';
import { RootShell } from '@/components/site/root-shell';
import { metadataBase } from '@/lib/seo';

export const metadata = {
  metadataBase,
  title: 'CROPSY',
  description: 'CROPSY agricultural technology workspace',
};

export default function ToolsLayout({ children }) {
  return <RootShell skipLabel="Skip to content">{children}</RootShell>;
}
