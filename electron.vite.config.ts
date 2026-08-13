import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import tailwindcss from 'tailwindcss'

// Single source of truth for the application display name: package.json productName.
const appName: string = JSON.parse(readFileSync(resolve('package.json'), 'utf-8')).productName

export default defineConfig({
  main: {
    build: {
      externalizeDeps: true
    }
  },
  preload: {
    build: {
      externalizeDeps: true
    }
  },
  renderer: {
    define: {
      __APP_NAME__: JSON.stringify(appName)
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@': resolve('src'),
        '@common': resolve('src/common')
      }
    },
    plugins: [
      react(),
      svgr({
        svgrOptions: {
          exportType: 'default',
          ref: true,
          svgo: false,
          titleProp: true
        },
        include: '**/*.svg'
      })
    ],
    css: {
      postcss: {
        plugins: [tailwindcss() as any]
      }
    }
  }
})
