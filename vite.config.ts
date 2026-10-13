import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset URLs, so the same build works at a domain root or under
  // GitHub Pages' /<repo>/ path without knowing the repo name.
  base: './',
})
