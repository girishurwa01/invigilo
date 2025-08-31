'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/app/lib/supabase'

export default function CreateTestPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        router.push('/login')
        return
      }
      setUser(session.user)
      setLoading(false)
    }

    getSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!session?.user) {
          router.push('/login')
        } else {
          setUser(session.user)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Header */}
      <div className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="text-2xl font-bold text-indigo-600 hover:text-indigo-700">
              Invigilo
            </Link>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700 font-medium">
                Welcome, {user?.user_metadata?.full_name || user?.email}
              </span>
              <button
                onClick={() => supabase.auth.signOut()}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg font-medium"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Create Test</h1>
          <p className="text-xl text-gray-600">Choose the type of test you want to create</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* MCQ Test */}
          <Link href="/create-test/mcq">
            <div className="bg-white rounded-2xl shadow-xl p-8 hover:shadow-2xl transition-all duration-300 cursor-pointer">
              <div className="text-center">
                <h3 className="text-2xl font-bold text-gray-900 mb-4">MCQ Test</h3>
                <p className="text-gray-600 mb-6">Create multiple choice questions with 4 options each</p>
              </div>
            </div>
          </Link>

          {/* Coding Test */}
          <Link href="/create-test/coding">
            <div className="bg-white rounded-2xl shadow-xl p-8 hover:shadow-2xl transition-all duration-300 cursor-pointer">
              <div className="text-center">
                <h3 className="text-2xl font-bold text-gray-900 mb-4">Coding Test</h3>
                <p className="text-gray-600 mb-6">Create coding challenges with custom test cases</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Back to Home */}
        <div className="text-center mt-12">
          <Link href="/" className="inline-flex items-center text-indigo-600 hover:text-indigo-800 font-medium">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}