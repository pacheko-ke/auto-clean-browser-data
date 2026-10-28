/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./popup.html", "./popup.js"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        paypal: {
          DEFAULT: "#0070ba", // PayPal blue
          dark: "#003087",    // PayPal navy
          light: "#009cde"    // PayPal bright blue
        }
      }
    }
  },
  plugins: []
};
