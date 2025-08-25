'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/app/lib/supabase'
import Layout from '@/app/components/Layout'

export default function LoginPage() {
  const [email, setEmail] = useState<string>('');
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const router = useRouter();

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        router.push('/');
      }
      setLoading(false);
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          router.push('/');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [router]);

  const signInWithGoogle = async () => {
    setAuthLoading(true)
    setMessage('')
    
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      })
      
      if (error) {
        setMessage('Error signing in: ' + error.message)
      }
    } catch (error) {
      console.error('Error:', error)
      setMessage('An unexpected error occurred')
    }
    
    setAuthLoading(false)
  }

  const signInWithMagicLink = async () => {
    if (!email) {
      setMessage('Please enter your email address')
      return
    }

    setAuthLoading(true)
    setMessage('')

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`
        }
      })

      if (error) {
        setMessage('Error: ' + error.message)
      } else {
        setMessage('Magic link sent! Check your email inbox.')
      }
    } catch (error) {
      console.error('Error:', error)
      setMessage('An unexpected error occurred')
    }
    
    setAuthLoading(false)
  }

  if (loading) {
    return (
      <Layout>
        <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
          <div className="text-xl text-gray-600">Loading...</div>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="min-h-[calc(100vh-8rem)] bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <Link href="/" className="inline-block">
              <h1 className="text-4xl font-bold text-indigo-600 hover:text-indigo-700 transition-colors mb-4">
                Invigilo
              </h1>
            </Link>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Welcome Back</h2>
            <p className="text-gray-600">Sign in to access the E-Proctor System</p>
          </div>

          {/* Auth Card */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-xl p-8 border border-white/20">
            {/* Messages */}
            {message && (
              <div
                className={`p-4 rounded-lg mb-6 ${
                  message.includes('Error') || message.includes('error')
                    ? 'bg-red-50 text-red-800 border border-red-200' 
                    : 'bg-green-50 text-green-800 border border-green-200'
                }`}
              >
                <span className="text-sm">{message}</span>
              </div>
            )}

            {/* Google Sign In */}
            <button
              onClick={signInWithGoogle}
              disabled={authLoading}
              className="w-full mb-6 bg-white hover:bg-gray-50 text-gray-700 font-medium py-4 px-6 border-2 border-gray-200 rounded-xl shadow-sm flex items-center justify-center space-x-3 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-md"
            >
              <svg width="20" height="20" viewBox="0 0 18 18">
                <path fill="#4285f4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
                <path fill="#34a853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.04a4.8 4.8 0 0 1-2.7.75 4.8 4.8 0 0 1-4.52-3.36H1.83v2.07A8 8 0 0 0 8.98 17z"/>
                <path fill="#fbbc04" d="M4.46 10.41a4.8 4.8 0 0 1-.25-1.41c0-.49.09-.97.25-1.41V5.52H1.83a8.1 8.1 0 0 0 0 6.96l2.63-2.07z"/>
                <path fill="#ea4335" d="M8.98 4.58c1.32 0 2.5.45 3.44 1.35l2.54-2.57A8.1 8.1 0 0 0 8.98 1a8 8 0 0 0-7.15 4.52l2.63 2.05c.61-1.8 2.26-3.36 4.52-3.36z"/>
              </svg>
              <span>Continue with Google</span>
            </button>

            {/* Divider */}
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-white text-gray-500">or continue with email</span>
              </div>
            </div>

            {/* Magic Link Section */}
            <div className="space-y-6">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200"
                  onKeyDown={(e) => e.key === 'Enter' && !authLoading && signInWithMagicLink()}
                />
              </div>
              
              <button
                onClick={signInWithMagicLink}
                disabled={authLoading || !email.trim()}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-medium py-4 px-6 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                {authLoading ? 'Sending Magic Link...' : 'Send Magic Link'}
              </button>
            </div>

            {/* Info Text */}
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-600">
                We&apos;ll send you a secure link to sign in instantly without a password
              </p>
            </div>
          </div>

          {/* Back to Home */}
          <div className="text-center mt-6">
            <Link 
              href="/" 
              className="text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  )
}