import { ThemeProvider } from '../ui/theme-provider';
import { ToastProvider } from '../ui/toast';

const themeScript = `(function(){try{var stored=localStorage.getItem('cropsy-theme');var theme=stored==='dark'||stored==='light'?stored:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.classList.toggle('dark',theme==='dark');document.documentElement.style.colorScheme=theme;}catch(error){}})();`;

export function RootShell({ locale = 'en', skipLabel = 'Skip to content', children }) {
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-screen">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <ThemeProvider>
          <ToastProvider>
            <a href="#main-content" className="skip-link">
              {skipLabel}
            </a>
            {children}
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
