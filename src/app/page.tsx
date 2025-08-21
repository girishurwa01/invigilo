'use client'

import { useState, useEffect } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [signInLoading, setSignInLoading] = useState<boolean>(false)

  useEffect(() => {
    // Get initial session
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

  const getSession = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    setUser(session?.user ?? null)
    setLoading(false)
  }

  const signInWithGoogle = async () => {
    setSignInLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`
        }
      })
      
      if (error) {
        console.error('Error signing in:', error.message)
        alert('Error signing in: ' + error.message)
      }
    } catch (error) {
      console.error('Error:', error)
      alert('An error occurred')
    }
    setSignInLoading(false)
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      console.error('Error signing out:', error.message)
    }
  }

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontFamily: 'Arial, sans-serif'
      }}>
        <div>Loading...</div>
      </div>
    )
  }

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column',
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      fontFamily: 'Arial, sans-serif',
      backgroundColor: '#f5f5f5'
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '2rem',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        textAlign: 'center',
        maxWidth: '400px',
        width: '100%'
      }}>
        <h1 style={{ marginBottom: '2rem', color: '#333' }}>Welcome to Invigilo</h1>
        
        {!user ? (
          <div>
            <p style={{ marginBottom: '2rem', color: '#666' }}>
              Please sign in to continue
            </p>
            <button
              onClick={signInWithGoogle}
              disabled={signInLoading}
              style={{
                backgroundColor: '#4285f4',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '4px',
                fontSize: '16px',
                cursor: signInLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                width: '100%',
                opacity: signInLoading ? 0.7 : 1
              }}
            >
              {signInLoading ? (
                'Signing in...'
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 18 18">
                    <path fill="#ffffff" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
                    <path fill="#ffffff" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.04a4.8 4.8 0 0 1-2.7.75 4.8 4.8 0 0 1-4.52-3.36H1.83v2.07A8 8 0 0 0 8.98 17z"/>
                    <path fill="#ffffff" d="M4.46 10.41a4.8 4.8 0 0 1-.25-1.41c0-.49.09-.97.25-1.41V5.52H1.83a8.1 8.1 0 0 0 0 6.96l2.63-2.07z"/>
                    <path fill="#ffffff" d="M8.98 4.58c1.32 0 2.5.45 3.44 1.35l2.54-2.57A8.1 8.1 0 0 0 8.98 1a8 8 0 0 0-7.15 4.52l2.63 2.05c.61-1.8 2.26-3.36 4.52-3.36z"/>
                  </svg>
                  Continue with Google
                </>
              )}
            </button>
          </div>
        ) : (
          <div>
            <div style={{
              backgroundColor: '#d4edda',
              color: '#155724',
              padding: '1rem',
              borderRadius: '4px',
              marginBottom: '2rem',
              border: '1px solid #c3e6cb'
            }}>
              <h2 style={{ margin: 0, fontSize: '1.5rem' }}>✅ COMPLETED</h2>
              <p style={{ margin: '0.5rem 0 0 0' }}>Successfully signed in to Invigilo!</p>
            </div>
            
            <div style={{ marginBottom: '2rem', textAlign: 'left' }}>
              <h3 style={{ marginBottom: '1rem', color: '#333' }}>User Information:</h3>
              <div style={{ 
                backgroundColor: '#f8f9fa', 
                padding: '1rem', 
                borderRadius: '4px',
                fontSize: '14px'
              }}>
                <p><strong>Email:</strong> {user.email}</p>
                <p><strong>Name:</strong> {user.user_metadata?.full_name || 'N/A'}</p>
                <p><strong>ID:</strong> {user.id}</p>
              </div>
            </div>
            
            <button
              onClick={signOut}
              style={{
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '4px',
                fontSize: '14px',
                cursor: 'pointer',
                width: '100%'
              }}
            >
              Sign Out
            </button>
          </div>
        )}
      </div>
    </div>
  )
}