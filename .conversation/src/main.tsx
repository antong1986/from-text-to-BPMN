import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Базовые стили bpmn-js: без них иконки и элементы диаграммы отображаются сломанными
import 'bpmn-js/dist/assets/diagram-js.css'
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css'

import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
