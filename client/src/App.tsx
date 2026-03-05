import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { WorkspacePage } from './pages/WorkspacePage'
import { HomePage } from './pages/HomePage'
import { ShareViewerPage } from './pages/ShareViewerPage'
import { PublicGalleryPage } from './pages/PublicGalleryPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/workspace" element={<WorkspacePage />} />
        <Route path="/share/:slug" element={<ShareViewerPage />} />
        <Route path="/gallery" element={<PublicGalleryPage />} />
      </Routes>
    </BrowserRouter>
  )
}
