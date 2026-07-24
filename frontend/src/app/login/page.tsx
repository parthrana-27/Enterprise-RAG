"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("Employee");
  const [department, setDepartment] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

  useEffect(() => {
    // If user already logged in, redirect
    const token = localStorage.getItem("enterprise_rag_token");
    if (token) {
      router.push("/chat");
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    if (!username.trim() || !password.trim()) {
      setError("Please fill in all required fields.");
      setLoading(false);
      return;
    }

    try {
      if (isRegister) {
        // Register API Call
        const response = await fetch(`${API_URL}/auth/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: username.trim(),
            password: password.trim(),
            role,
            department: department.trim() || null,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || "Registration failed.");
        }

        setSuccess("Account created successfully! Switching to sign in.");
        setIsRegister(false);
        setPassword("");
      } else {
        // Login API Call
        const response = await fetch(`${API_URL}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: username.trim(),
            password: password.trim(),
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || "Authentication failed.");
        }

        // Store Token
        localStorage.setItem("enterprise_rag_token", data.access_token);

        // Fetch User Info
        const meResponse = await fetch(`${API_URL}/auth/me`, {
          headers: {
            Authorization: `Bearer ${data.access_token}`,
          },
        });
        const meData = await meResponse.json();

        if (meResponse.ok) {
          localStorage.setItem("enterprise_rag_user", JSON.stringify(meData));
          router.push("/chat");
        } else {
          throw new Error("Failed to load user profile.");
        }
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-zinc-950 px-4 font-sans text-zinc-100 selection:bg-indigo-500/30">
      {/* Decorative background grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1f29370a_1px,transparent_1px),linear-gradient(to_bottom,#1f29370a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />
      <div className="absolute top-1/4 left-1/4 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 h-72 w-72 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />

      {/* Main card */}
      <div className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-col items-center gap-3 text-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 shadow-xl shadow-indigo-500/10">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Enterprise Knowledge Assistant</h2>
            <p className="text-xs text-zinc-400 mt-1">Multi-Agent Retrieval Augmented Generation</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-500/15 border border-red-500/20 p-3 text-xs text-red-400 font-medium">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 rounded-lg bg-emerald-500/15 border border-emerald-500/20 p-3 text-xs text-emerald-400 font-medium">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none transition-all"
              placeholder="Enter your username"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none transition-all"
              placeholder="••••••••"
            />
          </div>

          {isRegister && (
            <>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">Security Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-xs text-zinc-200 focus:border-indigo-500 focus:outline-none transition-all"
                >
                  <option value="Employee">Employee (Search public documents)</option>
                  <option value="Manager">Manager (Upload, search, view team files)</option>
                  <option value="Admin">Admin (Full administrative clearance)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">Department</label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:border-indigo-500 focus:outline-none transition-all"
                  placeholder="e.g. HR, Engineering, Finance"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 py-2.5 text-xs font-semibold text-white shadow-lg hover:from-indigo-500 hover:to-purple-500 focus:outline-none transition-all disabled:opacity-50 disabled:pointer-events-none mt-2"
          >
            {loading ? "Processing..." : isRegister ? "Create Account" : "Sign In"}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-zinc-400 border-t border-zinc-800/60 pt-4">
          {isRegister ? (
            <p>
              Already have an account?{" "}
              <button onClick={() => setIsRegister(false)} className="text-indigo-400 hover:text-indigo-300 font-semibold focus:outline-none">
                Sign In
              </button>
            </p>
          ) : (
            <p>
              Don't have an account?{" "}
              <button onClick={() => setIsRegister(true)} className="text-indigo-400 hover:text-indigo-300 font-semibold focus:outline-none">
                Create Account
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
