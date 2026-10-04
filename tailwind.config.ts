import type { Config } from 'tailwindcss';

/**
 * Nuclear Likit tasarım token'ları — koyu tema.
 *
 * Bileşenler ham hex değil, buradaki anlamsal adları kullanır. Kontrast:
 * `fg` ve `muted` zeminde 4.5:1'in üzerindedir; `subtle` yalnız süs/ikincil
 * bilgi içindir. Vurgu (`accent`) üzerinde metin her zaman `accent-ink`.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1rem', sm: '1.5rem', lg: '2rem' },
      screens: { '2xl': '1280px' },
    },
    extend: {
      colors: {
        bg: '#07080A',
        surface: { DEFAULT: '#0F1114', 2: '#161A1F', 3: '#1E232A' },
        line: { DEFAULT: '#262B33', strong: '#363C46' },
        fg: '#F3F5F7',
        muted: '#A3ABB6',
        subtle: '#6E7681',
        accent: { DEFAULT: '#B6FF3B', hover: '#CBFF70', ink: '#0B1200', soft: 'rgba(182,255,59,0.12)' },
        hazard: { DEFAULT: '#FFC53D', soft: 'rgba(255,197,61,0.14)' },
        danger: { DEFAULT: '#FF6B6B', soft: 'rgba(255,107,107,0.12)' },
        success: { DEFAULT: '#46E08A', soft: 'rgba(70,224,138,0.12)' },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'sans-serif'],
      },
      fontSize: {
        'display-sm': ['clamp(1.6rem, 2.6vw, 2.1rem)', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'display-md': ['clamp(2rem, 4vw, 3rem)', { lineHeight: '1.05', letterSpacing: '-0.03em' }],
        'display-lg': ['clamp(2.6rem, 7vw, 5.25rem)', { lineHeight: '0.98', letterSpacing: '-0.04em' }],
      },
      borderRadius: { xl: '0.75rem', '2xl': '1rem', '3xl': '1.5rem' },
      boxShadow: {
        glow: '0 0 0 1px rgba(182,255,59,0.35), 0 10px 40px -12px rgba(182,255,59,0.35)',
        lift: '0 18px 40px -18px rgba(0,0,0,0.8)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(10px)' }, '100%': { opacity: '1', transform: 'none' } },
        pulse: { '0%,100%': { opacity: '0.55' }, '50%': { opacity: '1' } },
        marquee: { '0%': { transform: 'translateX(0)' }, '100%': { transform: 'translateX(-50%)' } },
      },
      animation: {
        'fade-up': 'fade-up 0.45s cubic-bezier(0.16,1,0.3,1) both',
        'pulse-slow': 'pulse 3.2s ease-in-out infinite',
        marquee: 'marquee 38s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
