'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { AuthError } from '@supabase/supabase-js';

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (error) throw error;

      if (data?.user) {
        console.log("Logged in user UUID:", data.user.id);
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', data.user.id)
          .single();
        console.log('Profile:', profile, 'Profile error:', profileError);

        if (profileError) throw profileError;

        if (profile?.role === 'manager') {
          router.push('/manager-dashboard');
        } else {
          router.push('/dashboard');
        }
      }
    } catch (err) {
      const authError = err as AuthError;
      setError(authError.message || 'An error occurred during login');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-pink-50 via-pink-100 to-pink-200 p-4">
      <div className="w-full max-w-md bg-white/90 rounded-2xl sm:rounded-3xl shadow-xl sm:shadow-2xl p-6 sm:p-8">
        <h1 className="playfair text-3xl sm:text-4xl font-extrabold text-pink-600 tracking-widest mb-6 sm:mb-8 text-center" style={{ letterSpacing: "0.15em" }}>ACCESSORIZE</h1>
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-sm mb-2">
              {error}
            </div>
          )}
          <div>
            <label htmlFor="email" className="block text-sm sm:text-base font-medium text-pink-700 mb-1 sm:mb-2">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              className="w-full px-3 sm:px-4 py-2 sm:py-3 rounded-lg border border-pink-200 placeholder-pink-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-colors"
              placeholder="Enter your email"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm sm:text-base font-medium text-pink-700 mb-1 sm:mb-2">Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              className="w-full px-3 sm:px-4 py-2 sm:py-3 rounded-lg border border-pink-200 placeholder-pink-300 text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-colors"
              placeholder="Enter your password"
            />
            <button
              type="button"
              className="mt-2 text-sm text-pink-600 hover:underline focus:outline-none"
              onClick={() => setShowPassword(!showPassword)}
              disabled={isLoading}
            >
              {showPassword ? 'Hide password' : 'View password'}
            </button>
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2 sm:py-3 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors text-sm sm:text-base font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                Signing in...
              </div>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  );
} 