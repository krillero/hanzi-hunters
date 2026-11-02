// Entry of the source review screen (review/index.html, served at <base>/review/). Not linked from the game and not loaded by it.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ReviewApp from './ReviewApp'
import './review.css'

createRoot(document.getElementById('root')!).render(<StrictMode><ReviewApp /></StrictMode>)
