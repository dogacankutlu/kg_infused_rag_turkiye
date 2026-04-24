import { NavLink, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import HistoryPage from "./pages/HistoryPage";

export default function App() {
  return (
    <div className="min-h-full flex flex-col">
      <Header />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? "bg-turkiye-red-light text-turkiye-red-dark"
        : "text-neutral-600 hover:bg-neutral-100"
    }`;
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-turkiye-red flex items-center justify-center text-white font-bold">
            KG
          </div>
          <div>
            <div className="text-sm font-semibold">KG-Infused RAG</div>
            <div className="text-xs text-neutral-500">Türkiye domain</div>
          </div>
        </div>
        <nav className="flex gap-1">
          <NavLink to="/" end className={linkClass}>
            Home
          </NavLink>
          <NavLink to="/history" className={linkClass}>
            History
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-neutral-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 py-3 text-xs text-neutral-500 flex justify-between">
        <span>CSE 474/5074 — Term Project</span>
        <span>Wikidata5M · Neo4j · Groq / Ollama</span>
      </div>
    </footer>
  );
}
