'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/app/lib/supabase'

export default function TakeCodingTest() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [testCode, setTestCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const getSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) throw new Error(error.message)
        if (!session?.user) {
          router.push('/login')
          return
        }
        setUser(session.user)
        setLoading(false)
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        setError('Error fetching session: ' + errorMessage)
        setLoading(false)
      }
    }

    getSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!session?.user) {
          router.push('/login')
        } else {
          setUser(session.user)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!testCode.trim()) {
      setError('Please enter a test code')
      return
    }

    if (!user) {
      setError('Please log in first')
      return
    }

    setVerifying(true)
    setError(null)

    try {
      // Verify test code exists and is active
      const { data: test, error: testError } = await supabase
        .from('tests')
        .select('id, title, test_code, is_active, test_type, time_limit, total_questions')
        .ilike('test_code', testCode.trim())
        .eq('is_active', true)
        .eq('test_type', 'coding')
        .single()

      console.log('Test verification result:', test)
      console.log('Test verification error:', testError)

      if (testError || !test) {
        setError('Invalid test code or test is not active')
        setVerifying(false)
        return
      }

      // Check if this test has coding questions
      const { data: questionsCheck, error: questionsError } = await supabase
        .from('coding_questions')
        .select('id')
        .eq('test_id', test.id)
        .limit(1)

      console.log('Questions check result:', questionsCheck)
      console.log('Questions check error:', questionsError)

      if (questionsError) {
        setError('Error checking test questions')
        setVerifying(false)
        return
      }

      if (!questionsCheck || questionsCheck.length === 0) {
        setError('This coding test has no questions. Please contact your instructor.')
        setVerifying(false)
        return
      }

      // Check if user has already completed this test
      const { data: attempts, error: attemptError } = await supabase
        .from('test_attempts')
        .select('id, completed_at, score')
        .eq('test_id', test.id)
        .eq('user_id', user.id)
        .order('completed_at', { ascending: false })

      if (attemptError && attemptError.code !== 'PGRST116') {
        throw new Error(attemptError.message)
      }

      if (attempts && attempts.length > 0) {
        const completedAttempt = attempts.find(attempt => attempt.completed_at)
        if (completedAttempt) {
          setError('You have already completed this test. Redirecting to view your marks.')
          setTimeout(() => {
            router.push('/view-marks')
          }, 2000)
          return
        }
      }

      // Redirect to the actual test
      router.push(`/take-coding-test/${testCode.trim().toLowerCase()}`)
      
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      console.error('Error verifying test code:', err)
      setError(`Error verifying test code: ${errorMessage}`)
      setVerifying(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
      <div className="max-w-md mx-auto px-4">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="bg-blue-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Take Coding Test</h1>
            <p className="text-gray-600">Enter your test code to begin</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="testCode" className="block text-sm font-medium text-gray-700 mb-2">
                Test Code
              </label>
              <input
                type="text"
                id="testCode"
                value={testCode}
                onChange={(e) => setTestCode(e.target.value.toUpperCase())}
                placeholder="Enter test code (e.g., TEST123)"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-lg font-mono tracking-wider"
                disabled={verifying}
                maxLength={20}
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex">
                  <svg className="h-5 w-5 text-red-400 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.962-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={verifying || !testCode.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {verifying ? (
                <div className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Verifying...
                </div>
              ) : (
                'Start Test'
              )}
            </button>
          </form>

          <div className="mt-8 text-center">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-2">Instructions</h3>
              <ul className="text-sm text-gray-600 space-y-1 text-left">
                <li>• Enter the test code provided by your instructor</li>
                <li>• Make sure you have a stable internet connection</li>
                <li>• The test will be timed once you start</li>
                <li>• You cannot pause or restart once begun</li>
               <li>• Ensure you&apos;re in a quiet environment</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              Need help? Contact your instructor or 
              <button 
                onClick={() => router.push('/dashboard')}
                className="text-blue-600 hover:text-blue-800 ml-1"
              >
                return to dashboard
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}