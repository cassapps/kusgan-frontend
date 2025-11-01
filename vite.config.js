import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// If you rename the repo, change base to `/<your-repo-name>/`
export default defineConfig({
  base: '/kusgan-frontend/',
  plugins: [react()],
})
