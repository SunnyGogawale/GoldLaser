import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const parsedPort = Number(env.DEV_PORT)
  const port = Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : undefined

  return {
    plugins: [react()],
    server: {
      host: env.DEV_HOST || undefined,
      port,
      strictPort: env.DEV_STRICT_PORT === 'true',
    },
  }
})
