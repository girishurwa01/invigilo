'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/app/lib/supabase'
import * as XLSX from 'xlsx'

interface Test {
  id: string
  test_code: string
  title: string
  description: string | null
  time_limit: number
  total_questions: number
  is_active: boolean
  show_results: boolean
  created_at: string
  updated_at: string
}

interface Attempt {
  id: string
  test_id: string
  user_id: string
  score: number
  total_questions: number
  total_points: number
  time_taken: number | null
  completed_at: string | null
  user: {
    full_name: string | null
    email: string
  }
  tests: {
    title: string
    test_code: string
    time_limit: number
    total_questions: number
  }
}

// Define the exact structure that Supabase returns
interface SupabaseAttemptResponse {
  id: string
  test_id: string
  user_id: string
  score: number
  total_questions: number
  time_taken: number | null
  completed_at: string | null
  profiles: {
    full_name: string | null
    email: string
  }[] // Supabase returns this as an array
  tests: {
    title: string
    test_code: string
    time_limit: number
    total_questions: number
  }[] // Supabase returns this as an array
}

export default function ViewMarksPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [tests, setTests] = useState<Test[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [activeTab, setActiveTab] = useState<'tests' | 'attempts'>('tests')
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'score-desc' | 'name-asc' | 'date-desc'>('score-desc')
  const [showLeaderboard, setShowLeaderboard] = useState<boolean>(false)
  const router = useRouter()

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        router.push('/login')
        return
      }
      setUser(session.user)
      await Promise.all([
        fetchTests(session.user.id),
        fetchAttempts(session.user.id)
      ])
      setLoading(false)
    }

    getSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!session?.user) {
          router.push('/login')
        } else {
          setUser(session.user)
          await Promise.all([
            fetchTests(session.user.id),
            fetchAttempts(session.user.id)
          ])
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [router])

  const fetchTests = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('tests')
        .select('*')
        .eq('created_by', userId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setTests(data || [])
    } catch (error) {
      console.error('Error fetching tests:', error)
      setError('Failed to load tests')
    }
  }

  const fetchAttempts = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('test_attempts')
        .select(`
          id,
          test_id,
          user_id,
          score,
          total_questions,
          time_taken,
          completed_at,
          profiles!test_attempts_user_id_fkey (
            full_name,
            email
          ),
          tests!test_attempts_test_id_fkey (
            title,
            test_code,
            time_limit,
            total_questions
          )
        `)
        .eq('tests.created_by', userId)
        .order('completed_at', { ascending: false })

      if (error) throw error

      // Get total points for each test by summing question points
      const testIds = [...new Set((data || []).map((attempt: SupabaseAttemptResponse) => attempt.test_id))]
      const testPointsMap = new Map<string, number>()

      for (const testId of testIds) {
        const { data: questionsData, error: questionsError } = await supabase
          .from('questions')
          .select('points')
          .eq('test_id', testId)

        if (!questionsError && questionsData) {
          const totalPoints = questionsData.reduce((sum, q) => sum + q.points, 0)
          testPointsMap.set(testId, totalPoints)
        }
      }

      // Transform the data to match the Attempt interface
      const transformedData: Attempt[] = (data || []).map((attempt: SupabaseAttemptResponse) => ({
        id: attempt.id,
        test_id: attempt.test_id,
        user_id: attempt.user_id,
        score: attempt.score,
        total_questions: attempt.total_questions,
        total_points: testPointsMap.get(attempt.test_id) || attempt.total_questions,
        time_taken: attempt.time_taken,
        completed_at: attempt.completed_at,
        user: {
          full_name: attempt.profiles?.[0]?.full_name || null,
          email: attempt.profiles?.[0]?.email || ''
        },
        tests: {
          title: attempt.tests?.[0]?.title || '',
          test_code: attempt.tests?.[0]?.test_code || '',
          time_limit: attempt.tests?.[0]?.time_limit || 0,
          total_questions: attempt.tests?.[0]?.total_questions || 0
        }
      }))

      setAttempts(transformedData)
    } catch (error) {
      console.error('Error fetching attempts:', error)
      setError('Failed to load test attempts')
    }
  }

  const deleteTest = async (testId: string) => {
    if (!confirm('Are you sure you want to delete this test? This action cannot be undone.')) {
      return
    }

    try {
      const { error } = await supabase
        .from('tests')
        .delete()
        .eq('id', testId)
        .eq('created_by', user?.id)

      if (error) throw error

      setTests(tests.filter(test => test.id !== testId))
      alert('Test deleted successfully!')
    } catch (error) {
      console.error('Error deleting test:', error)
      alert('Error deleting test. Please try again.')
    }
  }

  const toggleTestStatus = async (testId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('tests')
        .update({ is_active: !currentStatus })
        .eq('id', testId)
        .eq('created_by', user?.id)

      if (error) throw error

      setTests(tests.map(test => 
        test.id === testId 
          ? { ...test, is_active: !currentStatus }
          : test
      ))
    } catch (error) {
      console.error('Error updating test status:', error)
      alert('Error updating test status. Please try again.')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const calculatePercentage = (score: number, totalPoints: number) => {
    if (totalPoints === 0) return '0.0'
    return ((score / totalPoints) * 100).toFixed(1)
  }

  // Get attempts for selected test only
  const selectedTestAttempts = useMemo(() => {
    if (!selectedTestId) return []
    return attempts.filter(attempt => attempt.test_id === selectedTestId)
  }, [attempts, selectedTestId])

  // Get selected test details
  const selectedTest = useMemo(() => {
    if (!selectedTestId) return null
    return tests.find(test => test.id === selectedTestId) || null
  }, [tests, selectedTestId])

  const sortAttempts = (atts: Attempt[]) => {
    return [...atts].sort((a, b) => {
      if (sortBy === 'score-desc') {
        return b.score - a.score;
      }
      if (sortBy === 'name-asc') {
        return (a.user.full_name || a.user.email).localeCompare(b.user.full_name || b.user.email);
      }
      if (sortBy === 'date-desc') {
        const aTime = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        const bTime = b.completed_at ? new Date(b.completed_at).getTime() : 0;
        return bTime - aTime;
      }
      return 0;
    });
  };

  const getLeaderboard = (atts: Attempt[]) => {
    const completed = atts.filter((a) => a.completed_at !== null);
    const sorted = [...completed].sort((a, b) => b.score - a.score);
    return sorted.slice(0, 3);
  };

  const downloadResults = (testAttempts: Attempt[], testTitle: string) => {
    // Sort the attempts according to current sort preference before exporting
    const sortedAttempts = sortAttempts(testAttempts);
    
    const data = sortedAttempts.map((a) => ({
      Name: a.user.full_name || 'Anonymous',
      Email: a.user.email,
      Score: `${a.score} / ${a.total_points}`,
      Percentage: `${calculatePercentage(a.score, a.total_points)}%`,
      'Time Taken': a.time_taken ? `${a.time_taken} min` : 'N/A',
      'Completed At': a.completed_at ? formatDate(a.completed_at) : 'In Progress',
    }));
    
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Results');
    XLSX.writeFile(wb, `${testTitle.replace(/\s+/g, '_')}_results.xlsx`);
  };

  // Get tests with attempt counts
  const testsWithAttempts = useMemo(() => {
    return tests.map(test => ({
      ...test,
      attemptCount: attempts.filter(attempt => attempt.test_id === test.id).length
    }))
  }, [tests, attempts])

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
              <span className="text-gray-700">
                Welcome, {user?.user_metadata?.full_name || user?.email}
              </span>
              <button
                onClick={() => supabase.auth.signOut()}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
          <p className="text-gray-600">Manage your tests and view student results</p>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="bg-white rounded-xl shadow-lg mb-8">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex">
              <button
                onClick={() => {
                  setActiveTab('tests')
                  setSelectedTestId(null)
                }}
                className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'tests'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                My Tests ({tests.length})
              </button>
              <button
                onClick={() => {
                  setActiveTab('attempts')
                  setSelectedTestId(null)
                }}
                className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'attempts'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                View Results ({attempts.length} total attempts)
              </button>
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'tests' ? (
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold text-gray-900">Your Tests</h2>
                  <Link href="/create-test">
                    <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors">
                      + Create New Test
                    </button>
                  </Link>
                </div>

                {tests.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-gray-500 mb-4">No tests created yet</div>
                    <Link href="/create-test">
                      <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg transition-colors">
                        Create Your First Test
                      </button>
                    </Link>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Test Details
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Code
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Questions
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Time Limit
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Created
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {tests.map((test) => (
                          <tr key={test.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div>
                                <div className="text-sm font-medium text-gray-900">{test.title}</div>
                                {test.description && (
                                  <div className="text-sm text-gray-500">{test.description}</div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                                {test.test_code}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {test.total_questions}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {test.time_limit} min
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <button
                                  onClick={() => toggleTestStatus(test.id, test.is_active)}
                                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                                    test.is_active ? 'bg-indigo-600' : 'bg-gray-200'
                                  }`}
                                  role="switch"
                                  aria-checked={test.is_active}
                                >
                                  <span
                                    aria-hidden="true"
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                      test.is_active ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                                  />
                                </button>
                                <span className={`ml-3 text-sm font-medium ${
                                  test.is_active ? 'text-green-800' : 'text-gray-500'
                                }`}>
                                  {test.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {formatDate(test.created_at)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex space-x-2">
                                <Link href={`/edit-test/${test.id}`}>
                                  <button className="text-indigo-600 hover:text-indigo-900 transition-colors">
                                    Edit
                                  </button>
                                </Link>
                                <button
                                  onClick={() => deleteTest(test.id)}
                                  className="text-red-600 hover:text-red-900 transition-colors"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div>
                {!selectedTestId ? (
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 mb-6">Select a Test to View Results</h2>
                    
                    {testsWithAttempts.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="text-gray-500">No tests available</div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {testsWithAttempts.map((test) => (
                          <div
                            key={test.id}
                            onClick={() => setSelectedTestId(test.id)}
                            className="bg-white p-6 rounded-lg shadow-md border hover:shadow-lg cursor-pointer transition-shadow"
                          >
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">{test.title}</h3>
                            <p className="text-sm text-gray-600 mb-4">{test.description || 'No description'}</p>
                            <div className="flex justify-between items-center">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                                {test.test_code}
                              </span>
                              <span className="text-sm text-gray-500">
                                {test.attemptCount} attempt{test.attemptCount !== 1 ? 's' : ''}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    {/* Back button and test info */}
                    <div className="flex items-center mb-6">
                      <button
                        onClick={() => setSelectedTestId(null)}
                        className="mr-4 text-indigo-600 hover:text-indigo-800 transition-colors"
                      >
                        ← Back to Tests
                      </button>
                      <div>
                        <h2 className="text-xl font-semibold text-gray-900">
                          {selectedTest?.title} Results
                        </h2>
                        <p className="text-sm text-gray-600">Code: {selectedTest?.test_code}</p>
                      </div>
                    </div>

                    {selectedTestAttempts.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="text-gray-500">No attempts for this test yet</div>
                      </div>
                    ) : (
                      <div>
                        {/* Controls */}
                        <div className="flex justify-between items-center mb-6">
                          <div className="flex items-center space-x-4">
                            <label htmlFor="sortBy" className="text-sm font-medium text-gray-700">
                              Sort by:
                            </label>
                            <select
                              id="sortBy"
                              value={sortBy}
                              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                              className="border-gray-300 rounded-md shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-gray-900 bg-white"
                            >
                              <option value="score-desc">Marks (High to Low)</option>
                              <option value="name-asc">Name (A-Z)</option>
                              <option value="date-desc">Date (Recent First)</option>
                            </select>
                          </div>
                          
                          <div className="flex space-x-2">
                            <button
                              onClick={() => setShowLeaderboard(!showLeaderboard)}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                            >
                              {showLeaderboard ? 'Hide Leaderboard' : 'Show Leaderboard'}
                            </button>
                            <button
                              onClick={() => downloadResults(selectedTestAttempts, selectedTest?.title || 'Test')}
                              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors"
                            >
                              Download Results
                            </button>
                          </div>
                        </div>

                        {/* Leaderboard */}
                        {showLeaderboard && (
                          <div className="bg-gray-50 p-4 rounded-lg mb-6">
                            <h4 className="text-md font-semibold text-gray-900 mb-4">🏆 Leaderboard</h4>
                            {(() => {
                              const leaderboard = getLeaderboard(selectedTestAttempts);
                              const medals = ['🥇', '🥈', '🥉'];
                              
                              return leaderboard.length > 0 ? (
                                <ul className="space-y-2">
                                  {leaderboard.map((top, index) => (
                                    <li key={top.id} className="flex items-center space-x-4">
                                      <span className="text-2xl">{medals[index]}</span>
                                      <div>
                                        <div className="font-medium text-gray-900">
                                          {top.user.full_name || 'Anonymous'} ({top.user.email})
                                        </div>
                                        <div className="text-sm text-gray-600">
                                          Score: {top.score} / {top.total_points} ({calculatePercentage(top.score, top.total_points)}%)
                                        </div>
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <div className="text-gray-500">No completed attempts yet</div>
                              );
                            })()}
                          </div>
                        )}

                        {/* Results Table */}
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Student
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Score
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Percentage
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Time Taken
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                  Completed At
                                </th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {sortAttempts(selectedTestAttempts).map((attempt) => (
                                <tr key={attempt.id} className="hover:bg-gray-50">
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <div>
                                      <div className="text-sm font-medium text-gray-900">
                                        {attempt.user.full_name || 'Anonymous'}
                                      </div>
                                      <div className="text-sm text-gray-500">{attempt.user.email}</div>
                                    </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {attempt.score} / {attempt.total_points}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                      parseFloat(calculatePercentage(attempt.score, attempt.total_points)) >= 70
                                        ? 'bg-green-100 text-green-800'
                                        : parseFloat(calculatePercentage(attempt.score, attempt.total_points)) >= 50
                                        ? 'bg-yellow-100 text-yellow-800'
                                        : 'bg-red-100 text-red-800'
                                    }`}>
                                      {calculatePercentage(attempt.score, attempt.total_points)}%
                                    </span>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    {attempt.time_taken ? `${attempt.time_taken} min` : 'N/A'}
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {attempt.completed_at ? formatDate(attempt.completed_at) : 'In Progress'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}