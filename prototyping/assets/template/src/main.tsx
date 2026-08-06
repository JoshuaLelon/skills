import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { StatesPage } from './states.tsx'
import { Walkthrough } from './walkthrough.tsx'

// /__states is the states page. StrictMode stays — it is the render-idempotence
// check, and the gate fails this file without it.
const Root = window.location.pathname === '/__states' ? StatesPage : App

// biome-ignore lint/style/noNonNullAssertion: #root exists in index.html
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Walkthrough>
      <Root />
    </Walkthrough>
  </StrictMode>,
)
