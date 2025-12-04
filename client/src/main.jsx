import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx' // This will now correctly import from ./App.jsx
import './index.css' // This will now correctly import from ./index.css

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>,
)