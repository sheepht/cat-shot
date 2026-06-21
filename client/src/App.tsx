import { Link, Route, Routes } from 'react-router-dom'
import Home from './pages/Home'
import Cats from './pages/Cats'

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b bg-white">
        <nav className="mx-auto flex max-w-3xl items-center gap-6 px-4 py-4">
          <span className="text-xl font-bold">🐱 Cat Shot</span>
          <Link className="hover:text-indigo-600" to="/">
            首頁
          </Link>
          <Link className="hover:text-indigo-600" to="/cats">
            貓咪列表
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/cats" element={<Cats />} />
        </Routes>
      </main>
    </div>
  )
}
