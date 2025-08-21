'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from  '@/app/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const { data, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('Error during auth callback:', error)
          router.push('/?error=auth_failed')
        } else if (data.session) {
          // Successfully authenticated, redirect to home
          router.push('/')
        } else {
          // No session found, redirect to home
          router.push('/')
        }
      } catch (error) {
        console.error('Unexpected error:', error)
        router.push('/?error=unexpected')
      }
    }

    handleAuthCallback()
  }, [router])

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      fontFamily: 'Arial, sans-serif'
    }}>
      <div>Processing Invigilo authentication...</div>
    </div>
  )
}