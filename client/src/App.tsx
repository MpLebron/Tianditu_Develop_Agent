import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { WorkspacePage } from './pages/WorkspacePage'
import { HomePage } from './pages/HomePage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/workspace" element={<WorkspacePage />} />
      </Routes>
    </BrowserRouter>
  )
}
