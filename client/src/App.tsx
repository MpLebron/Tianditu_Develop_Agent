import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { WorkspacePage } from './pages/WorkspacePage'
import { HomePage } from './pages/HomePage'
import { ShareViewerPage } from './pages/ShareViewerPage'
import { PublicGalleryPage } from './pages/PublicGalleryPage'
import { RunDossiersPage } from './pages/RunDossiersPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/workspace" element={<WorkspacePage />} />
        <Route path="/share/:slug" element={<ShareViewerPage />} />
        <Route path="/gallery" element={<PublicGalleryPage />} />
        <Route path="/runs" element={<RunDossiersPage />} />
      </Routes>
    </BrowserRouter>
  )
}
