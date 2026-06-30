"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

interface DashboardShellProps {
  children: React.ReactNode;
}

export default function DashboardShell({ children }: DashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  
  const [user, setUser] = useState<{ username: string; role: string; department?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("enterprise_rag_token");
    const storedUser = localStorage.getItem("enterprise_rag_user");
    
    if (!token || !storedUser) {
      localStorage.removeItem("enterprise_rag_token");
      localStorage.removeItem("enterprise_rag_user");
      router.replace("/login");
      return;
    }
    
    try {
      setUser(JSON.parse(storedUser));
    } catch (e) {
      router.replace("/login");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("enterprise_rag_token");
    localStorage.removeItem("enterprise_rag_user");
    router.replace("/login");
  };

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-zinc-950 text-zinc-300">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-sm font-medium tracking-wide">Validating session...</p>
        </div>
      </div>
    );
  }

  const roleColors: Record<string, string> = {
    Admin: "bg-red-500/10 text-red-400 border-red-500/30",
    Manager: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    Employee: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  };

  const navItems = [
    {
      name: "Chat Assistant",
      path: "/chat",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    },
    {
      name: "Knowledge Ingestion",
      path: "/documents",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
      ),
    },
    {
      name: "System Admin",
      path: "/admin",
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      adminOnly: true
    }
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100 font-sans">
      {/* Sidebar navigation */}
      <aside className="w-64 flex-shrink-0 flex flex-col border-r border-zinc-800/80 bg-zinc-900/60 backdrop-blur-xl">
        {/* Brand logo/title */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-zinc-800/60">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-tr from-indigo-600 to-purple-600 shadow-lg shadow-indigo-500/20">
            <svg className="h-4.5 w-4.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-wide bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">Antigravity</h1>
            <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Enterprise RAG</p>
          </div>
        </div>

        {/* User Card */}
        {user && (
          <div className="mx-4 my-4 p-4 rounded-xl border border-zinc-800 bg-zinc-950/40">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-indigo-500/10 flex items-center justify-center text-sm font-bold text-indigo-400 border border-indigo-500/20">
                {user.username.substring(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="text-xs font-semibold text-zinc-200 truncate">{user.username}</p>
                <p className="text-[10px] text-zinc-400 truncate">{user.department ? `${user.department} Dept` : "Enterprise"}</p>
              </div>
            </div>
            <div className="mt-3 flex justify-between items-center">
              <span className={`px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-md border ${roleColors[user.role] || roleColors.Employee}`}>
                {user.role}
              </span>
            </div>
          </div>
        )}

        {/* Navigation Items */}
        <nav className="flex-1 px-3 space-y-1 py-2">
          {navItems.map((item) => {
            // Hide admin links from non-admins
            if (item.adminOnly && user?.role !== "Admin") {
              return null;
            }
            
            const active = pathname === item.path;
            return (
              <button
                key={item.name}
                onClick={() => router.push(item.path)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-xs font-medium transition-all duration-200 ${
                  active
                    ? "bg-indigo-600/15 border-l-2 border-indigo-500 text-indigo-400 font-semibold"
                    : "text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200 border-l-2 border-transparent"
                }`}
              >
                {item.icon}
                {item.name}
              </button>
            );
          })}
        </nav>

        {/* Footer actions */}
        <div className="p-4 border-t border-zinc-800/60">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-zinc-800 hover:border-zinc-700/60 hover:bg-zinc-800/30 text-xs font-medium text-zinc-400 hover:text-zinc-300 transition-all duration-200"
          >
            <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-zinc-950">
        {children}
      </main>
    </div>
  );
}
