import { NavLink, Route, Routes } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import HomePage from "./pages/HomePage";
import HistoryPage from "./pages/HistoryPage";
import { api } from "./lib/api";

export default function App() {
  return (
    <div className="min-h-full flex flex-col">
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/history" element={<HistoryPage />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export function Tabs() {
  const { data } = useQuery({
    queryKey: ["history-count"],
    queryFn: () => api.history(undefined, 1000),
  });
  const count = data?.count ?? 0;
  const base =
    "flex-1 text-center px-4 py-2.5 text-sm font-semibold rounded-lg transition-colors";
  return (
    <nav className="flex gap-2 bg-white border border-neutral-200 rounded-xl p-1 shadow-sm">
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          `${base} ${isActive ? "bg-blue-600 text-white" : "text-neutral-600 hover:bg-neutral-100"}`
        }
      >
        Ask
      </NavLink>
      <NavLink
        to="/history"
        className={({ isActive }) =>
          `${base} ${isActive ? "bg-blue-600 text-white" : "text-neutral-600 hover:bg-neutral-100"}`
        }
      >
        History ({count})
      </NavLink>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="border-t border-neutral-200 bg-white mt-8">
      <div className="max-w-6xl mx-auto px-4 py-3 text-xs text-neutral-500 flex justify-between">
        <span>CSE 474/5074 — Term Project</span>
        <span>Wikidata5M · Neo4j · Groq / Ollama</span>
      </div>
    </footer>
  );
}
