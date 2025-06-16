'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/login');
          return;
        }
      } catch (error) {
        console.error('Error checking user:', error);
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };

    checkUser();
  }, [router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleTerminalClick = (terminal: number) => {
    router.push(`/rota?terminal=${terminal}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pink-50">
        <div className="animate-spin h-8 w-8 border-4 border-pink-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pink-50">
      {/* Hamburger Menu */}
      {!isMenuOpen && (
        <div className="fixed top-6 left-6 z-50">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 rounded-lg hover:bg-pink-100 transition-colors group"
          >
            <div className="relative w-6 h-6 flex items-center justify-center">
              <span className={`absolute h-0.5 w-6 bg-pink-600 transform transition-all duration-300 ${isMenuOpen ? 'rotate-45 translate-y-0' : '-translate-y-1.5'}`}></span>
              <span className={`absolute h-0.5 w-6 bg-pink-600 transform transition-all duration-300 ${isMenuOpen ? 'opacity-0' : 'opacity-100'}`}></span>
              <span className={`absolute h-0.5 w-6 bg-pink-600 transform transition-all duration-300 ${isMenuOpen ? '-rotate-45 translate-y-0' : 'translate-y-1.5'}`}></span>
            </div>
          </button>
        </div>
      )}

      {/* Sidebar Menu */}
      <div className={`fixed top-0 left-0 h-full w-64 bg-white/80 backdrop-blur-sm shadow-lg transform transition-all duration-300 ease-in-out z-40 ${isMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6">
          <div className="flex justify-between items-center mb-8">
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-pink-600">Dashboard</h2>
            </div>
            <div className="ml-4">
              <button
                onClick={() => setIsMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-pink-100 flex-shrink-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-pink-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <button
              onClick={() => router.push('/dashboard')}
              className="w-full text-left px-4 py-2 rounded-lg hover:bg-pink-100 text-pink-600"
            >
              Home
            </button>
            <button
              onClick={handleSignOut}
              className="w-full text-left px-4 py-2 rounded-lg hover:bg-pink-100 text-pink-600"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="pt-20 px-4">
        <div className="max-w-md mx-auto">
          <h1 className="text-3xl font-bold text-pink-600 text-center mb-2">
            Select Terminal
          </h1>
          <p className="text-pink-500 text-center mb-12">
            Click to view rota
          </p>
          
          <div className="space-y-4">
            {[2, 3, 4, 5].map((terminal) => (
              <button
                key={terminal}
                onClick={() => handleTerminalClick(terminal)}
                className="w-full p-6 rounded-xl bg-white hover:bg-pink-50 transition-all duration-300 border-2 border-pink-200 hover:border-pink-300 transform hover:translate-y-[-2px] hover:shadow-md"
              >
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-pink-600">
                    Terminal {terminal}
                  </h2>
                </div>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
} 