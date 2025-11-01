import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'

// ✅ Use dynamic base so it works both locally and on GitHub Pages
const basename = import.meta.env.DEV ? '/' : '/kusgan-frontend'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
