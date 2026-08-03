import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { purgeDeadStorageKeys } from './lib/safeStorage'

// Before anything reads or writes storage: reclaim the write-only cache keys earlier versions
// left behind. Existing users are sitting on several MB of them, which is enough to keep every
// subsequent write throwing on quota even though nothing new is being cached.
purgeDeadStorageKeys()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
