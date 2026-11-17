import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const frontendPort = Number(env.PORT || 5173)
  const backendPort = Number(env.BACKEND_PORT || 3001)
  const base = env.BASE_PATH || '/'
  const apiBasePrefix = base.startsWith('/') ? base.replace(/\/$/, '') : ''

  const backendProxy = {
    target: `http://127.0.0.1:${backendPort}`,
    ...(apiBasePrefix && {
      rewrite: (requestPath: string) => requestPath.slice(apiBasePrefix.length),
    }),
  }

  return {
    plugins: [react(), tailwindcss()],
    worker: { format: 'es' },
    server: {
      host: '127.0.0.1',
      port: frontendPort,
      strictPort: true,
      proxy: {
        [`${apiBasePrefix}/api`]: backendProxy,
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
      dedupe: ['react', 'react-dom'],
      preserveSymlinks: true,
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-dev-runtime',
        'react/jsx-runtime',
        '@tanstack/react-query',
        '@tanstack/query-core',
      ],
    },
    base,
  }
})
