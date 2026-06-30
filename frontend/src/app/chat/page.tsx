"use client";

import React, { useState, useEffect, useRef } from "react";
import DashboardShell from "@/components/DashboardShell";

interface Message {
  id?: number;
  role: "user" | "assistant";
  content: string;
  citations?: Array<{
    document_id: number;
    filename: string;
    chunk_index: number;
    text_snippet: string;
    score: number;
  }>;
  eval_precision?: number;
  eval_recall?: number;
  eval_faithfulness?: number;
  created_at?: string;
  isStreaming?: boolean;
}

interface SessionItem {
  session_id: string;
  preview: string;
  created_at: string;
}

export default function ChatPage() {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  
  // Agent logs & status
  const [agentLogs, setAgentLogs] = useState<string[]>([]);
  const [currentAgent, setCurrentAgent] = useState<string>("");
  const [agentStatusMsg, setAgentStatusMsg] = useState<string>("");
  
  // Streaming state
  const [isSending, setIsSending] = useState(false);
  const [activeCitations, setActiveCitations] = useState<any[]>([]);
  const [activeMetrics, setActiveMetrics] = useState<any | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const API_URL = "http://localhost:8000/api";

  const getHeaders = () => {
    const token = localStorage.getItem("enterprise_rag_token");
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
  };

  // Fetch all user chat sessions
  const fetchSessions = async () => {
    try {
      const response = await fetch(`${API_URL}/chat/sessions`, {
        headers: getHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setSessions(data);
      }
    } catch (e) {
      console.error("Failed to load chat sessions", e);
    }
  };

  // Load chat messages for the selected session
  const loadSessionHistory = async (sessionId: string) => {
    setActiveSessionId(sessionId);
    setMessages([]);
    setAgentLogs([]);
    setCurrentAgent("");
    setAgentStatusMsg("");
    setActiveCitations([]);
    setActiveMetrics(null);

    try {
      const response = await fetch(`${API_URL}/chat/history/${sessionId}`, {
        headers: getHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        const formatted = data.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          citations: m.citations,
          eval_precision: m.eval_precision,
          eval_recall: m.eval_recall,
          eval_faithfulness: m.eval_faithfulness,
          created_at: m.created_at,
        }));
        setMessages(formatted);
        
        // Grab metrics/citations from the last assistant message if exists
        const assistantMsgs = formatted.filter((m: any) => m.role === "assistant");
        if (assistantMsgs.length > 0) {
          const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
          setActiveCitations(lastAssistant.citations || []);
          setActiveMetrics({
            precision: lastAssistant.eval_precision,
            recall: lastAssistant.eval_recall,
            faithfulness: lastAssistant.eval_faithfulness,
          });
        }
      }
    } catch (e) {
      console.error("Failed to load message history", e);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, agentLogs]);

  // Starts a new empty conversation
  const startNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setAgentLogs([]);
    setCurrentAgent("");
    setAgentStatusMsg("");
    setActiveCitations([]);
    setActiveMetrics(null);
  };

  // SSE Stream Sender
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSending) return;

    const userQuery = input.trim();
    setInput("");
    setIsSending(true);
    setAgentLogs([]);
    setCurrentAgent("QueryAgent");
    setAgentStatusMsg("Analyzing query intent...");
    setActiveCitations([]);
    setActiveMetrics(null);

    // 1. Add User query message locally
    const userMessage: Message = {
      role: "user",
      content: userQuery,
    };
    
    // 2. Add empty streaming placeholder message for the assistant
    const assistantMessagePlaceholder: Message = {
      role: "assistant",
      content: "",
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMessage, assistantMessagePlaceholder]);

    // 3. Initiate SSE connection via POST
    const token = localStorage.getItem("enterprise_rag_token");
    let url = `${API_URL}/chat/message`;
    if (activeSessionId) {
      url += `?session_id=${activeSessionId}`;
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ content: userQuery }),
      });

      if (!response.ok) {
        throw new Error("Chat service responded with an error.");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) return;

      let assistantText = "";
      let isDone = false;

      while (!isDone) {
        const { value, done } = await reader.read();
        if (done) break;

        const rawText = decoder.decode(value);
        // Split by double newline as SSE events are formatted
        const events = rawText.split("\n\n");

        for (const rawEvent of events) {
          const eventLine = rawEvent.trim();
          if (!eventLine) continue;

          try {
            // Remove "data: " SSE packaging if browser pushes it raw
            let jsonString = eventLine;
            if (eventLine.startsWith("data:")) {
              jsonString = eventLine.replace("data:", "").trim();
            }

            const data = JSON.parse(jsonString);

            // Handle Node status updates
            if (data.type === "agent") {
              setCurrentAgent(data.name);
              setAgentStatusMsg(data.message);
            } 
            // Handle cumulative logs list
            else if (data.type === "status") {
              setAgentLogs(data.logs || []);
            }
            // Handle text tokens
            else if (data.type === "token") {
              assistantText += data.content;
              // Update the streaming message in state
              setMessages((prev) => {
                const list = [...prev];
                const last = list[list.length - 1];
                if (last && last.role === "assistant") {
                  last.content = assistantText;
                }
                return list;
              });
            } 
            // Handle citations payload
            else if (data.type === "citations") {
              setActiveCitations(data.content || []);
              setMessages((prev) => {
                const list = [...prev];
                const last = list[list.length - 1];
                if (last && last.role === "assistant") {
                  last.citations = data.content;
                }
                return list;
              });
            } 
            // Handle evaluation metrics payload
            else if (data.type === "evaluation") {
              setActiveMetrics(data.content);
              setMessages((prev) => {
                const list = [...prev];
                const last = list[list.length - 1];
                if (last && last.role === "assistant") {
                  last.eval_precision = data.content.precision;
                  last.eval_recall = data.content.recall;
                  last.eval_faithfulness = data.content.faithfulness;
                }
                return list;
              });
            } 
            // Handle stream completion
            else if (data.type === "done") {
              isDone = true;
              if (!activeSessionId) {
                setActiveSessionId(data.session_id);
              }
              // Mark the streaming message as finished
              setMessages((prev) => {
                const list = [...prev];
                const last = list[list.length - 1];
                if (last && last.role === "assistant") {
                  last.isStreaming = false;
                }
                return list;
              });
            }
          } catch (err) {
            // Ignore partial parse failures due to socket chunk fragments
          }
        }
      }
    } catch (err: any) {
      console.error("SSE Streaming failure", err);
      setMessages((prev) => {
        const list = [...prev];
        const last = list[list.length - 1];
        if (last && last.role === "assistant") {
          last.content = `[RAG Error: ${err.message || "Failed to parse streaming response. Ensure backend server is running."}]`;
          last.isStreaming = false;
        }
        return list;
      });
    } finally {
      setIsSending(false);
      setCurrentAgent("");
      setAgentStatusMsg("");
      fetchSessions(); // Refresh sidebar lists
    }
  };

  // Helper to parse citations brackets into clickable UI badges
  const renderMessageText = (text: string) => {
    if (!text) return null;
    
    // Split by bracket citations, e.g. [Filename.pdf]
    const parts = text.split(/(\[.*?\])/g);
    
    return parts.map((part, i) => {
      if (part.startsWith("[") && part.endsWith("]")) {
        const filename = part.substring(1, part.length - 1);
        return (
          <span
            key={i}
            className="mx-0.5 inline-flex items-center px-1.5 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold text-indigo-400 select-all cursor-help hover:bg-indigo-500/20"
            title={`Cited from: ${filename}`}
          >
            {filename}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <DashboardShell>
      <div className="flex-1 flex overflow-hidden">
        {/* Sessions Sidebar Column */}
        <div className="w-56 border-r border-zinc-800/60 bg-zinc-950/40 flex flex-col flex-shrink-0">
          <div className="p-4 border-b border-zinc-800/40">
            <button
              onClick={startNewChat}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold shadow-lg shadow-indigo-600/15 transition-all"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              New Session
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 select-none">
            <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 px-3 py-1">Recent Sessions</p>
            {sessions.length === 0 ? (
              <p className="text-[11px] text-zinc-600 px-3 py-2">No active history</p>
            ) : (
              sessions.map((s) => {
                const active = activeSessionId === s.session_id;
                return (
                  <button
                    key={s.session_id}
                    onClick={() => loadSessionHistory(s.session_id)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-xs truncate transition-all ${
                      active
                        ? "bg-zinc-800/50 text-indigo-400 font-semibold border-l-2 border-indigo-500"
                        : "text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-200 border-l-2 border-transparent"
                    }`}
                  >
                    {s.preview}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Core Chat Console */}
        <div className="flex-1 flex flex-col min-w-0 bg-zinc-950">
          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto space-y-6">
                <div className="h-16 w-16 rounded-2xl bg-indigo-500/5 flex items-center justify-center border border-indigo-500/10 shadow-inner">
                  <svg className="h-8 w-8 text-indigo-400 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-100">Enterprise AI Search Assistant</h3>
                  <p className="text-xs text-zinc-400 max-w-md mx-auto mt-2 leading-relaxed">
                    Ask questions grounded in uploaded company policy handbooks, spreadsheets, and technical documents. All answers provide verifiable source citations.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 w-full max-w-md mt-4">
                  {[
                    "What is the company vacation policy?",
                    "What are the benefits in HR Handbook?",
                    "Where do I log reimbursement expenses?",
                    "List core onboarding guidelines"
                  ].map((s) => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      className="p-3 text-left rounded-xl border border-zinc-800/80 bg-zinc-900/20 hover:bg-zinc-800/30 text-[11px] text-zinc-300 font-medium transition-all"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`flex gap-4 max-w-3xl ${
                    m.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                  }`}
                >
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 border text-xs font-bold ${
                      m.role === "user"
                        ? "bg-zinc-800 border-zinc-700 text-zinc-300"
                        : "bg-indigo-600/10 border-indigo-500/20 text-indigo-400"
                    }`}
                  >
                    {m.role === "user" ? "U" : "AI"}
                  </div>
                  
                  <div className="flex flex-col space-y-2">
                    <div
                      className={`rounded-2xl p-4 text-xs leading-relaxed ${
                        m.role === "user"
                          ? "bg-indigo-600 text-white shadow-xl shadow-indigo-600/5"
                          : "bg-zinc-900/60 border border-zinc-800/60 text-zinc-200"
                      }`}
                    >
                      {m.role === "user" ? (
                        m.content
                      ) : (
                        <div className="whitespace-pre-line">
                          {renderMessageText(m.content)}
                          {m.isStreaming && (
                            <span className="inline-block h-3.5 w-1 bg-indigo-400 animate-pulse ml-0.5" />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
            
            {/* Real-time Multi-Agent Log timeline (only shown when processing) */}
            {isSending && (
              <div className="ml-12 max-w-xl rounded-xl border border-zinc-800/80 bg-zinc-950 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-indigo-500 animate-ping" />
                  <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                    Agent Pipeline: <span className="text-indigo-400">{currentAgent}</span>
                  </p>
                </div>
                <p className="text-xs text-zinc-500 italic font-medium">"{agentStatusMsg}"</p>
                
                {agentLogs.length > 0 && (
                  <div className="border-t border-zinc-900 pt-2.5 space-y-1.5 max-h-32 overflow-y-auto">
                    {agentLogs.map((log, i) => (
                      <div key={i} className="flex gap-2 text-[10px] font-mono text-zinc-500">
                        <span className="text-zinc-600">[{i+1}]</span>
                        <span>{log}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Action Input Bar */}
          <div className="p-4 border-t border-zinc-900 bg-zinc-950">
            <form onSubmit={handleSendMessage} className="flex gap-2 max-w-3xl mx-auto">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={isSending}
                className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-3 text-xs text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none transition-all disabled:opacity-50"
                placeholder="Ask about company policies, spreadsheets, or upload documents..."
              />
              <button
                type="submit"
                disabled={isSending || !input.trim()}
                className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-5 py-3 text-xs font-semibold shadow-lg shadow-indigo-600/10 transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                Send
              </button>
            </form>
          </div>
        </div>

        {/* Source Citations & Quality Metrics panel (Right Column) */}
        <div className="w-80 border-l border-zinc-800/60 bg-zinc-950/40 flex flex-col flex-shrink-0 overflow-y-auto p-4 space-y-6">
          {/* Quality Metrics */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-3.5">Response Quality Metrics</h4>
            {activeMetrics ? (
              <div className="space-y-4">
                {/* Gauge item */}
                {[
                  { name: "Faithfulness", val: activeMetrics.faithfulness, desc: "Groundedness in source text" },
                  { name: "Context Precision", val: activeMetrics.precision, desc: "Relevance of retrieved chunks" },
                  { name: "Context Recall", val: activeMetrics.recall, desc: "Completeness of source findings" },
                ].map((item) => (
                  <div key={item.name} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-zinc-300">{item.name}</span>
                      <span className="text-indigo-400 font-bold">{Math.round(item.val * 100)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                        style={{ width: `${item.val * 100}%` }}
                      />
                    </div>
                    <p className="text-[9px] text-zinc-500 italic">{item.desc}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/20 text-center">
                <p className="text-[11px] text-zinc-600">No active response metrics.</p>
              </div>
            )}
          </div>

          {/* Citations list */}
          <div className="border-t border-zinc-900 pt-5 flex-1 flex flex-col">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-3.5">Verified Source Citations</h4>
            
            {activeCitations.length === 0 ? (
              <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/20 text-center">
                <p className="text-[11px] text-zinc-600">No citations referenced.</p>
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto max-h-[400px]">
                {activeCitations.map((c, i) => (
                  <div
                    key={i}
                    className="p-3.5 rounded-xl border border-zinc-800/80 bg-zinc-900/20 hover:bg-zinc-800/30 transition-all text-left flex flex-col space-y-2 select-all"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-zinc-200 truncate max-w-[150px]" title={c.filename}>
                        {c.filename}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/25 text-[9px] font-bold text-indigo-400">
                        {Math.round(c.score * 100)}% match
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-400 italic leading-relaxed">
                      "{c.text_snippet}"
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
