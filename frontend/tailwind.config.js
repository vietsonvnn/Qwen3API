/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f4ff',
          100: '#e0e9ff',
          400: '#7c9ef8',
          500: '#4f73f8',
          600: '#3a58e8',
          700: '#2d45c0',
        },
        dark: {
          900: '#0f1117',
          800: '#161b27',
          700: '#1e2535',
          600: '#252d40',
          500: '#2e374d',
        },
      },
    },
  },
  plugins: [],
};
