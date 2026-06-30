"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("enterprise_rag_token");
    if (token) {
      router.replace("/chat");
    } else {
      router.replace("/login");
    }
  }, [router]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-zinc-950 text-zinc-300">
      <div className="flex flex-col items-center gap-4">
        {/* Animated Loading Ring */}
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        <p className="text-sm font-medium tracking-wide">Loading workspace...</p>
      </div>
    </div>
  );
}
