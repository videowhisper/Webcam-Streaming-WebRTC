import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Removed StrictMode to prevent duplicate initialization logging
// StrictMode intentionally double-mounts components in development
createRoot(document.getElementById('root')).render(
  <App />
)
