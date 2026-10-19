/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // 西文系统字体在前（不含中文字形，会自动回落到后面的中文字体），避免拉丁字母用中文字体的宽字形
        sans: [
          '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto',
          '"PingFang SC"', '"HarmonyOS Sans SC"', '"MiSans"', '"Noto Sans SC"', '"Microsoft YaHei UI"',
          'Helvetica', 'Arial', 'sans-serif',
        ],
        mono: ['"SF Mono"', '"JetBrains Mono"', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        // 品牌主色「玫瑰石英」：粉色只属于操作与强调，背景保持中性暖白。
        cyber: {
          bg: '#faf7f9',
          card: '#ffffff',
          cardBorder: '#ece4e9',
          accent: '#e2457f',
          pink: '#e2457f',
          purple: '#9b4f7a',
          rose: '#e34d6c',
          warning: '#d97706',
          danger: '#e11d48',
          success: '#059669'
        },
        // 历史原因：界面最初为深色主题，slate 色阶被整体反转为浅色界面。
        // 低号 = 文字墨色，高号 = 卡片/底色；这里改为带一点暖调的中性色。
        slate: {
          50: '#ffffff',
          100: '#221a20',
          200: '#3a3038',
          300: '#574c55',
          400: '#746970',
          500: '#93878f',
          600: '#c0b5bc',
          700: '#e2dadf',
          800: '#f2edf0',
          850: '#f7f3f5',
          900: '#ffffff',
          950: '#fbf9fa',
        },
        cyan: {
          50: '#f7fbfc', 100: '#eaf3f5', 200: '#456c78', 300: '#557c88', 400: '#456c78', 500: '#557c88',
          600: '#456c78', 700: '#38606b', 800: '#dfeaed', 900: '#eef5f7', 950: '#f7fafb',
        },
        purple: {
          50: '#fdf9fc', 100: '#f8eef5', 200: '#743d5e', 300: '#8f4c73', 400: '#ae6690', 500: '#c45c94',
          600: '#a9447d', 700: '#8a3466', 800: '#66254b', 900: '#4f1d3a', 950: '#fdf7fb',
        },
        indigo: {
          50: '#fafbfc', 100: '#f1f3f6', 200: '#d9dfe6', 300: '#a8b4c2', 400: '#717f91', 500: '#5d6b7f',
          600: '#4d5a6d', 700: '#404b5c', 800: '#353e4c', 900: '#272f3b', 950: '#f8f9fb',
        },
        pink: {
          50: '#fff6f9',
          100: '#fdeaf1',
          200: '#fad3e2',
          300: '#f5aeca',
          400: '#ee7fa8',
          500: '#e2457f',
          600: '#c92f6a',
          700: '#a82456',
          800: '#841d45',
          900: '#5f1734',
          950: '#3d0e21',
        },
        rose: {
          50: '#fff6f7',
          100: '#ffe6ea',
          200: '#fecdd5',
          300: '#fb8a9e',
          400: '#f4607c',
          500: '#e34d6c',
          600: '#c8325a',
          700: '#a3214a',
          800: '#83183c',
          900: '#4c0519',
          950: '#380d24',
        }
      },
      boxShadow: {
        xs: '0 1px 2px rgba(34, 26, 32, 0.05)',
        soft: '0 1px 2px rgba(34, 26, 32, 0.04), 0 8px 24px -10px rgba(34, 26, 32, 0.12)',
        lift: '0 2px 4px rgba(34, 26, 32, 0.04), 0 18px 40px -16px rgba(34, 26, 32, 0.22)',
        brand: '0 8px 20px -8px rgba(226, 69, 127, 0.55)',
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s infinite ease-in-out',
        'shock-wave': 'shockWave 1s infinite linear',
        'fade-up': 'fadeUp 0.32s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: '1', filter: 'drop-shadow(0 0 10px rgba(226, 69, 127, 0.4))' },
          '50%': { opacity: '0.7', filter: 'drop-shadow(0 0 4px rgba(226, 69, 127, 0.2))' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      }
    },
  },
  plugins: [],
}
