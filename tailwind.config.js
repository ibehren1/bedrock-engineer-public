/** @type {import('tailwindcss').Config} */
const flowbite = require('flowbite-react/tailwind')

module.exports = {
  content: [
    './src/renderer/src/**/*.{js,jsx,ts,tsx}',
    './src/renderer/index.html',
    flowbite.content()
  ],
  theme: {
    extend: {
      animation: {
        // gradient-x is for "Thinking"/"Listening" indicators only — anything
        // shown at rest must not animate, since a continuous repaint costs
        // battery for the whole session.
        'gradient-x': 'gradient-x 5s ease infinite',
        'todo-flash': 'todoFlash 0.5s ease-in-out 2'
      },
      keyframes: {
        todoFlash: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.4', transform: 'scale(1.3)' }
        },
        'gradient-x': {
          '0%, 100%': {
            'background-position': '0% 50%'
          },
          '50%': {
            'background-position': '100% 50%'
          }
        }
      }
    }
  },
  plugins: [flowbite.plugin()],
  // Dark mode is driven by an in-app selector (data-theme="dark" on <html>),
  // resolved from the user's appTheme setting (light | dim | dark | system).
  // See useTheme.ts and the [data-theme] blocks in src/renderer/index.css.
  darkMode: ['selector', '[data-theme="dark"]']
}
