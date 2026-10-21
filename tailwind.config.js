/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        ink: {
          950: '#070a14',
          900: '#0b101f',
          850: '#0f1629',
          800: '#141d35',
          700: '#1c2745',
          600: '#273457',
          500: '#34426b',
        },
        primary: {
          50: '#eaf6ff',
          100: '#d0ebff',
          200: '#9bd6ff',
          300: '#61bdff',
          400: '#2aa4ff',
          500: '#0a8aff',
          600: '#0069db',
          700: '#0052ad',
          800: '#00438c',
          900: '#003874',
        },
        accent: {
          400: '#22d3a4',
          500: '#10b981',
          600: '#059669',
        },
        warn: {
          400: '#fbbf24',
          500: '#f59e0b',
        },
        danger: {
          400: '#fb7185',
          500: '#ef4444',
          600: '#dc2626',
        },
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(42,164,255,0.15), 0 8px 30px -8px rgba(10,138,255,0.35)',
        dangerGlow: '0 0 0 1px rgba(239,68,68,0.18), 0 8px 30px -8px rgba(239,68,68,0.35)',
      },
      keyframes: {
        pulseDot: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.5', transform: 'scale(0.85)' },
        },
        slideIn: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        },
        countPop: {
          '0%': { transform: 'scale(1)' },
          '40%': { transform: 'scale(1.18)' },
          '100%': { transform: 'scale(1)' },
        },
        ring: {
          '0%': { boxShadow: '0 0 0 0 rgba(34,211,164,0.45)' },
          '70%': { boxShadow: '0 0 0 8px rgba(34,211,164,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(34,211,164,0)' },
        },
      },
      animation: {
        pulseDot: 'pulseDot 1.8s ease-in-out infinite',
        slideIn: 'slideIn 0.25s ease-out',
        scanline: 'scanline 3.5s linear infinite',
        countPop: 'countPop 0.45s ease-out',
        ring: 'ring 1.4s ease-out',
      },
    },
  },
  plugins: [],
}
