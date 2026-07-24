"use client";

import React, { useState, useEffect } from "react";
import DashboardShell from "@/components/DashboardShell";

interface AuditLogItem {
  id: number;
  action: string;
  target_type: string;
  target_id: string | null;
  details: string;
  timestamp: string;
  username: string;
}

interface UserActivityItem {
  username: string;
  role: string;
  department: string;
  queries_asked: number;
}

interface FrequentQueryItem {
  query: string;
  count: number;
}

interface EvalStats {
  total_queries: number;
  avg_precision: number;
  avg_recall: number;
  avg_faithfulness: number;
  avg_latency_ms: number;
  total_token_cost: number;
  hallucination_rate_percent: number;
}

interface DailyHistoryItem {
  date: string;
  queries: number;
  precision: number;
  recall: number;
  faithfulness: number;
  latency_ms: number;
  cost: number;
}

export default function AdminPage() {
  const [stats, setStats] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [frequentQueries, setFrequentQueries] = useState<FrequentQueryItem[]>([]);
  const [userActivity, setUserActivity] = useState<UserActivityItem[]>([]);
  
  // Evaluation data
  const [evalSummary, setEvalSummary] = useState<EvalStats | null>(null);
  const [evalHistory, setEvalHistory] = useState<DailyHistoryItem[]>([]);
  const [historyDays, setHistoryDays] = useState(7);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

  const getHeaders = () => {
    const token = localStorage.getItem("enterprise_rag_token");
    return {
      Authorization: `Bearer ${token}`,
    };
  };

  const loadAdminData = async () => {
    try {
      const headers = getHeaders();
      
      // 1. Fetch system counts
      const statsRes = await fetch(`${API_URL}/admin/stats`, { headers });
      if (!statsRes.ok) throw new Error("Failed to load system stats.");
      const statsData = await statsRes.ok ? await statsRes.json() : null;
      setStats(statsData);

      // 2. Fetch evaluation metrics
      const evalRes = await fetch(`${API_URL}/evaluate/metrics?days=${historyDays}`, { headers });
      if (evalRes.ok) {
        const evalData = await evalRes.json();
        setEvalSummary(evalData.summary);
        setEvalHistory(evalData.history || []);
      }

      // 3. Fetch audit logs
      const auditRes = await fetch(`${API_URL}/admin/audit-logs?limit=10`, { headers });
      if (auditRes.ok) {
        setAuditLogs(await auditRes.json());
      }

      // 4. Fetch frequent queries
      const freqRes = await fetch(`${API_URL}/admin/frequent-queries?limit=5`, { headers });
      if (freqRes.ok) {
        setFrequentQueries(await freqRes.json());
      }

      // 5. Fetch user activity
      const actRes = await fetch(`${API_URL}/admin/user-activity?limit=5`, { headers });
      if (actRes.ok) {
        setUserActivity(await actRes.json());
      }

      setError("");
    } catch (e: any) {
      setError(e.message || "Could not fetch administrative metrics.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, [historyDays]);

  if (loading) {
    return (
      <DashboardShell>
        <div className="flex-1 flex items-center justify-center text-zinc-300">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            <p className="text-xs font-semibold">Gathering telemetry metrics...</p>
          </div>
        </div>
      </DashboardShell>
    );
  }

  // Helper to plot clean custom SVG lines for the historical chart
  const renderHistoryChart = () => {
    if (evalHistory.length < 2) {
      return (
        <div className="h-40 flex items-center justify-center border border-zinc-800 rounded-xl bg-zinc-950/20 text-xs text-zinc-600">
          Insufficient historical data points.
        </div>
      );
    }

    const width = 500;
    const height = 150;
    const padding = 20;

    const maxQueries = Math.max(...evalHistory.map((h) => h.queries), 5);
    
    // Calculate coordinates for points
    const points = evalHistory.map((h, i) => {
      const x = padding + (i / (evalHistory.length - 1)) * (width - padding * 2);
      const y = height - padding - (h.queries / maxQueries) * (height - padding * 2);
      return { x, y, date: h.date, val: h.queries };
    });

    // Create SVG Path string
    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      pathD += ` L ${points[i].x} ${points[i].y}`;
    }

    return (
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-44 text-indigo-500 overflow-visible">
          {/* Grid lines */}
          <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="#27272a" strokeWidth={0.5} />
          <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="#27272a" strokeWidth={0.5} />
          <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#27272a" strokeWidth={1} />
          
          {/* Main trend line */}
          <path d={pathD} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="drop-shadow-[0_2px_8px_rgba(99,102,241,0.2)]" />
          
          {/* Points */}
          {points.map((p, idx) => (
            <g key={idx} className="group cursor-help">
              <circle cx={p.x} cy={p.y} r={4} fill="#6366f1" stroke="#09090b" strokeWidth={1.5} />
              <title>{`${p.date}: ${p.val} queries`}</title>
            </g>
          ))}
        </svg>
        <div className="flex justify-between text-[8px] text-zinc-500 uppercase font-bold tracking-wider px-4">
          <span>{evalHistory[0].date}</span>
          <span>Query Volume Trend</span>
          <span>{evalHistory[evalHistory.length - 1].date}</span>
        </div>
      </div>
    );
  };

  const actionColors: Record<string, string> = {
    UPLOAD: "text-emerald-400 border-emerald-500/20 bg-emerald-500/5",
    DELETE: "text-red-400 border-red-500/20 bg-red-500/5",
    QUERY: "text-indigo-400 border-indigo-500/20 bg-indigo-500/5",
    REGISTER: "text-purple-400 border-purple-500/20 bg-purple-500/5",
    LOGIN: "text-blue-400 border-blue-500/20 bg-blue-500/5",
  };

  return (
    <DashboardShell>
      <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6 bg-zinc-950 text-zinc-100">
        
        {/* Top Header */}
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold">System Operations Dashboard</h2>
            <p className="text-xs text-zinc-400 mt-1">Real-time system health, security audit trails, and RAG evaluation statistics.</p>
          </div>
          
          {/* History range selectors */}
          <div className="flex gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/30 p-1">
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setHistoryDays(d)}
                className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${
                  historyDays === d
                    ? "bg-indigo-600 text-white"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {d} Days
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-500/15 border border-red-500/20 p-3 text-xs text-red-400 font-medium">
            {error}
          </div>
        )}

        {/* Dynamic Metric Widget Cards */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { name: "Total Cataloged Chunks", val: stats.total_chunks, sub: `${stats.documents.total} document files`, color: "border-zinc-800" },
              { name: "Queries Handled", val: stats.total_queries, sub: evalSummary ? `Costing ~$${evalSummary.total_token_cost.toFixed(4)}` : "N/A", color: "border-zinc-800" },
              { name: "Evaluation Avg Accuracy", val: evalSummary ? `${Math.round((evalSummary.avg_precision + evalSummary.avg_recall + evalSummary.avg_faithfulness) / 3 * 100)}%` : "100%", sub: "Aggregated metrics", color: "border-zinc-800" },
              { name: "Hallucination Risk", val: evalSummary ? `${evalSummary.hallucination_rate_percent}%` : "0%", sub: "Ungrounded answers", color: evalSummary && evalSummary.hallucination_rate_percent > 10 ? "border-red-500/30 text-red-400" : "border-zinc-800" }
            ].map((card, i) => (
              <div key={i} className={`p-4 rounded-xl border bg-zinc-900/30 backdrop-blur-md flex flex-col justify-between ${card.color}`}>
                <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{card.name}</p>
                <h3 className="text-2xl font-black mt-2 bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">{card.val}</h3>
                <p className="text-[10px] text-zinc-400 mt-1">{card.sub}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Graph visual card */}
          <div className="lg:col-span-2 p-6 rounded-xl border border-zinc-800 bg-zinc-900/30 backdrop-blur-md flex flex-col justify-between min-h-[250px]">
            <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider mb-4">Daily Query Telemetry</h3>
            {renderHistoryChart()}
          </div>
          
          {/* Hallucination / Evaluation Gauges */}
          <div className="lg:col-span-1 p-6 rounded-xl border border-zinc-800 bg-zinc-900/30 backdrop-blur-md flex flex-col justify-between">
            <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider mb-4">RAG Evaluation Details</h3>
            
            {evalSummary ? (
              <div className="space-y-4">
                {[
                  { name: "Faithfulness Score", val: evalSummary.avg_faithfulness, desc: "Answers fully grounded in files" },
                  { name: "Context Recall", val: evalSummary.avg_recall, desc: "Retrieval covering user query" },
                  { name: "Context Precision", val: evalSummary.avg_precision, desc: "Signal-to-noise ratio in search" }
                ].map((item) => (
                  <div key={item.name} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-zinc-300">{item.name}</span>
                      <span className="text-indigo-400 font-bold">{Math.round(item.val * 100)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" style={{ width: `${item.val * 100}%` }} />
                    </div>
                    <p className="text-[9px] text-zinc-500 italic">{item.desc}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-500 text-center py-8">Awaiting evaluation aggregates.</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Security Audit Trail table */}
          <div className="lg:col-span-2 p-6 rounded-xl border border-zinc-800 bg-zinc-900/30 backdrop-blur-md flex flex-col h-full min-h-[300px]">
            <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider mb-4">Security Audit Trail Logs</h3>
            
            <div className="flex-1 overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-[9px] uppercase font-bold text-zinc-500">
                    <th className="pb-3 pr-2">Timestamp</th>
                    <th className="pb-3 px-2">Operator</th>
                    <th className="pb-3 px-2 text-center">Action</th>
                    <th className="pb-3 px-2">Target</th>
                    <th className="pb-3 pl-2">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900/50">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-zinc-500 italic">No audit records recorded yet.</td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-zinc-800/10 transition-colors">
                        <td className="py-2.5 pr-2 font-mono text-[10px] text-zinc-500">
                          {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>
                        <td className="py-2.5 px-2 font-semibold text-zinc-300">
                          {log.username}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${actionColors[log.action] || "text-zinc-400 border-zinc-800"}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 font-mono text-[10px] text-zinc-400">
                          {log.target_type}:{log.target_id || "SYS"}
                        </td>
                        <td className="py-2.5 pl-2 text-zinc-400 truncate max-w-[200px]" title={log.details}>
                          {log.details}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Side stats: Frequent queries & Active Users */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            
            {/* Frequent queries card */}
            <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/30 backdrop-blur-md">
              <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider mb-4">Most Frequent Queries</h3>
              <div className="space-y-3">
                {frequentQueries.length === 0 ? (
                  <p className="text-xs text-zinc-500 italic text-center py-3">No query volume data.</p>
                ) : (
                  frequentQueries.map((q, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs">
                      <span className="text-zinc-300 truncate max-w-[170px]" title={q.query}>
                        {q.query}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-indigo-500/15 text-[10px] font-bold text-indigo-400">
                        {q.count} calls
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Active Users scoreboard */}
            <div className="p-6 rounded-xl border border-zinc-800 bg-zinc-900/30 backdrop-blur-md">
              <h3 className="text-xs font-bold text-zinc-200 uppercase tracking-wider mb-4">Top Active Users</h3>
              <div className="space-y-3">
                {userActivity.length === 0 ? (
                  <p className="text-xs text-zinc-500 italic text-center py-3">No active users recorded.</p>
                ) : (
                  userActivity.map((u, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs">
                      <div>
                        <span className="font-semibold text-zinc-200 block">{u.username}</span>
                        <span className="text-[9px] text-zinc-500 font-bold uppercase">{u.role} | {u.department}</span>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700/60 text-[10px] font-mono text-zinc-400">
                        {u.queries_asked} asks
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>

      </div>
    </DashboardShell>
  );
}
