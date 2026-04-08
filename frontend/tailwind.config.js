/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f1f8e9',
          100: '#dcedc8',
          200: '#c5e1a5',
          300: '#aed581',
          400: '#9ccc65',
          500: '#8bc34a',
          600: '#7cb342', // primary brand green
          700: '#689f38',
          800: '#558b2f',
          900: '#33691e',
          primary: '#2E7D32',
          secondary: '#8BC34A',
          dark: '#1B5E20',
        }
      }
    },
  },
  plugins: [],
}
