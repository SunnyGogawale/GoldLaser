import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'charts',
              test: /node_modules[\\/](?:recharts)(?:[\\/]|$)/,
              minSize: 20 * 1024
            },
            {
              name: 'pdf',
              test: /node_modules[\\/](?:jspdf|jspdf-autotable)(?:[\\/]|$)/,
              minSize: 20 * 1024,
              entriesAware: true
            },
            {
              name: 'spreadsheet',
              test: /node_modules[\\/](?:xlsx)(?:[\\/]|$)/,
              minSize: 20 * 1024
            }
          ]
        }
      }
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
})
