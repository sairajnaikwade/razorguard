/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: "#0F172A",
        primary: "#3B82F6",
        risk: {
          critical: "#EF4444",
          high: "#F97316",
          medium: "#EAB308",
          low: "#22C55E"
        }
      }
    },
  },
  plugins: [],
}
