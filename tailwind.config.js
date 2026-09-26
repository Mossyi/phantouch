/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: '#f7f7f8',
          card: '#ffffff',
          cardBorder: '#e5e7eb',
          accent: '#e96892',
          pink: '#e96892',
          purple: '#b65b80',
          rose: '#dc5d78',
          warning: '#d97706',
          danger: '#e11d48',
          success: '#059669'
        },
        // Neutral surface scale: pink belongs to actions, not every background.
        slate: {
          50: '#ffffff',
          100: '#1f2937',
          200: '#374151',
          300: '#4b5563',
          400: '#6b7280',
          500: '#8b95a1',
          600: '#b7bec7',
          700: '#d9dee5',
          800: '#edf0f3',
          850: '#f5f6f8',
          900: '#ffffff',
          950: '#fafbfc',
        },
        cyan: {
          50: '#f8fbfc', 100: '#edf4f6', 200: '#4f6e78', 300: '#5f7f8a', 400: '#4f6e78', 500: '#5f7f8a',
          600: '#4f6e78', 700: '#405d67', 800: '#e2ebee', 900: '#f0f5f6', 950: '#f8fafb',
        },
        purple: {
          50: '#fffafb', 100: '#fdf1f5', 200: '#7f4057', 300: '#9c526a', 400: '#b76a83', 500: '#d66a91',
          600: '#c84e7c', 700: '#a13762', 800: '#722540', 900: '#5b1d35', 950: '#fff8fa',
        },
        indigo: {
          50: '#fafbfc', 100: '#f1f4f6', 200: '#d9e1e5', 300: '#a8b8c1', 400: '#71848f', 500: '#5d737f',
          600: '#4d626d', 700: '#40515b', 800: '#35434b', 900: '#27343b', 950: '#f8fafb',
        },
        pink: {
          50: '#fff8fa',
          100: '#fff0f4',
          200: '#f9d7e3',
          300: '#f2b6ca',
          400: '#eb8eae',
          500: '#e96892',
          600: '#d94d7f',
          700: '#b93765',
          800: '#8d294d',
          900: '#5e1c34',
          950: '#3e1221',
        },
        rose: {
          50: '#fff8fb',
          100: '#ffe4ed',
          200: '#fecdd3',
          300: '#fb7185',
          400: '#f43f5e',
          500: '#e11d48',
          600: '#be123c',
          700: '#9f1239',
          800: '#881337',
          900: '#4c0519',
          950: '#380d24',
        }
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s infinite ease-in-out',
        'shock-wave': 'shockWave 1s infinite linear',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: '1', filter: 'drop-shadow(0 0 10px rgba(244, 63, 145, 0.4))' },
          '50%': { opacity: '0.7', filter: 'drop-shadow(0 0 4px rgba(244, 63, 145, 0.2))' },
        }
      }
    },
  },
  plugins: [],
}
