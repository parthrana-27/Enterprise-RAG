"use client";

import React, { useState, useEffect } from "react";
import DashboardShell from "@/components/DashboardShell";

interface DocumentItem {
  id: number;
  filename: string;
  file_type: string;
  upload_date: string;
  department: string | null;
  version: number;
  security_level: string;
  status: string;
  error_message: string | null;
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [userRole, setUserRole] = useState("");
  
  // Upload inputs
  const [file, setFile] = useState<File | null>(null);
  const [securityLevel, setSecurityLevel] = useState("Employee");
  const [department, setDepartment] = useState("");
  
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const API_URL = "http://localhost:8000/api";

  const getHeaders = () => {
    const token = localStorage.getItem("enterprise_rag_token");
    return {
      Authorization: `Bearer ${token}`,
    };
  };

  const fetchDocuments = async () => {
    try {
      const response = await fetch(`${API_URL}/documents/list`, {
        headers: getHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setDocuments(data);
      }
    } catch (e) {
      console.error("Failed to load documents catalog", e);
    }
  };

  useEffect(() => {
    fetchDocuments();
    const storedUser = localStorage.getItem("enterprise_rag_user");
    if (storedUser) {
      try {
        const u = JSON.parse(storedUser);
        setUserRole(u.role);
        setDepartment(u.department || "");
      } catch (e) {}
    }
    
    // Poll documents list every 5 seconds to track background ingestion progress
    const interval = setInterval(fetchDocuments, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    
    if (!file) {
      setError("Please select a file to upload.");
      return;
    }

    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("security_level", securityLevel);
    if (department.trim()) {
      formData.append("department", department.trim());
    }

    try {
      const token = localStorage.getItem("enterprise_rag_token");
      const response = await fetch(`${API_URL}/documents/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Upload failed.");
      }

      setSuccess(`File "${file.name}" accepted! Chunking and indexing in the background...`);
      setFile(null);
      
      // Reset input element
      const fileInput = document.getElementById("file-upload") as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      
      fetchDocuments();
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred during upload.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (docId: number) => {
    if (!confirm("Are you sure you want to delete this document? This deletes all associated search chunks and vectors.")) {
      return;
    }

    try {
      const token = localStorage.getItem("enterprise_rag_token");
      const response = await fetch(`${API_URL}/documents/delete/${docId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setSuccess("Document deleted successfully.");
        fetchDocuments();
      } else {
        const data = await response.json();
        throw new Error(data.detail || "Deletion failed.");
      }
    } catch (e: any) {
      setError(e.message || "Could not delete document.");
    }
  };

  // Render Status badges
  const renderStatus = (status: string, errMsg: string | null) => {
    if (status === "completed") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
          ● Ready
        </span>
      );
    } else if (status === "failed") {
      return (
        <span
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-[10px] font-bold uppercase tracking-wider text-red-400 cursor-help"
          title={errMsg || "Processing error"}
        >
          ● Failed
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-[10px] font-bold uppercase tracking-wider text-indigo-400 animate-pulse">
          ● Processing
        </span>
      );
    }
  };

  const securityColors: Record<string, string> = {
    Admin: "text-red-400 bg-red-500/10 border-red-500/20",
    Manager: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    Employee: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  };

  return (
    <DashboardShell>
      <div className="flex-1 flex flex-col overflow-y-auto p-6 space-y-6">
        {/* Page title */}
        <div>
          <h2 className="text-xl font-bold text-zinc-100">Knowledge Ingestion Console</h2>
          <p className="text-xs text-zinc-400 mt-1">Upload and manage internal documents securely. Files are indexed, chunked, and vectorized in real-time.</p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-500/15 border border-red-500/20 p-3 text-xs text-red-400 font-medium">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-lg bg-emerald-500/15 border border-emerald-500/20 p-3 text-xs text-emerald-400 font-medium">
            {success}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Upload card (only available for Manager and Admin) */}
          <div className="lg:col-span-1">
            {userRole === "Employee" ? (
              <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/10 text-center space-y-3">
                <svg className="h-10 w-10 text-zinc-600 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <h3 className="text-sm font-bold text-zinc-300">Upload Restricted</h3>
                <p className="text-xs text-zinc-500 leading-relaxed">
                  Your current security clearance (Employee) only permits searching and chatting with existing public files. Contact an Admin for upload privileges.
                </p>
              </div>
            ) : (
              <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/30 backdrop-blur-md space-y-4">
                <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-wider">Upload New Document</h3>
                
                <form onSubmit={handleUpload} className="space-y-4">
                  {/* File selector box */}
                  <div className="border-2 border-dashed border-zinc-800 hover:border-indigo-500/50 rounded-xl p-4 text-center cursor-pointer transition-all relative">
                    <input
                      id="file-upload"
                      type="file"
                      onChange={handleFileChange}
                      accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.md,.txt"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <svg className="h-8 w-8 text-zinc-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-xs font-semibold text-zinc-300">
                      {file ? file.name : "Select or drag file"}
                    </p>
                    <p className="text-[9px] text-zinc-500 mt-1">PDF, Word, PPT, Excel, Markdown (Max 10MB)</p>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Security Level</label>
                    <select
                      value={securityLevel}
                      onChange={(e) => setSecurityLevel(e.target.value)}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 transition-all"
                    >
                      <option value="Employee">Employee (Public/General)</option>
                      <option value="Manager">Manager (Restricted to Managers)</option>
                      <option value="Admin">Admin (Highly Confidential)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Department Filter</label>
                    <input
                      type="text"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-all"
                      placeholder="e.g. HR, Engineering (Leave empty for General)"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isUploading || !file}
                    className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-500 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-600/10 transition-all disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {isUploading ? "Uploading & Processing..." : "Upload Document"}
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Catalog grid */}
          <div className="lg:col-span-2">
            <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900/30 backdrop-blur-md flex flex-col h-full min-h-[400px]">
              <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-wider mb-4">Ingested Document Catalog</h3>
              
              <div className="flex-1 overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 text-[10px] uppercase font-bold text-zinc-500">
                      <th className="pb-3 pr-2">File Name</th>
                      <th className="pb-3 px-2 text-center">Version</th>
                      <th className="pb-3 px-2 text-center">Clearance</th>
                      <th className="pb-3 px-2 text-center">Department</th>
                      <th className="pb-3 px-2 text-center">Status</th>
                      {userRole === "Admin" && <th className="pb-3 pl-2 text-right">Actions</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-900/60">
                    {documents.length === 0 ? (
                      <tr>
                        <td colSpan={userRole === "Admin" ? 6 : 5} className="py-8 text-center text-zinc-500 italic">
                          No documents uploaded or matching your access level.
                        </td>
                      </tr>
                    ) : (
                      documents.map((doc) => (
                        <tr key={doc.id} className="hover:bg-zinc-800/10 transition-colors">
                          <td className="py-3.5 pr-2 font-medium text-zinc-200">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] truncate max-w-[180px] font-semibold" title={doc.filename}>{doc.filename}</span>
                              <span className="text-[9px] px-1.5 py-0.2 bg-zinc-800 rounded font-mono text-zinc-400">.{doc.file_type}</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-2 text-center font-semibold text-zinc-400">
                            v{doc.version}
                          </td>
                          <td className="py-3.5 px-2 text-center">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${securityColors[doc.security_level] || securityColors.Employee}`}>
                              {doc.security_level}
                            </span>
                          </td>
                          <td className="py-3.5 px-2 text-center text-zinc-400">
                            {doc.department || "General"}
                          </td>
                          <td className="py-3.5 px-2 text-center">
                            {renderStatus(doc.status, doc.error_message)}
                          </td>
                          {userRole === "Admin" && (
                            <td className="py-3.5 pl-2 text-right">
                              <button
                                onClick={() => handleDelete(doc.id)}
                                className="p-1.5 rounded hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-all"
                                title="Delete document"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
