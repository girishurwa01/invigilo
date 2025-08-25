'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export default function Navbar() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      setLoading(false)
    }

    getSession()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signInWithGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      })
      
      if (error) {
        console.error('Error signing in:', error.message)
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Error signing out:', error.message)
    }
  }

  return (
    <nav className="bg-white shadow-lg border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex-shrink-0">
            <Link href="/" className="text-2xl font-bold text-indigo-600 hover:text-indigo-700 transition-colors">
              Invigilo
            </Link>
          </div>
          
          {/* Navigation Links - Desktop */}
          <div className="hidden md:block">
            <div className="ml-10 flex items-center space-x-6">
              <Link href="/create-test">
                <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors duration-200 shadow-md hover:shadow-lg">
                  CREATE TEST
                </button>
              </Link>
              
              <Link href="/take-test">
                <button className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium transition-colors duration-200 shadow-md hover:shadow-lg">
                  ANSWER TEST
                </button>
              </Link>

              <Link href="/view-marks">
                <button className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium transition-colors duration-200 shadow-md hover:shadow-lg">
                  VIEW MARKS
                </button>
              </Link>
              
              {!loading && (
                !user ? (
                  <button 
                    onClick={signInWithGoogle}
                    className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-medium transition-colors duration-200 shadow-md hover:shadow-lg flex items-center space-x-2"
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18">
                      <path fill="white" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
                      <path fill="white" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.04a4.8 4.8 0 0 1-2.7.75 4.8 4.8 0 0 1-4.52-3.36H1.83v2.07A8 8 0 0 0 8.98 17z"/>
                      <path fill="white" d="M4.46 10.41a4.8 4.8 0 0 1-.25-1.41c0-.49.09-.97.25-1.41V5.52H1.83a8.1 8.1 0 0 0 0 6.96l2.63-2.07z"/>
                      <path fill="white" d="M8.98 4.58c1.32 0 2.5.45 3.44 1.35l2.54-2.57A8.1 8.1 0 0 0 8.98 1a8 8 0 0 0-7.15 4.52l2.63 2.05c.61-1.8 2.26-3.36 4.52-3.36z"/>
                    </svg>
                    <span>SIGN IN</span>
                  </button>
                ) : (
                  <div className="flex items-center space-x-4">
                    <span className="text-gray-700 text-sm">
                      Welcome, {user.user_metadata?.full_name || user.email}
                    </span>
                    <button 
                      onClick={signOut}
                      className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-200"
                    >
                      SIGN OUT
                    </button>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Mobile menu */}
          <div className="md:hidden">
            {!loading && (
              !user ? (
                <button 
                  onClick={signInWithGoogle}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium flex items-center space-x-2"
                >
                  <svg width="16" height="16" viewBox="0 0 18 18">
                    <path fill="white" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
                    <path fill="white" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.04a4.8 4.8 0 0 1-2.7.75 4.8 4.8 0 0 1-4.52-3.36H1.83v2.07A8 8 0 0 0 8.98 17z"/>
                    <path fill="white" d="M4.46 10.41a4.8 4.8 0 0 1-.25-1.41c0-.49.09-.97.25-1.41V5.52H1.83a8.1 8.1 0 0 0 0 6.96l2.63-2.07z"/>
                    <path fill="white" d="M8.98 4.58c1.32 0 2.5.45 3.44 1.35l2.54-2.57A8.1 8.1 0 0 0 8.98 1a8 8 0 0 0-7.15 4.52l2.63 2.05c.61-1.8 2.26-3.36 4.52-3.36z"/>
                  </svg>
                  <span>SIGN IN</span>
                </button>
              ) : (
                <button 
                  onClick={signOut}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium"
                >
                  SIGN OUT
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <div className="md:hidden bg-gray-50 border-t border-gray-200">
        <div className="px-2 pt-2 pb-3 space-y-1">
          <Link href="/create-test" className="block">
            <button className="w-full text-left bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium mb-2">
              CREATE TEST
            </button>
          </Link>
          <Link href="/take-test" className="block">
            <button className="w-full text-left bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium mb-2">
              ANSWER TEST
            </button>
          </Link>
          <Link href="/view-marks" className="block">
            <button className="w-full text-left bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium">
              VIEW MARKS
            </button>
          </Link>
        </div>
      </div>
    </nav>
  )
}