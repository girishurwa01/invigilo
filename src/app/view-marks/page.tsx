'use client'

import { useState, useEffect, useMemo, useCallback, memo } from 'react'
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
  test_type: string
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
  started_at: string
  user: {
    full_name: string | null
    email: string
  }
  tests: {
    title: string
    test_code: string
    time_limit: number
    total_questions: number
    test_type: string
  }
}

interface StudentAttempt {
  id: string
  test_id: string
  score: number
  total_points: number
  time_taken: number | null
  completed_at: string | null
  started_at: string
  test: {
    id: string
    title: string
    test_code: string
    show_results: boolean
    created_by: string
    created_by_name: string
    test_type: string
  }
}

type SortOption = 'score-desc' | 'name-asc' | 'date-desc'

// Loading skeleton components
const TableSkeleton = memo(({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) => (
  <div className="overflow-x-auto">
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          {Array.from({ length: cols }).map((_, i) => (
            <th key={i} className="px-6 py-3">
              <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {Array.from({ length: rows }).map((_, i) => (
          <tr key={i}>
            {Array.from({ length: cols }).map((_, j) => (
              <td key={j} className="px-6 py-4">
                <div className="h-4 bg-gray-100 rounded animate-pulse"></div>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
))

TableSkeleton.displayName = 'TableSkeleton'

const CardSkeleton = memo(({ count = 3 }: { count?: number }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="p-6 rounded-lg shadow-md border">
        <div className="h-6 bg-gray-200 rounded mb-2 animate-pulse"></div>
        <div className="h-4 bg-gray-100 rounded animate-pulse"></div>
      </div>
    ))}
  </div>
))

CardSkeleton.displayName = 'CardSkeleton'

// Memoized components
const TestRow = memo(({ test, onToggleStatus, onDelete, attemptCount }: {
  test: Test & { attemptCount: number }
  onToggleStatus: (id: string, status: boolean) => void
  onDelete: (id: string) => void
  attemptCount: number
}) => {
  const formatDate = useCallback((dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  }, [])

  const getTestTypeColor = useCallback((testType: string) => 
    testType === 'mcq' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800', [])

  const getTestTypeLabel = useCallback((testType: string) => 
    testType === 'mcq' ? 'MCQ' : 'Coding', [])

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm font-medium text-gray-900">{test.title}</div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className="px-2 py-1 text-xs rounded-full bg-indigo-100 text-indigo-800">
          {test.test_code}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span className={`px-2 py-1 text-xs rounded-full ${getTestTypeColor(test.test_type)}`}>
          {getTestTypeLabel(test.test_type)}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{test.total_questions}</td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{test.time_limit} min</td>
      <td className="px-6 py-4 whitespace-nowrap">
        <button 
          onClick={() => onToggleStatus(test.id, test.is_active)} 
          className={`text-sm font-medium ${test.is_active ? 'text-green-600' : 'text-gray-500'}`}
        >
          {test.is_active ? 'Active' : 'Inactive'}
        </button>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{attemptCount}</td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(test.created_at)}</td>
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-3">
        <Link href={`/edit-test/${test.id}`} className="text-indigo-600 hover:text-indigo-900">Edit</Link>
        <button onClick={() => onDelete(test.id)} className="text-red-600 hover:text-red-900">Delete</button>
      </td>
    </tr>
  )
})

TestRow.displayName = 'TestRow'

const AttemptRow = memo(({ attempt, calculatePercentage, formatDate }: {
  attempt: Attempt
  calculatePercentage: (score: number, total: number) => string
  formatDate: (date: string | null) => string
}) => (
  <tr className="hover:bg-gray-50">
    <td className="px-6 py-4 whitespace-nowrap">
      <div className="text-sm font-medium text-gray-900">{attempt.user.full_name || 'Anonymous'}</div>
      <div className="text-sm text-gray-500">{attempt.user.email}</div>
    </td>
    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{attempt.score} / {attempt.total_points}</td>
    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{calculatePercentage(attempt.score, attempt.total_points)}%</td>
    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{attempt.time_taken ? `${attempt.time_taken} min` : 'N/A'}</td>
    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
      {attempt.completed_at ? formatDate(attempt.completed_at) : <span className="text-yellow-600">In Progress</span>}
    </td>
  </tr>
))

AttemptRow.displayName = 'AttemptRow'

export default function ViewMarksPage() {
  const [user, setUser] = useState<User | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [testsLoading, setTestsLoading] = useState(false)
  const [attemptsLoading, setAttemptsLoading] = useState(false)
  const [studentAttemptsLoading, setStudentAttemptsLoading] = useState(false)
  
  const [tests, setTests] = useState<Test[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [studentAttempts, setStudentAttempts] = useState<StudentAttempt[]>([])
  const [activeTab, setActiveTab] = useState<'tests' | 'attempts' | 'my-attempts'>('tests')
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<SortOption>('score-desc')
  const router = useRouter()

  // Cache for total points to avoid recalculation
  const [totalPointsCache, setTotalPointsCache] = useState<Map<string, number>>(new Map())

  // Optimized function to calculate total points for multiple tests at once
  const calculateTotalPointsForTests = useCallback(async (testIds: string[]): Promise<Map<string, number>> => {
    // Check cache first
    const uncachedIds = testIds.filter(id => !totalPointsCache.has(id))
    
    if (uncachedIds.length === 0) {
      return new Map([...Array.from(totalPointsCache.entries()).filter(([id]) => testIds.includes(id))])
    }

    const newCache = new Map(totalPointsCache)
    
    // Initialize with 0 for uncached tests
    uncachedIds.forEach(id => newCache.set(id, 0))

    try {
      // Batch fetch all points data
      const [mcqData, codingData] = await Promise.all([
        supabase.from('questions').select('test_id, points').in('test_id', uncachedIds),
        supabase.from('coding_questions').select('test_id, points').in('test_id', uncachedIds)
      ])

      // Process MCQ points
      mcqData.data?.forEach(q => {
        const current = newCache.get(q.test_id) || 0
        newCache.set(q.test_id, current + (q.points || 1))
      })

      // Process coding points  
      codingData.data?.forEach(q => {
        const current = newCache.get(q.test_id) || 0
        newCache.set(q.test_id, current + (q.points || 5))
      })

      setTotalPointsCache(newCache)
      return new Map([...Array.from(newCache.entries()).filter(([id]) => testIds.includes(id))])
    } catch (err) {
      console.error('Error calculating total points:', err)
      return newCache
    }
  }, [totalPointsCache])

  const loadTeacherAttempts = useCallback(async (userId: string, testIds: string[]) => {
    try {
      setAttemptsLoading(true)
      
      const { data: attemptData, error: attemptError } = await supabase
        .from('test_attempts')
        .select(`
          *,
          profiles!inner (full_name, email),
          tests!inner (title, test_code, time_limit, total_questions, test_type, created_by)
        `)
        .eq('tests.created_by', userId)
        .order('started_at', { ascending: false })

      if (attemptError) throw attemptError

      if (!attemptData || attemptData.length === 0) {
        setAttempts([])
        return
      }

      const totalPointsMap = await calculateTotalPointsForTests(testIds)

      const transformedAttempts: Attempt[] = attemptData.map(attempt => {
        const totalPoints = totalPointsMap.get(attempt.test_id) || 0
        
        return {
          id: attempt.id,
          test_id: attempt.test_id,
          user_id: attempt.user_id,
          score: attempt.score,
          total_questions: attempt.total_questions,
          total_points: totalPoints > 0 ? totalPoints : attempt.total_questions,
          time_taken: attempt.time_taken,
          completed_at: attempt.completed_at,
          started_at: attempt.started_at,
          user: {
            full_name: attempt.profiles?.full_name || null,
            email: attempt.profiles?.email || 'Unknown'
          },
          tests: {
            title: attempt.tests?.title || 'Unknown Test',
            test_code: attempt.tests?.test_code || 'N/A',
            time_limit: attempt.tests?.time_limit || 0,
            total_questions: attempt.tests?.total_questions || 0,
            test_type: attempt.tests?.test_type || 'mcq'
          }
        }
      })
      setAttempts(transformedAttempts)
    } catch (err) {
      console.error('Error loading attempts:', err)
      setError('Failed to load attempts data.')
    } finally {
      setAttemptsLoading(false)
    }
  }, [calculateTotalPointsForTests])

  const loadTeacherTests = useCallback(async (userId: string) => {
    try {
      setTestsLoading(true)
      setError(null)
      
      const { data: testsData, error: testsError } = await supabase
        .from('tests')
        .select('*')
        .eq('created_by', userId)
        .order('created_at', { ascending: false })

      if (testsError) throw testsError
      setTests(testsData || [])
      
      // Load attempts after tests are loaded
      if (testsData && testsData.length > 0) {
        loadTeacherAttempts(userId, testsData.map(t => t.id))
      }
      
    } catch (err) {
      console.error('Error loading tests:', err)
      setError('Failed to load tests. Please refresh the page.')
    } finally {
      setTestsLoading(false)
    }
  }, [loadTeacherAttempts])

  const loadStudentAttempts = useCallback(async (userId: string) => {
    try {
      setStudentAttemptsLoading(true)
      
      const { data: attemptData, error: attemptError } = await supabase
        .from('test_attempts')
        .select(`
          *,
          tests (
            id, title, test_code, show_results, created_by, test_type,
            profiles (full_name, email)
          )
        `)
        .eq('user_id', userId)
        .order('started_at', { ascending: false })

      if (attemptError) throw attemptError
      
      if (!attemptData || attemptData.length === 0) {
        setStudentAttempts([])
        return
      }

      const testIds = [...new Set(attemptData.map(a => a.test_id))]
      const totalPointsMap = await calculateTotalPointsForTests(testIds)

      const transformedAttempts: StudentAttempt[] = attemptData.map(attempt => {
        const totalPoints = totalPointsMap.get(attempt.test_id) || 0
        return {
          id: attempt.id,
          test_id: attempt.test_id,
          score: attempt.score,
          total_points: totalPoints > 0 ? totalPoints : attempt.total_questions,
          time_taken: attempt.time_taken,
          completed_at: attempt.completed_at,
          started_at: attempt.started_at,
          test: {
            id: attempt.tests?.id || attempt.test_id,
            title: attempt.tests?.title || 'Unknown Test',
            test_code: attempt.tests?.test_code || 'N/A',
            show_results: attempt.tests?.show_results ?? false,
            created_by: attempt.tests?.created_by || '',
            created_by_name: attempt.tests?.profiles?.full_name || 'Unknown',
            test_type: attempt.tests?.test_type || 'mcq'
          }
        }
      })
      setStudentAttempts(transformedAttempts)
    } catch (err) {
      console.error('Error loading student attempts:', err)
      setError('Failed to load your test attempts')
    } finally {
      setStudentAttemptsLoading(false)
    }
  }, [calculateTotalPointsForTests])

  const loadInitialData = useCallback(async (userId: string) => {
    // Load tests first (usually fastest and most important)
    loadTeacherTests(userId)
    // Load other data in parallel but don't block UI
    loadStudentAttempts(userId)
  }, [loadTeacherTests, loadStudentAttempts])

  // Fast session check and UI render
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        router.push('/login')
        return
      }
      setUser(session.user)
      setInitialLoading(false)
      
      // Start loading data in background after UI is shown
      loadInitialData(session.user.id)
    }
    checkSession()
  }, [router, loadInitialData])

  const deleteTest = useCallback(async (testId: string) => {
    if (!confirm('Are you sure you want to delete this test? This action cannot be undone.')) return

    try {
      const { error: deleteError } = await supabase.from('tests').delete().eq('id', testId).eq('created_by', user?.id)
      if (deleteError) throw deleteError
      setTests(prev => prev.filter(test => test.id !== testId))
      setAttempts(prev => prev.filter(attempt => attempt.test_id !== testId))
      if (selectedTestId === testId) setSelectedTestId(null)
      alert('Test deleted successfully!')
    } catch (err) {
      console.error('Error deleting test:', err)
      alert('Error deleting test. Please try again.')
    }
  }, [user?.id, selectedTestId])

  const toggleTestStatus = useCallback(async (testId: string, currentStatus: boolean) => {
    try {
      const { error: updateError } = await supabase.from('tests').update({ is_active: !currentStatus }).eq('id', testId).eq('created_by', user?.id)
      if (updateError) throw updateError
      setTests(prev => prev.map(test => test.id === testId ? { ...test, is_active: !currentStatus } : test))
    } catch (err) {
      console.error('Error updating test status:', err)
      alert('Error updating test status. Please try again.')
    }
  }, [user?.id])

  const formatDate = useCallback((dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  }, [])

  const calculatePercentage = useCallback((score: number, totalPoints: number) => {
    if (!totalPoints || totalPoints === 0) return '0.0'
    return ((score / totalPoints) * 100).toFixed(1)
  }, [])

  const selectedTestAttempts = useMemo(() => {
    if (!selectedTestId) return []
    return attempts.filter(attempt => attempt.test_id === selectedTestId)
  }, [attempts, selectedTestId])

  const selectedTest = useMemo(() => {
    return tests.find(test => test.id === selectedTestId) || null
  }, [tests, selectedTestId])

  const sortAttempts = useCallback((atts: Attempt[]) => {
    return [...atts].sort((a, b) => {
      if (sortBy === 'score-desc') return b.score - a.score
      if (sortBy === 'name-asc') return (a.user.full_name || a.user.email).localeCompare(b.user.full_name || b.user.email)
      if (sortBy === 'date-desc') {
        const aTime = a.completed_at ? new Date(a.completed_at).getTime() : 0
        const bTime = b.completed_at ? new Date(b.completed_at).getTime() : 0
        return bTime - aTime
      }
      return 0
    })
  }, [sortBy])

  const sortedSelectedTestAttempts = useMemo(() => {
    return sortAttempts(selectedTestAttempts)
  }, [selectedTestAttempts, sortAttempts])

  const downloadResults = useCallback((testAttempts: Attempt[], testTitle: string) => {
    const data = sortAttempts(testAttempts).map(a => ({
      Name: a.user.full_name || 'Anonymous',
      Email: a.user.email,
      Score: `${a.score} / ${a.total_points}`,
      Percentage: `${calculatePercentage(a.score, a.total_points)}%`,
      'Time Taken (min)': a.time_taken ?? 'N/A',
      'Completed At': formatDate(a.completed_at),
      'Test Type': a.tests.test_type
    }))
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Results')
    XLSX.writeFile(wb, `${testTitle.replace(/\s+/g, '_')}_results.xlsx`)
  }, [sortAttempts, calculatePercentage, formatDate])

  // Optimized tests with attempt counts using Map for O(1) lookup
  const testsWithAttempts = useMemo(() => {
    const attemptCountMap = new Map<string, number>()
    attempts.forEach(attempt => {
      attemptCountMap.set(attempt.test_id, (attemptCountMap.get(attempt.test_id) || 0) + 1)
    })
    
    return tests.map(test => ({
      ...test,
      attemptCount: attemptCountMap.get(test.id) || 0
    }))
  }, [tests, attempts])

  const handleTabChange = useCallback((tab: 'tests' | 'attempts' | 'my-attempts') => {
    setActiveTab(tab)
    setSelectedTestId(null)
  }, [])

  const handleTestSelect = useCallback((testId: string) => {
    setSelectedTestId(testId)
  }, [])

  // Show initial loading only for auth check
  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Setting up your dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      <div className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold text-indigo-600">Invigilo</Link>
          <div className="flex items-center space-x-4">
            <span className="text-gray-700">Welcome, {user?.user_metadata?.full_name || user?.email}</span>
            <button onClick={() => supabase.auth.signOut()} className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg">
              Sign Out
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        </div>

        {error && <div className="mb-6 bg-red-100 text-red-700 p-3 rounded-lg">{error}</div>}

        <div className="bg-white rounded-xl shadow-lg mb-8">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex">
              {(['tests', 'attempts', 'my-attempts'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => handleTabChange(tab)}
                  className={`py-4 px-6 text-sm font-medium border-b-2 ${
                    activeTab === tab
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab === 'tests' && `My Tests (${testsLoading ? '...' : tests.length})`}
                  {tab === 'attempts' && `View Results (${attemptsLoading ? '...' : attempts.length})`}
                  {tab === 'my-attempts' && `My Attempts (${studentAttemptsLoading ? '...' : studentAttempts.length})`}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'tests' && (
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold text-gray-900">Your Tests</h2>
                  <Link href="/create-test">
                    <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg">+ Create New Test</button>
                  </Link>
                </div>
                
                {testsLoading ? (
                  <TableSkeleton rows={3} cols={9} />
                ) : tests.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">No tests created yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {['Test', 'Code', 'Type', 'Questions', 'Time', 'Status', 'Attempts', 'Created', 'Actions'].map(header => (
                            <th key={header} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{header}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {testsWithAttempts.map((test) => (
                          <TestRow 
                            key={test.id} 
                            test={test} 
                            onToggleStatus={toggleTestStatus}
                            onDelete={deleteTest}
                            attemptCount={test.attemptCount}
                          />
                        ))}
                      </tbody>
                    </table>
                    {attemptsLoading && (
                      <div className="text-center py-2 text-sm text-gray-500">
                        <div className="inline-flex items-center">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600 mr-2"></div>
                          Loading attempt counts...
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            
            {activeTab === 'my-attempts' && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-6">My Test Attempts</h2>
                
                {studentAttemptsLoading ? (
                  <div className="space-y-6">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="bg-white border border-gray-200 rounded-lg p-6">
                        <div className="animate-pulse">
                          <div className="h-6 bg-gray-200 rounded mb-2"></div>
                          <div className="h-4 bg-gray-100 rounded mb-4"></div>
                          <div className="h-4 bg-gray-100 rounded w-1/3"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : studentAttempts.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">You haven&apos;t attempted any tests yet.</div>
                ) : (
                  <div className="space-y-6">
                    {studentAttempts.map((attempt) => (
                      <div key={attempt.id} className="bg-white border border-gray-200 rounded-lg p-6">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900">{attempt.test.title}</h3>
                            <div className="text-sm text-gray-600 mt-1">Code: {attempt.test.test_code} • By: {attempt.test.created_by_name}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-gray-900">{attempt.score} / {attempt.total_points}</div>
                            <div className="text-sm font-medium text-gray-800">{calculatePercentage(attempt.score, attempt.total_points)}%</div>
                          </div>
                        </div>
                        <div className="text-sm text-gray-500 mt-2">
                          Status: <span className={attempt.completed_at ? 'text-green-600' : 'text-yellow-600'}>
                            {attempt.completed_at ? `Completed on ${formatDate(attempt.completed_at)}` : 'In Progress'}
                          </span>
                        </div>
                        {attempt.test.show_results && attempt.completed_at && (
                          <div className="mt-4">
                            <Link href={`/test-results/${attempt.id}`}>
                              <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm">View Detailed Results</button>
                            </Link>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'attempts' && (
              <div>
                {!selectedTestId ? (
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 mb-6">Select a Test to View Results</h2>
                    {testsLoading ? (
                      <CardSkeleton count={6} />
                    ) : testsWithAttempts.length === 0 ? (
                      <div className="text-center py-12 text-gray-500">No tests available.</div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {testsWithAttempts.map((test) => (
                          <div key={test.id} onClick={() => test.attemptCount > 0 && handleTestSelect(test.id)} 
                               className={`p-6 rounded-lg shadow-md border ${test.attemptCount > 0 ? 'hover:shadow-lg cursor-pointer' : 'opacity-60'}`}>
                            <h3 className="text-lg font-semibold text-gray-900">{test.title}</h3>
                            <p className="text-sm text-gray-600">
                              {attemptsLoading ? (
                                <span className="inline-flex items-center">
                                  <div className="animate-spin rounded-full h-3 w-3 border-b border-gray-400 mr-1"></div>
                                  Loading...
                                </span>
                              ) : (
                                `${test.attemptCount} attempt${test.attemptCount !== 1 ? 's' : ''}`
                              )}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center mb-6">
                      <button onClick={() => setSelectedTestId(null)} className="mr-4 text-indigo-600 hover:text-indigo-800">← Back</button>
                      <h2 className="text-xl font-semibold text-gray-900">{selectedTest?.title} Results</h2>
                    </div>
                    {selectedTestAttempts.length === 0 ? (
                      <div className="text-center py-12 text-gray-500">No attempts for this test yet.</div>
                    ) : (
                      <div>
                        <div className="flex justify-between items-center mb-6">
                          <select 
                            value={sortBy} 
                            onChange={(e) => setSortBy(e.target.value as SortOption)} 
                            className="border-gray-300 rounded-md bg-white text-gray-900"
                          >
                            <option value="score-desc">Sort by Marks</option>
                            <option value="name-asc">Sort by Name</option>
                            <option value="date-desc">Sort by Date</option>
                          </select>
                          <button onClick={() => downloadResults(selectedTestAttempts, selectedTest?.title || 'Test')} 
                                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg">Download Results</button>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                              <tr>
                                {['Student', 'Score', 'Percentage', 'Time Taken', 'Completed At'].map(header => (
                                  <th key={header} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{header}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                              {sortedSelectedTestAttempts.map((attempt) => (
                                <AttemptRow 
                                  key={attempt.id} 
                                  attempt={attempt}
                                  calculatePercentage={calculatePercentage}
                                  formatDate={formatDate}
                                />
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