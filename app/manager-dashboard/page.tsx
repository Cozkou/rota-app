"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

const terminals = [2, 3, 4, 5];

export default function ManagerDashboardHome() {
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
      }
    }
    checkAuth();
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-pink-50 via-pink-100 to-pink-200 p-4">
      <h1 className="playfair text-4xl md:text-5xl font-extrabold text-pink-600 tracking-widest mb-10" style={{ letterSpacing: "0.15em" }}>ACCESSORIZE</h1>
      <div className="bg-white/90 rounded-3xl shadow-2xl p-8 md:p-12 w-full max-w-lg flex flex-col items-center">
        <h2 className="text-2xl font-bold text-pink-700 mb-8">Select Terminal</h2>
        <div className="w-full flex flex-col gap-6">
          {terminals.map((terminal) => (
            <button
              key={terminal}
              onClick={() => router.push(`/manager-dashboard/${terminal}`)}
              className="w-full py-6 rounded-xl bg-pink-100 hover:bg-pink-200 text-pink-700 text-2xl font-bold shadow transition"
            >
              Terminal {terminal}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
} 