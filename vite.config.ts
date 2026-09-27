import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // `''` loads every variable from .env, not only the VITE_* ones. Values set
  // in the shell win, exactly like the server side dotenv behaviour.
  const env = loadEnv(mode, process.cwd(), '')
  const pick = (key: string, fallback: string): string => process.env[key] ?? env[key] ?? fallback

  const apiUrl = `http://${pick('API_HOST', '127.0.0.1')}:${pick('API_PORT', '4317')}`
  const webPort = Number.parseInt(pick('WEB_PORT', '5173'), 10)
  const appMode = pick('APP_MODE', 'develop')

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    // The web app calls the API directly: there is no proxy, so the browser
    // needs the absolute origin of the API. It is injected from the same
    // variables the API itself reads, which keeps host and port defined in a
    // single place. The API answers CORS for the origins in CORS_ORIGINS.
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(apiUrl),
    },
    // `vite` (develop) and `vite preview` (staging/production) share the port.
    server: {
      port: webPort,
      strictPort: true,
      // The project lives on a Windows drive mounted through 9p, where inotify
      // events do not cross the Windows/Linux boundary: without polling the dev
      // server never notices an edited file (no HMR, no reload). The heavy and
      // frequently rewritten folders are excluded to keep polling cheap.
      watch: {
        usePolling: true,
        interval: 300,
        ignored: [
          '**/node_modules/**',
          '**/dist/**',
          '**/data/**',
          '**/.npm-cache/**',
          '**/.npm-logs/**',
          '**/.git/**',
        ],
      },
    },
    preview: { port: webPort, strictPort: true },
    build: {
      outDir: 'dist',
      sourcemap: appMode !== 'production',
    },
  }
})
