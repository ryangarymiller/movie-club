import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost',
      },
    },
    globals: true,
    setupFiles: './src/test/setup.js',
    // Placeholder Supabase creds so modules that create the client at import
    // time (src/lib/supabase.js, pulled in transitively by Films/Awards) load
    // in the test env, where no real .env is present. Tests never hit the
    // network — they either mock supabase or exercise pure helpers.
    env: {
      VITE_SUPABASE_URL: 'https://test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
})
