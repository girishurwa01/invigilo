'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/app/lib/supabase'

interface TestInfo {
  id: string
  test_code: string
  title: string
  description: string | null
  time_limit: number
  total_questions: number
  created_by: string
  creator_name: string
  is_active: boolean
}

export default function AnswerTestPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [testCode, setTestCode] = useState('')
  const [searching, setSearching] = useState(false)
  const [testInfo, setTestInfo] = useState<TestInfo | null>(null)
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    const getSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) throw new Error(error.message);
        if (!session?.user) {
          router.push('/login');
          return;
        }
        setUser(session.user);
        setLoading(false);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        console.error('Error fetching session:', error);
        setError('Failed to load session. Please try again.');
        setLoading(false);
      }
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

  const searchTest = async () => {
    if (!testCode.trim()) {
      setError('Please enter a test code.')
      return
    }

    setSearching(true)
    setError('')
    setTestInfo(null)

    try {
      const { data: testData, error: testError } = await supabase
        .from('tests')
        .select(`
          *,
          profiles:created_by (
            full_name,
            username,
            email
          )
        `)
        .ilike('test_code', testCode.toLowerCase()) // Case-insensitive match
        .eq('is_active', true)
        .single()

      if (testError || !testData) {
        setError('Test not found or inactive. Please check the test code or contact your instructor.')
        return
      }

      // Check if user has already attempted this test
      const { data: attemptData, error: attemptError } = await supabase
        .from('test_attempts')
        .select('id')
        .eq('test_id', testData.id)
        .eq('user_id', user?.id)
        .single()

      if (attemptError && attemptError.code !== 'PGRST116') {
        throw new Error(attemptError.message)
      }

      if (attemptData) {
        setError('You have already attempted this test.')
        return
      }

      setTestInfo({
        id: testData.id,
        test_code: testData.test_code,
        title: testData.title,
        description: testData.description,
        time_limit: testData.time_limit,
        total_questions: testData.total_questions,
        created_by: testData.created_by,
        creator_name: testData.profiles?.full_name || testData.profiles?.username || testData.profiles?.email || 'Unknown',
        is_active: testData.is_active
      })
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error searching test:', error)
      setError('An error occurred while searching for the test. Please try again.')
    } finally {
      setSearching(false)
    }
  }

  const startTest = () => {
    if (testInfo) {
      router.push(`/take-test/${testInfo.test_code}`)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    )
  }

  if (error && !testInfo && !searching) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl text-red-600 mb-4">{error}</div>
          <button
            onClick={() => {
              setError('')
              setTestCode('')
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg"
          >
            Try Again
          </button>
        </div>
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
              <span className="text-gray-700">
                Welcome, {user?.user_metadata?.full_name || user?.email}
              </span>
              <button
                onClick={() => supabase.auth.signOut()}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Answer Test</h1>
          <p className="text-xl text-gray-600">Enter the test code to start your examination</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {!testInfo ? (
            <>
              <div className="text-center mb-8">
                <div className="bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Enter Test Code</h2>
                <p className="text-gray-600">Get the 6-character test code from your instructor</p>
              </div>

              <div className="space-y-6">
                <div>
                  <label htmlFor="testCode" className="block text-sm font-medium text-gray-700 mb-2">
                    Test Code
                  </label>
                  <input
                    id="testCode"
                    type="text"
                    value={testCode}
                    onChange={(e) => setTestCode(e.target.value.toLowerCase())}
                    placeholder="Enter 6-character test code"
                    maxLength={6}
                    className="w-full px-4 py-3 text-lg text-center tracking-widest uppercase border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    onKeyDown={(e) => e.key === 'Enter' && !searching && searchTest()}
                    aria-describedby="testCodeHelp"
                  />
                  <p id="testCodeHelp" className="text-xs text-gray-500 mt-1">Example: abc123</p>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-center">
                      <svg className="w-5 h-5 text-red-400 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                      <span className="text-red-800 text-sm">{error}</span>
                    </div>
                  </div>
                )}

                <button
                  onClick={searchTest}
                  disabled={searching || !testCode.trim()}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-4 px-6 rounded-xl transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
                  aria-label="Search for test"
                >
                  {searching ? 'Searching...' : 'Find Test'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-center mb-8">
                <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Test Found!</h2>
                <p className="text-gray-600">Review the test details before starting</p>
              </div>

              <div className="bg-gray-50 rounded-xl p-6 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-500">Test Title</label>
                    <p className="font-semibold text-gray-900">{testInfo.title}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Test Code</label>
                    <p className="font-semibold text-gray-900 uppercase">{testInfo.test_code}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Questions</label>
                    <p className="font-semibold text-gray-900">{testInfo.total_questions} questions</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Time Limit</label>
                    <p className="font-semibold text-gray-900">{testInfo.time_limit} minutes</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">Created By</label>
                    <p className="font-semibold text-gray-900">{testInfo.creator_name}</p>
                  </div>
                </div>
                {testInfo.description && (
                  <div className="mt-4">
                    <label className="text-sm text-gray-500">Description</label>
                    <p className="text-gray-900 mt-1">{testInfo.description}</p>
                  </div>
                )}
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-yellow-600 mr-2 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <h3 className="text-sm font-medium text-yellow-800">Important Instructions</h3>
                    <ul className="text-sm text-yellow-700 mt-1 space-y-1">
                      <li>• You have only one attempt for this test</li>
                      <li>• The timer will start once you begin the test</li>
                      <li>• Make sure you have a stable internet connection</li>
                      <li>• Do not refresh the page during the test</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setTestInfo(null)
                    setTestCode('')
                    setError('')
                  }}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-6 rounded-lg"
                  aria-label="Search for another test"
                >
                  ← Search Again
                </button>
                <button
                  onClick={startTest}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg shadow-lg hover:shadow-xl"
                  aria-label="Start the test"
                >
                  Start Test →
                </button>
              </div>
            </>
          )}
        </div>

        {/* Back to Home */}
        <div className="text-center mt-8">
          <Link href="/" className="text-indigo-600 hover:text-indigo-800 font-medium">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}