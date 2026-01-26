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
        primary: {
          50: '#e0f2fe',
          100: '#bae6fd',
          200: '#7dd3fc',
          300: '#38bdf8',
          400: '#0ea5e9',
          500: '#0284c7',
          600: '#0369a1',
          700: '#075985',
          800: '#0c4a6e',
          900: '#082f49',
        }
      }
    },
  },
  plugins: [],
}
