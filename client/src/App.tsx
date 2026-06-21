import { Route, Routes } from 'react-router-dom'
import Play from './pages/Play'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Play />} />
    </Routes>
  )
}
