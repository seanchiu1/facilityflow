/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        brand: {
          sidebar: '#1E293B',
          'sidebar-hover': '#263348',
          'sidebar-active': '#2D3E56',
          accent: '#F59E0B',
          'accent-dark': '#D97706',
          'accent-light': '#FEF3C7',
        },
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,0.06), 0 1px 2px -1px rgba(0,0,0,0.06)',
        'card-hover': '0 4px 12px 0 rgba(0,0,0,0.08), 0 2px 4px -1px rgba(0,0,0,0.04)',
        topbar: '0 1px 0 0 #E2E8F0',
      },
    },
  },
  plugins: [],
}
