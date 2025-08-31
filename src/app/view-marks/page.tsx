'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
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

interface LeaderboardEntry {
  id: string
  user_id: string
  score: number
  total_questions: number
  total_points: number
  completed_at: string
  profiles: {
    full_name: string | null
    email: string
  }
  rank: number
  percentage: string
  isCurrentUser: boolean
}

export default function ViewMarksPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [tests, setTests] = useState<Test[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [studentAttempts, setStudentAttempts] = useState<StudentAttempt[]>([])
  const [activeTab, setActiveTab] = useState<'tests' | 'attempts' | 'my-attempts'>('tests')
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'score-desc' | 'name-asc' | 'date-desc'>('score-desc')
  const [showLeaderboard, setShowLeaderboard] = useState<boolean>(false)
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([])
  const router = useRouter()

  const loadAllData = useCallback(async (userId: string) => {
    try {
      setError(null)
      
      // Step 1: Load user's tests
      const { data: testsData, error: testsError } = await supabase
        .from('tests')
        .select('*')
        .eq('created_by', userId)
        .order('created_at', { ascending: false })

      if (testsError) throw testsError
      
      setTests(testsData || [])

      if (!testsData || testsData.length === 0) {
        setAttempts([])
        return
      }

      const userTestIds = testsData.map(test => test.id)

      // Step 2: Get all attempts for user's tests
      const { data: attemptData, error: attemptError } = await supabase
        .from('test_attempts')
        .select('*')
        .in('test_id', userTestIds)
        .order('started_at', { ascending: false })

      if (attemptError) throw attemptError

      if (!attemptData || attemptData.length === 0) {
        setAttempts([])
        return
      }

      // Step 3: Get user profiles for attempt makers
      const userIds = [...new Set(attemptData.map(attempt => attempt.user_id))]
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)

      if (profilesError) throw profilesError

      // Step 4: Get total points for each test (MCQ questions)
      const { data: mcqQuestionsData, error: mcqQuestionsError } = await supabase
        .from('questions')
        .select('test_id, points')
        .in('test_id', userTestIds)

      if (mcqQuestionsError) throw mcqQuestionsError

      // Step 5: Get total points for each test (Coding questions)
      const { data: codingQuestionsData, error: codingQuestionsError } = await supabase
        .from('coding_questions')
        .select('test_id, points')
        .in('test_id', userTestIds)

      if (codingQuestionsError) throw codingQuestionsError

      // Step 6: Get actual scores from user answers (MCQ)
      const attemptIds = attemptData.map(attempt => attempt.id)
      const { data: mcqUserAnswers, error: mcqUserAnswersError } = await supabase
        .from('user_answers')
        .select('attempt_id, points_earned')
        .in('attempt_id', attemptIds)

      if (mcqUserAnswersError) throw mcqUserAnswersError

      // Step 7: Get actual scores from coding answers
      const { data: codingUserAnswers, error: codingUserAnswersError } = await supabase
        .from('user_coding_answers')
        .select('attempt_id, points_earned')
        .in('attempt_id', attemptIds)

      if (codingUserAnswersError) throw codingUserAnswersError

      // Create lookup maps
      const testsMap = new Map(testsData.map(test => [test.id, test]))
      const profilesMap = new Map(profilesData?.map(profile => [profile.id, profile]) || [])
      const pointsMap = new Map<string, number>()
      const actualScoresMap = new Map<string, number>()

      // Calculate total possible points for each test (MCQ + Coding)
      if (mcqQuestionsData) {
        mcqQuestionsData.forEach(q => {
          const currentPoints = pointsMap.get(q.test_id) || 0
          pointsMap.set(q.test_id, currentPoints + (q.points || 1))
        })
      }

      if (codingQuestionsData) {
        codingQuestionsData.forEach(q => {
          const currentPoints = pointsMap.get(q.test_id) || 0
          pointsMap.set(q.test_id, currentPoints + (q.points || 5))
        })
      }

      // Calculate actual earned scores for each attempt
      if (mcqUserAnswers) {
        mcqUserAnswers.forEach(answer => {
          const currentScore = actualScoresMap.get(answer.attempt_id) || 0
          actualScoresMap.set(answer.attempt_id, currentScore + (answer.points_earned || 0))
        })
      }

      if (codingUserAnswers) {
        codingUserAnswers.forEach(answer => {
          const currentScore = actualScoresMap.get(answer.attempt_id) || 0
          actualScoresMap.set(answer.attempt_id, currentScore + (answer.points_earned || 0))
        })
      }

      // Transform attempts data with correct scores
      const transformedAttempts: Attempt[] = attemptData.map(attempt => {
        const test = testsMap.get(attempt.test_id)
        const profile = profilesMap.get(attempt.user_id)
        const totalPoints = pointsMap.get(attempt.test_id) || test?.total_questions || 1
        const actualScore = actualScoresMap.get(attempt.id) ?? attempt.score // Use calculated score, fallback to stored score

        return {
          id: attempt.id,
          test_id: attempt.test_id,
          user_id: attempt.user_id,
          score: actualScore, // Use calculated score instead of stored score
          total_questions: attempt.total_questions,
          total_points: totalPoints,
          time_taken: attempt.time_taken,
          completed_at: attempt.completed_at,
          started_at: attempt.started_at,
          user: {
            full_name: profile?.full_name || null,
            email: profile?.email || 'Unknown'
          },
          tests: {
            title: test?.title || 'Unknown Test',
            test_code: test?.test_code || 'N/A',
            time_limit: test?.time_limit || 0,
            total_questions: test?.total_questions || 0,
            test_type: test?.test_type || 'mcq'
          }
        }
      })

      setAttempts(transformedAttempts)
    } catch (error) {
      console.error('Error loading data:', error)
      setError('Failed to load data. Please refresh the page.')
    }
  }, [])

  const loadStudentAttempts = useCallback(async (userId: string) => {
    try {
      setError(null)
      
      // Step 1: Get the student's test attempts
      const { data: attemptData, error: attemptError } = await supabase
        .from('test_attempts')
        .select('*')
        .eq('user_id', userId)
        .order('started_at', { ascending: false })

      if (attemptError) throw attemptError
      
      if (!attemptData || attemptData.length === 0) {
        setStudentAttempts([])
        return
      }

      // Step 2: Get unique test IDs
      const testIds = [...new Set(attemptData.map(attempt => attempt.test_id))]
      
      // Step 3: Get test details including test_type
      const { data: testsData, error: testsError } = await supabase
        .from('tests')
        .select('id, title, test_code, show_results, created_by, time_limit, total_questions, test_type')
        .in('id', testIds)

      if (testsError) throw testsError

      // Step 4: Get creator profiles
      const creatorIds = [...new Set(testsData?.map(test => test.created_by) || [])]
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', creatorIds)

      if (profilesError) throw profilesError

      // Step 5: Get total points for each test (both MCQ and coding)
      const { data: mcqQuestionsData, error: mcqQuestionsError } = await supabase
        .from('questions')
        .select('test_id, points')
        .in('test_id', testIds)

      if (mcqQuestionsError) throw mcqQuestionsError

      const { data: codingQuestionsData, error: codingQuestionsError } = await supabase
        .from('coding_questions')
        .select('test_id, points')
        .in('test_id', testIds)

      if (codingQuestionsError) throw codingQuestionsError

      // Step 6: Get actual scores from user answers (MCQ)
      const attemptIds = attemptData.map(attempt => attempt.id)
      const { data: mcqUserAnswers, error: mcqUserAnswersError } = await supabase
        .from('user_answers')
        .select('attempt_id, points_earned')
        .in('attempt_id', attemptIds)

      if (mcqUserAnswersError) throw mcqUserAnswersError

      // Step 7: Get actual scores from coding answers
      const { data: codingUserAnswers, error: codingUserAnswersError } = await supabase
        .from('user_coding_answers')
        .select('attempt_id, points_earned')
        .in('attempt_id', attemptIds)

      if (codingUserAnswersError) throw codingUserAnswersError

      // Create lookup maps
      const testsMap = new Map(testsData?.map(test => [test.id, test]) || [])
      const profilesMap = new Map(profilesData?.map(profile => [profile.id, profile]) || [])
      const pointsMap = new Map<string, number>()
      const actualScoresMap = new Map<string, number>()

      // Calculate total possible points for each test (MCQ + Coding)
      if (mcqQuestionsData) {
        mcqQuestionsData.forEach(q => {
          const currentPoints = pointsMap.get(q.test_id) || 0
          pointsMap.set(q.test_id, currentPoints + (q.points || 1))
        })
      }

      if (codingQuestionsData) {
        codingQuestionsData.forEach(q => {
          const currentPoints = pointsMap.get(q.test_id) || 0
          pointsMap.set(q.test_id, currentPoints + (q.points || 5))
        })
      }

      // Calculate actual earned scores for each attempt
      if (mcqUserAnswers) {
        mcqUserAnswers.forEach(answer => {
          const currentScore = actualScoresMap.get(answer.attempt_id) || 0
          actualScoresMap.set(answer.attempt_id, currentScore + (answer.points_earned || 0))
        })
      }

      if (codingUserAnswers) {
        codingUserAnswers.forEach(answer => {
          const currentScore = actualScoresMap.get(answer.attempt_id) || 0
          actualScoresMap.set(answer.attempt_id, currentScore + (answer.points_earned || 0))
        })
      }

      // Step 8: Transform the data with correct scores
      const transformedAttempts: StudentAttempt[] = attemptData.map(attempt => {
        const test = testsMap.get(attempt.test_id)
        const creator = test ? profilesMap.get(test.created_by) : null
        const totalPoints = pointsMap.get(attempt.test_id) || test?.total_questions || 1
        const actualScore = actualScoresMap.get(attempt.id) ?? attempt.score // Use calculated score

        return {
          id: attempt.id,
          test_id: attempt.test_id,
          score: actualScore, // Use the correctly calculated score
          total_points: totalPoints,
          time_taken: attempt.time_taken,
          completed_at: attempt.completed_at,
          started_at: attempt.started_at,
          test: {
            id: test?.id || attempt.test_id,
            title: test?.title || 'Unknown Test',
            test_code: test?.test_code || 'N/A',
            show_results: test?.show_results ?? false,
            created_by: test?.created_by || '',
            created_by_name: creator?.full_name || creator?.email || 'Unknown Teacher',
            test_type: test?.test_type || 'mcq'
          }
        }
      })

      setStudentAttempts(transformedAttempts)
    } catch (error) {
      console.error('Error loading student attempts:', error)
      setError('Failed to load your test attempts')
    }
  }, [])

  const loadTestLeaderboard = useCallback(async (testId: string) => {
    try {
      // Step 1: Get completed attempts for the test
      const { data: attemptData, error: attemptError } = await supabase
        .from('test_attempts')
        .select('*')
        .eq('test_id', testId)
        .not('completed_at', 'is', null)
        .order('score', { ascending: false }) // Initial sort for performance, will be re-sorted later
        .limit(50) // Get more records to sort correctly later

      if (attemptError) throw attemptError
      
      if (!attemptData || attemptData.length === 0) {
        setLeaderboardData([])
        return
      }

      // Step 2: Get user profiles
      const userIds = [...new Set(attemptData.map(attempt => attempt.user_id))]
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)

      if (profilesError) throw profilesError

      // Step 3: Get total points for the test (both MCQ and coding)
      const { data: mcqQuestionsData, error: mcqQuestionsError } = await supabase
        .from('questions')
        .select('points')
        .eq('test_id', testId)

      if (mcqQuestionsError) throw mcqQuestionsError

      const { data: codingQuestionsData, error: codingQuestionsError } = await supabase
        .from('coding_questions')
        .select('points')
        .eq('test_id', testId)

      if (codingQuestionsError) throw codingQuestionsError

      // Step 4: Get actual scores from user answers (MCQ)
      const attemptIds = attemptData.map(attempt => attempt.id)
      const { data: mcqUserAnswers, error: mcqUserAnswersError } = await supabase
        .from('user_answers')
        .select('attempt_id, points_earned')
        .in('attempt_id', attemptIds)

      if (mcqUserAnswersError) throw mcqUserAnswersError

      // Step 5: Get actual scores from coding answers
      const { data: codingUserAnswers, error: codingUserAnswersError } = await supabase
        .from('user_coding_answers')
        .select('attempt_id, points_earned')
        .in('attempt_id', attemptIds)

      if (codingUserAnswersError) throw codingUserAnswersError

      const mcqPoints = mcqQuestionsData?.reduce((sum, q) => sum + (q.points || 1), 0) || 0
      const codingPoints = codingQuestionsData?.reduce((sum, q) => sum + (q.points || 5), 0) || 0
      const totalPoints = mcqPoints + codingPoints

      // Create lookup maps
      const profilesMap = new Map(profilesData?.map(profile => [profile.id, profile]) || [])
      const actualScoresMap = new Map<string, number>()

      // Calculate actual earned scores for each attempt
      if (mcqUserAnswers) {
        mcqUserAnswers.forEach(answer => {
          const currentScore = actualScoresMap.get(answer.attempt_id) || 0
          actualScoresMap.set(answer.attempt_id, currentScore + (answer.points_earned || 0))
        })
      }

      if (codingUserAnswers) {
        codingUserAnswers.forEach(answer => {
          const currentScore = actualScoresMap.get(answer.attempt_id) || 0
          actualScoresMap.set(answer.attempt_id, currentScore + (answer.points_earned || 0))
        })
      }

      // Transform data with correct scores
      const transformedLeaderboard: LeaderboardEntry[] = attemptData.map((attempt) => {
        const profile = profilesMap.get(attempt.user_id)
        const effectiveTotalPoints = totalPoints || attempt.total_questions
        const actualScore = actualScoresMap.get(attempt.id) ?? attempt.score // Use calculated score
        
        return {
          id: attempt.id,
          user_id: attempt.user_id,
          score: actualScore, // Use the correctly calculated score
          total_questions: attempt.total_questions,
          total_points: effectiveTotalPoints,
          completed_at: attempt.completed_at!,
          profiles: {
            full_name: profile?.full_name || null,
            email: profile?.email || 'Unknown'
          },
          rank: 0, // Will be set after sorting
          percentage: effectiveTotalPoints > 0 ? ((actualScore / effectiveTotalPoints) * 100).toFixed(1) : '0.0',
          isCurrentUser: attempt.user_id === user?.id
        }
      })

      // Sort by actual score and assign ranks
      const sortedLeaderboard = transformedLeaderboard
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map((entry, index) => ({
          ...entry,
          rank: index + 1
        }))

      setLeaderboardData(sortedLeaderboard)
    } catch (error) {
      console.error('Error loading leaderboard:', error)
      setLeaderboardData([])
    }
  }, [user?.id])

  // Initialize component
  useEffect(() => {
    let isMounted = true
    let isLoading = false
    
    const getSession = async () => {
      if (isLoading) return
      isLoading = true
      
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError) {
          console.error('Session error:', sessionError)
          if (isMounted) router.push('/login')
          return
        }
        
        if (!session?.user) {
          if (isMounted) router.push('/login')
          return
        }
        
        if (isMounted) {
          setUser(session.user)
          setError(null)
          await Promise.all([
            loadAllData(session.user.id),
            loadStudentAttempts(session.user.id)
          ])
        }
        
      } catch (error) {
        console.error('Error in getSession:', error)
        if (isMounted) setError('Failed to load session. Please refresh the page.')
      } finally {
        isLoading = false
        if (isMounted) setLoading(false)
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user && !isLoading) {
        setLoading(true)
        Promise.all([
          loadAllData(user.id),
          loadStudentAttempts(user.id)
        ]).finally(() => {
          if (isMounted) setLoading(false)
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    getSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!isMounted || isLoading) return
        
        if (!session?.user) {
          router.push('/login')
        } else if (session.user.id !== user?.id) {
          setUser(session.user)
          isLoading = true
          setLoading(true)
          try {
            await Promise.all([
              loadAllData(session.user.id),
              loadStudentAttempts(session.user.id)
            ])
          } catch (error) {
            console.error('Error in auth state change:', error)
            if (isMounted) setError('Failed to reload data')
          } finally {
            isLoading = false
            if (isMounted) setLoading(false)
          }
        }
      }
    )

    return () => {
      isMounted = false
      isLoading = false
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      subscription.unsubscribe()
    }
  }, [router, user, loadAllData, loadStudentAttempts])

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
      setAttempts(attempts.filter(attempt => attempt.test_id !== testId))
      
      if (selectedTestId === testId) {
        setSelectedTestId(null)
      }
      
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

  const selectedTestAttempts = useMemo(() => {
    if (!selectedTestId) return []
    return attempts.filter(attempt => attempt.test_id === selectedTestId)
  }, [attempts, selectedTestId])

  const selectedTest = useMemo(() => {
    if (!selectedTestId) return null
    return tests.find(test => test.id === selectedTestId) || null
  }, [tests, selectedTestId])

  const sortAttempts = (atts: Attempt[]) => {
    return [...atts].sort((a, b) => {
      if (sortBy === 'score-desc') {
        return b.score - a.score
      }
      if (sortBy === 'name-asc') {
        return (a.user.full_name || a.user.email).localeCompare(b.user.full_name || b.user.email)
      }
      if (sortBy === 'date-desc') {
        const aTime = a.completed_at ? new Date(a.completed_at).getTime() : new Date(a.started_at).getTime()
        const bTime = b.completed_at ? new Date(b.completed_at).getTime() : new Date(b.started_at).getTime()
        return bTime - aTime
      }
      return 0
    })
  }

  const downloadResults = (testAttempts: Attempt[], testTitle: string) => {
    const sortedAttempts = sortAttempts(testAttempts)
    
    const data = sortedAttempts.map((a) => ({
      Name: a.user.full_name || 'Anonymous',
      Email: a.user.email,
      Score: `${a.score} / ${a.total_points}`,
      Percentage: `${calculatePercentage(a.score, a.total_points)}%`,
      'Time Taken': a.time_taken ? `${a.time_taken} min` : 'N/A',
      'Started At': formatDate(a.started_at),
      'Completed At': a.completed_at ? formatDate(a.completed_at) : 'In Progress',
      'Test Type': a.tests.test_type || 'mcq'
    }))
    
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Results')
    XLSX.writeFile(wb, `${testTitle.replace(/\s+/g, '_')}_results.xlsx`)
  }

  const testsWithAttempts = useMemo(() => {
    return tests.map(test => ({
      ...test,
      attemptCount: attempts.filter(attempt => attempt.test_id === test.id).length
    }))
  }, [tests, attempts])

  const handleViewLeaderboard = async (testId: string) => {
    await loadTestLeaderboard(testId)
    setSelectedTestId(testId)
    setShowLeaderboard(true)
  }

  const getTestTypeLabel = (testType: string) => {
    switch (testType) {
      case 'mcq': return 'MCQ'
      case 'coding': return 'Coding'
      default: return 'MCQ'
    }
  }

  const getTestTypeColor = (testType: string) => {
    switch (testType) {
      case 'mcq': return 'bg-blue-100 text-blue-800'
      case 'coding': return 'bg-green-100 text-green-800'
      default: return 'bg-blue-100 text-blue-800'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <div className="text-xl text-gray-600 mt-4">Loading...</div>
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
          <p className="text-gray-600">Manage your tests, view results, and track your progress</p>
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
                  setShowLeaderboard(false)
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
                  setShowLeaderboard(false)
                }}
                className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'attempts'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                View Results ({attempts.length} total attempts)
              </button>
              <button
                onClick={() => {
                  setActiveTab('my-attempts')
                  setSelectedTestId(null)
                  setShowLeaderboard(false)
                }}
                className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'my-attempts'
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                My Attempts ({studentAttempts.length})
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
                            Type
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
                            Attempts
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
                        {testsWithAttempts.map((test) => (
                          <tr key={test.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div>
                                <div className="text-sm font-medium text-gray-900">{test.title}</div>
                                {test.description && (
                                  <div className="text-sm text-gray-500 truncate max-w-xs">{test.description}</div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                                {test.test_code}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTestTypeColor(test.test_type)}`}>
                                {getTestTypeLabel(test.test_type)}
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
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                {test.attemptCount} attempts
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {formatDate(test.created_at)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <div className="flex items-center space-x-3">
                                <Link href={`/edit-test/${test.id}`} className="text-indigo-600 hover:text-indigo-900 transition-colors flex items-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L14.732 3.732z" /></svg>
                                    <span className="ml-1">Edit</span>
                                </Link>
                                <button
                                  onClick={() => deleteTest(test.id)}
                                  className="text-red-600 hover:text-red-900 transition-colors flex items-center"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                  <span className="ml-1">Delete</span>
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
            ) : activeTab === 'my-attempts' ? (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-6">My Test Attempts</h2>
                
                {studentAttempts.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="text-gray-500 mb-4">You haven&apos;t attempted any tests yet</div>
                    <Link href="/take-test">
                      <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg transition-colors">
                        Take a Test
                      </button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {studentAttempts.map((attempt) => (
                      <div key={attempt.id} className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900">{attempt.test.title}</h3>
                            <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                              <span>Code: {attempt.test.test_code}</span>
                              <span>•</span>
                              <span>Type: 
                                <span className={`ml-1 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getTestTypeColor(attempt.test.test_type)}`}>
                                  {getTestTypeLabel(attempt.test.test_type)}
                                </span>
                              </span>
                              <span>•</span>
                              <span>By: {attempt.test.created_by_name}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-2xl font-bold text-gray-900">
                              {attempt.score} / {attempt.total_points}
                            </div>
                            <div className={`text-sm font-medium ${
                              parseFloat(calculatePercentage(attempt.score, attempt.total_points)) >= 70
                                ? 'text-green-600'
                                : parseFloat(calculatePercentage(attempt.score, attempt.total_points)) >= 50
                                ? 'text-yellow-600'
                                : 'text-red-600'
                            }`}>
                              {calculatePercentage(attempt.score, attempt.total_points)}%
                            </div>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                          <div>
                            <div className="text-sm text-gray-500">Time Taken</div>
                            <div className="font-medium">{attempt.time_taken ? `${attempt.time_taken} min` : 'N/A'}</div>
                          </div>
                          <div>
                            <div className="text-sm text-gray-500">Started</div>
                            <div className="font-medium">{formatDate(attempt.started_at)}</div>
                          </div>
                          <div>
                            <div className="text-sm text-gray-500">Completed</div>
                            <div className="font-medium">
                              {attempt.completed_at ? formatDate(attempt.completed_at) : 'In Progress'}
                            </div>
                          </div>
                          <div>
                            <div className="text-sm text-gray-500">Status</div>
                            <div className={`font-medium ${
                              attempt.completed_at ? 'text-green-600' : 'text-yellow-600'
                            }`}>
                              {attempt.completed_at ? 'Completed' : 'In Progress'}
                            </div>
                          </div>
                        </div>

                        {attempt.test.show_results && attempt.completed_at && (
                          <div className="flex space-x-3">
                            <button
                              onClick={() => handleViewLeaderboard(attempt.test_id)}
                              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors text-sm"
                            >
                              View Leaderboard
                            </button>
                            <Link href={`/test-results/${attempt.id}`}>
                              <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg transition-colors text-sm">
                                View Detailed Results
                              </button>
                            </Link>
                          </div>
                        )}
                        
                        {!attempt.test.show_results && (
                          <div className="text-sm text-gray-500 italic">
                            Results are not available for this test
                          </div>
                        )}
                      </div>
                    ))}
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
                            onClick={() => test.attemptCount > 0 && setSelectedTestId(test.id)}
                            className={`bg-white p-6 rounded-lg shadow-md border transition-shadow ${
                              test.attemptCount > 0 
                                ? 'hover:shadow-lg cursor-pointer' 
                                : 'opacity-60 cursor-not-allowed'
                            }`}
                          >
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">{test.title}</h3>
                            <p className="text-sm text-gray-600 mb-4 line-clamp-2">{test.description || 'No description'}</p>
                            <div className="flex justify-between items-center mb-2">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                                {test.test_code}
                              </span>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getTestTypeColor(test.test_type)}`}>
                                {getTestTypeLabel(test.test_type)}
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className={`text-sm font-medium ${
                                test.attemptCount > 0 ? 'text-blue-600' : 'text-gray-500'
                              }`}>
                                {test.attemptCount} attempt{test.attemptCount !== 1 ? 's' : ''}
                              </span>
                            </div>
                            {test.attemptCount === 0 && (
                              <p className="text-xs text-gray-500 mt-2">No attempts yet</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center mb-6">
                      <button
                        onClick={() => {
                          setSelectedTestId(null)
                          setShowLeaderboard(false)
                        }}
                        className="mr-4 text-indigo-600 hover:text-indigo-800 transition-colors flex items-center"
                      >
                        ← Back to Tests
                      </button>
                      <div>
                        <h2 className="text-xl font-semibold text-gray-900">
                          {selectedTest?.title} Results
                        </h2>
                        <div className="flex items-center space-x-4 text-sm text-gray-600">
                          <span>Code: {selectedTest?.test_code}</span>
                          <span>•</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getTestTypeColor(selectedTest?.test_type || 'mcq')}`}>
                            {getTestTypeLabel(selectedTest?.test_type || 'mcq')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {selectedTestAttempts.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="text-gray-500">No attempts for this test yet</div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
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
                              onClick={() => {
                                if (!showLeaderboard) {
                                  loadTestLeaderboard(selectedTestId)
                                }
                                setShowLeaderboard(!showLeaderboard)
                              }}
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
                        
                        {showLeaderboard && (
                          <div className="bg-gray-50 p-4 rounded-lg mb-6">
                            <h4 className="text-md font-semibold text-gray-900 mb-4">Leaderboard</h4>
                            <LeaderboardComponent leaderboardData={leaderboardData} loading={false} />
                          </div>
                        )}

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

                        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-blue-50 p-4 rounded-lg">
                            <div className="text-2xl font-bold text-blue-600">
                              {selectedTestAttempts.length}
                            </div>
                            <div className="text-sm text-gray-600">Total Attempts</div>
                          </div>
                          <div className="bg-green-50 p-4 rounded-lg">
                            <div className="text-2xl font-bold text-green-600">
                              {selectedTestAttempts.filter(a => a.completed_at).length}
                            </div>
                            <div className="text-sm text-gray-600">Completed</div>
                          </div>
                          <div className="bg-purple-50 p-4 rounded-lg">
                            <div className="text-2xl font-bold text-purple-600">
                              {(() => {
                                const completed = selectedTestAttempts.filter(a => a.completed_at);
                                if (completed.length === 0) return '0.0';
                                const avg = completed.reduce((sum, a) => sum + parseFloat(calculatePercentage(a.score, a.total_points)), 0) / completed.length;
                                return avg.toFixed(1);
                              })()}%
                            </div>
                            <div className="text-sm text-gray-600">Average Score</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Leaderboard Modal */}
        {showLeaderboard && selectedTestId && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Test Leaderboard</h3>
                <button
                  onClick={() => {
                    setShowLeaderboard(false)
                    // Keep selectedTestId to avoid going back to test list
                  }}
                  className="text-gray-400 hover:text-gray-600 text-2xl font-semibold"
                >
                  ×
                </button>
              </div>
              
              <LeaderboardComponent 
                leaderboardData={leaderboardData} 
                loading={false} // Loading is handled on the main page
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Improved Leaderboard Component
interface LeaderboardComponentProps {
  leaderboardData: LeaderboardEntry[]
  loading: boolean
}

function LeaderboardComponent({ leaderboardData, loading }: LeaderboardComponentProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return (
      <div className="text-center py-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-2"></div>
        <div className="text-gray-500">Loading leaderboard...</div>
      </div>
    )
  }

  if (leaderboardData.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-500 text-lg">No completed attempts yet</div>
        <div className="text-gray-400 text-sm mt-2">Be the first to complete this test!</div>
      </div>
    )
  }

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-600 mb-4">
        Top {leaderboardData.length} performer{leaderboardData.length !== 1 ? 's' : ''}
      </div>
      
      {leaderboardData.map((entry) => (
        <div
          key={entry.id}
          className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
            entry.isCurrentUser 
              ? 'bg-indigo-50 border-indigo-200 shadow-sm' 
              : 'bg-gray-50 border-gray-200'
          }`}
        >
          <div className="flex items-center space-x-4 flex-1 min-w-0">
            <div className="text-2xl min-w-[3rem] text-center">
              {entry.rank <= 3 ? medals[entry.rank - 1] : `#${entry.rank}`}
            </div>
            <div className="min-w-0 flex-1">
              <div className={`font-medium truncate ${
                entry.isCurrentUser ? 'text-indigo-900' : 'text-gray-900'
              }`}>
                {entry.profiles?.full_name || 'Anonymous'}
                {entry.isCurrentUser && <span className="text-indigo-600 ml-2 font-normal">(You)</span>}
              </div>
              <div className="text-sm text-gray-600 truncate">{entry.profiles?.email}</div>
            </div>
          </div>
          <div className="text-right ml-4">
            <div className="font-bold text-gray-900">
              {entry.score} / {entry.total_points}
            </div>
            <div className={`text-sm font-medium ${
              parseFloat(entry.percentage) >= 70 ? 'text-green-600' :
              parseFloat(entry.percentage) >= 50 ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {entry.percentage}%
            </div>
            <div className="text-xs text-gray-500">{formatDate(entry.completed_at)}</div>
          </div>
        </div>
      ))}
    </div>
  )
}