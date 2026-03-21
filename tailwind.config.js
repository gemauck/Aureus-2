/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', // follow app theme (html.dark / html.light) instead of system preference
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./*.html",
    "./*.js"
  ],
  safelist: [
    // Document Collection Tracker cell colors - these are used dynamically
    'bg-red-50',
    'bg-yellow-50',
    'bg-green-50',
    'bg-gray-50',
    'bg-red-100',
    'bg-yellow-100',
    'bg-green-100',
    'bg-gray-100',
    'text-red-800',
    'text-yellow-800',
    'text-green-800',
    'text-gray-800',
    // Status badge colors
    'bg-primary-50',
  ],
  theme: {
    extend: {
      colors: {
        /* Blue scale — primary brand (buttons, links, focus) */
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        }
      }
    },
  },
  plugins: [],
}
