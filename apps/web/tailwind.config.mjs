const token = (name) => `rgb(var(${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
const config = {
  darkMode: 'class',
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}', './lib/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: token('--cropsy-brand-600'),
          50: token('--cropsy-brand-50'),
          100: token('--cropsy-brand-100'),
          200: token('--cropsy-brand-200'),
          300: token('--cropsy-brand-300'),
          400: token('--cropsy-brand-400'),
          500: token('--cropsy-brand-500'),
          600: token('--cropsy-brand-600'),
          700: token('--cropsy-brand-700'),
          800: token('--cropsy-brand-800'),
          900: token('--cropsy-brand-900'),
          950: token('--cropsy-brand-950'),
        },
        canvas: token('--cropsy-canvas'),
        surface: {
          DEFAULT: token('--cropsy-surface'),
          muted: token('--cropsy-surface-muted'),
          raised: token('--cropsy-surface-raised'),
          inverse: token('--cropsy-surface-inverse'),
        },
        content: {
          DEFAULT: token('--cropsy-content'),
          muted: token('--cropsy-content-muted'),
          subtle: token('--cropsy-content-subtle'),
          inverse: token('--cropsy-content-inverse'),
          'on-brand': token('--cropsy-content-on-brand'),
        },
        line: {
          DEFAULT: token('--cropsy-border'),
          strong: token('--cropsy-border-strong'),
        },
        success: {
          DEFAULT: token('--cropsy-success'),
          bg: token('--cropsy-success-bg'),
          border: token('--cropsy-success-border'),
        },
        warning: {
          DEFAULT: token('--cropsy-warning'),
          bg: token('--cropsy-warning-bg'),
          border: token('--cropsy-warning-border'),
        },
        danger: {
          DEFAULT: token('--cropsy-danger'),
          bg: token('--cropsy-danger-bg'),
          border: token('--cropsy-danger-border'),
        },
        info: {
          DEFAULT: token('--cropsy-info'),
          bg: token('--cropsy-info-bg'),
          border: token('--cropsy-info-border'),
        },
        focus: token('--cropsy-focus'),
      },
      fontFamily: {
        sans: ['var(--cropsy-font-sans)'],
        mono: ['var(--cropsy-font-mono)'],
      },
      fontSize: {
        display: ['clamp(2.25rem, 6vw, 3.5rem)', { lineHeight: '1.08', letterSpacing: '-0.035em' }],
        title: ['clamp(1.75rem, 4vw, 2.25rem)', { lineHeight: '1.2', letterSpacing: '-0.025em' }],
        heading: ['1.5rem', { lineHeight: '1.3', letterSpacing: '-0.02em' }],
        subheading: ['1.125rem', { lineHeight: '1.4', letterSpacing: '-0.01em' }],
        'body-lg': ['1.0625rem', { lineHeight: '1.65' }],
        body: ['1rem', { lineHeight: '1.625' }],
        'body-sm': ['0.875rem', { lineHeight: '1.5' }],
        caption: ['0.75rem', { lineHeight: '1.4' }],
        overline: ['0.6875rem', { lineHeight: '1.3', letterSpacing: '0.16em' }],
      },
      spacing: {
        page: 'clamp(1rem, 4vw, 2.5rem)',
        section: 'clamp(2rem, 6vw, 4rem)',
        card: '1.5rem',
        control: '2.5rem',
        'field-gap': '0.5rem',
      },
      borderRadius: {
        xs: '0.25rem',
        control: '0.625rem',
        card: '1rem',
        panel: '1.25rem',
        pill: '9999px',
      },
      boxShadow: {
        card: '0 1px 2px rgb(var(--cropsy-shadow) / 0.06), 0 1px 3px rgb(var(--cropsy-shadow) / 0.08)',
        raised:
          '0 10px 30px -12px rgb(var(--cropsy-shadow) / 0.25), 0 4px 12px -6px rgb(var(--cropsy-shadow) / 0.12)',
        overlay: '0 24px 60px -20px rgb(var(--cropsy-shadow) / 0.38)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(0.5rem)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.97)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'slide-up': 'slide-up 200ms ease-out',
        'scale-in': 'scale-in 180ms ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
