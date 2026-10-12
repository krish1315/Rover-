/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        rover: {
          bg: '#090a0d',
          card: 'rgba(18, 20, 26, 0.7)',
          panel: 'rgba(23, 26, 33, 0.65)',
          border: 'rgba(255, 255, 255, 0.08)',
          borderHover: 'rgba(255, 255, 255, 0.14)',
          text: {
            primary: '#f1f5f9',
            secondary: '#94a3b8',
            muted: '#64748b',
          },
          status: {
            online: '#10b981',
            standby: '#f59e0b',
            offline: '#ef4444',
          },
          sensor: {
            thermal: '#f97316',
            mmwave: '#0ea5e9',
            ai: '#8b5cf6',
          }
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      backdropBlur: {
        xs: '2px',
      }
    },
  },
  plugins: [],
}
