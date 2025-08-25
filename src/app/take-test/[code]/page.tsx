'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/app/lib/supabase'

interface Question {
  id: string
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_answer: 'A' | 'B' | 'C' | 'D'
  question_number: number
  points: number
}

interface TestData {
  id: string
  test_code: string
  title: string
  description: string
  time_limit: number
  total_questions: number
}

interface UserAnswer {
  question_id: string
  selected_answer: 'A' | 'B' | 'C' | 'D' | null
}

export default function TakeTest() {
  const params = useParams()
  const code = params.code as string
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [testData, setTestData] = useState<TestData | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([])
  const [timeLeft, setTimeLeft] = useState(0)
  const [testStarted, setTestStarted] = useState(false)
  const [showWarning, setShowWarning] = useState<'fullscreen' | 'visibility' | null>(null)
  const [countdown, setCountdown] = useState(10)
  const [warningTimer, setWarningTimer] = useState<NodeJS.Timeout | null>(null)
  const [testSubmitted, setTestSubmitted] = useState(false)
  const submissionInProgress = useRef(false)
  const testLoadedRef = useRef(false) // Add this to prevent re-loading
  const router = useRouter()

  const submitTest = useCallback(
    async (reason: 'timeUp' | 'fullscreenExit' | 'visibilityExit' | 'manual' = 'timeUp') => {
      // Prevent multiple submissions
      if (submissionInProgress.current || testSubmitted || !user || !testData) {
        console.log('Cannot submit test: Already submitted or missing data')
        return
      }

      console.log('Submitting test due to:', reason)
      submissionInProgress.current = true
      setSubmitting(true)
      setTestSubmitted(true)

      // Clear any active warning timer
      if (warningTimer) {
        clearInterval(warningTimer)
        setWarningTimer(null)
      }

      try {
        // Check if test was already submitted (additional safety check)
        const { data: existingAttempt, error: checkError } = await supabase
          .from('test_attempts')
          .select('id')
          .eq('test_id', testData.id)
          .eq('user_id', user.id)
          .single()

        if (existingAttempt) {
          console.log('Test already submitted, redirecting to results')
          alert('Test has already been submitted. Redirecting to view marks.')
          router.push('/view-marks')
          return
        }

        if (checkError && checkError.code !== 'PGRST116') {
          throw new Error(checkError.message)
        }

        let score = 0
        const detailedAnswers = userAnswers.map(ua => {
          const question = questions.find(q => q.id === ua.question_id)
          if (!question) throw new Error(`Invalid question ID: ${ua.question_id}`)
          const isCorrect = ua.selected_answer && question.correct_answer === ua.selected_answer
          if (isCorrect) score += question.points || 1
          return {
            question_id: ua.question_id,
            selected_answer: ua.selected_answer,
            is_correct: !!isCorrect,
            points_earned: isCorrect ? (question.points || 1) : 0
          }
        })

        const timeTaken = Math.ceil((testData.time_limit * 60 - timeLeft) / 60)

        const { data: attempt, error: attemptError } = await supabase
          .from('test_attempts')
          .insert({
            test_id: testData.id,
            user_id: user.id,
            score,
            total_questions: questions.length,
            time_taken: timeTaken,
            completed_at: new Date().toISOString(),
            answers: userAnswers
          })
          .select()
          .single()

        if (attemptError) {
          if (attemptError.code === '23505') { // Unique constraint violation
            console.log('Test already submitted by another process')
            alert('Test has already been submitted. Redirecting to view marks.')
            router.push('/view-marks')
            return
          }
          throw new Error(attemptError.message)
        }

        const answersToInsert = detailedAnswers
          .filter(answer => answer.selected_answer !== null)
          .map(answer => ({
            attempt_id: attempt.id,
            question_id: answer.question_id,
            selected_answer: answer.selected_answer,
            is_correct: answer.is_correct,
            points_earned: answer.points_earned
          }))

        if (answersToInsert.length > 0) {
          const { error: answersError } = await supabase
            .from('user_answers')
            .insert(answersToInsert)

          if (answersError) throw new Error(answersError.message)
        }

        const totalPossibleScore = questions.reduce((sum, q) => sum + (q.points || 1), 0)
        
        alert(
          reason === 'timeUp'
            ? `Time's up! Your test was submitted automatically. Score: ${score}/${totalPossibleScore}`
            : reason === 'fullscreenExit'
            ? `Test submitted due to exiting full screen mode. Score: ${score}/${totalPossibleScore}`
            : reason === 'visibilityExit'
            ? `Test submitted due to switching tabs/windows (Alt+Tab detected). Score: ${score}/${totalPossibleScore}`
            : `Test submitted successfully. Score: ${score}/${totalPossibleScore}`
        )

        router.push('/view-marks')
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error submitting test:', error)
        alert(`Error submitting test: ${errorMessage}`)
        // Reset states on error
        submissionInProgress.current = false
        setSubmitting(false)
        setTestSubmitted(false)
      }
    },
    [testSubmitted, user, testData, userAnswers, questions, timeLeft, router, warningTimer]
  )

  const startWarningCountdown = useCallback((warningType: 'fullscreen' | 'visibility') => {
    if (testSubmitted || submissionInProgress.current) {
      console.log('Test already submitted, ignoring warning')
      return
    }

    console.log('Starting warning countdown for:', warningType)
    setShowWarning(warningType)
    setCountdown(10)
    
    // Clear any existing timer
    if (warningTimer) {
      clearInterval(warningTimer)
    }

    // Start new countdown timer
    const timer = setInterval(() => {
      setCountdown(prev => {
        console.log('Countdown:', prev - 1)
        if (prev <= 1) {
          console.log('Countdown reached 0, submitting test')
          clearInterval(timer)
          setWarningTimer(null)
          submitTest(warningType === 'fullscreen' ? 'fullscreenExit' : 'visibilityExit')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    
    setWarningTimer(timer)
  }, [submitTest, warningTimer, testSubmitted])

  const clearWarning = useCallback(() => {
    console.log('Clearing warning')
    setShowWarning(null)
    if (warningTimer) {
      clearInterval(warningTimer)
      setWarningTimer(null)
    }
  }, [warningTimer])

  const enterFullscreen = () => {
    const elem = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void>;
      msRequestFullscreen?: () => Promise<void>;
    }
    if (elem.requestFullscreen) {
      elem.requestFullscreen().catch((err: Error) => console.error('Fullscreen error:', err))
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen()
    } else if (elem.msRequestFullscreen) {
      elem.msRequestFullscreen()
    }
  }

  const isFullscreen = () => {
    return !!(
      document.fullscreenElement ||
      (document as Document & {
        webkitFullscreenElement?: Element;
        msFullscreenElement?: Element;
      }).webkitFullscreenElement ||
      (document as Document & {
        webkitFullscreenElement?: Element;
        msFullscreenElement?: Element;
      }).msFullscreenElement
    )
  }

  const startTest = () => {
    setTestStarted(true)
  }

  const loadTestData = useCallback(async (userId: string) => {
    try {
      console.log('Loading test data for user:', userId, 'test code:', code)
      
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .single()

      if (profileError || !profile) {
        throw new Error('User profile not found')
      }

      const { data: test, error: testError } = await supabase
        .from('tests')
        .select('*')
        .ilike('test_code', code)
        .eq('is_active', true)
        .single()

      if (testError || !test) {
        throw new Error('Test not found or inactive')
      }

      console.log('Test found:', test.id)

      // Use a more robust query to check for existing attempts
      const { data: attempts, error: attemptError } = await supabase
        .from('test_attempts')
        .select('id, completed_at, score')
        .eq('test_id', test.id)
        .eq('user_id', userId)
        .order('completed_at', { ascending: false })

      if (attemptError && attemptError.code !== 'PGRST116') {
        console.error('Error checking attempts:', attemptError)
        throw new Error(attemptError.message)
      }

      // Check if any attempts exist
      if (attempts && attempts.length > 0) {
        console.log('Found existing attempts:', attempts.length)
        // Check if there's a completed attempt (with completed_at set)
        const completedAttempt = attempts.find(attempt => attempt.completed_at)
        if (completedAttempt) {
          console.log('Found completed attempt, redirecting to results')
          setError('You have already completed this test. Redirecting to view your marks.')
          setTimeout(() => {
            router.push('/view-marks')
          }, 2000)
          return
        }
      }

      const { data: questionsData, error: questionsError } = await supabase
        .from('questions')
        .select('*')
        .eq('test_id', test.id)
        .order('question_number')

      if (questionsError || !questionsData) {
        throw new Error(questionsError?.message || 'Error loading questions')
      }

      console.log('Questions loaded:', questionsData.length)

      setTestData(test)
      setQuestions(questionsData)
      setUserAnswers(questionsData.map(q => ({ question_id: q.id, selected_answer: null })))
      setTimeLeft(test.time_limit * 60)
      setLoading(false)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error loading test:', error)
      setError(`Error loading test: ${errorMessage}`)
      setLoading(false)
    }
  }, [code, router])

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
        
        // Only load test data if not already loaded
        if (!testLoadedRef.current) {
          await loadTestData(session.user.id)
          testLoadedRef.current = true
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
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
          // Don't reload test data on auth state change
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [router, loadTestData])

  useEffect(() => {
    if (testStarted) {
      enterFullscreen()
    }
  }, [testStarted])

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!isFullscreen() && testStarted && !submitting && !testSubmitted) {
        console.log('Fullscreen exited, starting warning')
        startWarningCountdown('fullscreen')
      } else if (isFullscreen() && showWarning === 'fullscreen') {
        console.log('Returned to fullscreen, clearing warning')
        clearWarning()
      }
    }

    const handleVisibilityChange = () => {
      if (document.hidden && testStarted && !submitting && !testSubmitted) {
        console.log('Tab/window hidden (Alt+Tab detected), starting warning')
        startWarningCountdown('visibility')
      } else if (!document.hidden && showWarning === 'visibility') {
        console.log('Returned to tab/window, clearing warning')
        clearWarning()
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    document.addEventListener('msfullscreenchange', handleFullscreenChange)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
      document.removeEventListener('msfullscreenchange', handleFullscreenChange)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [testStarted, submitting, testSubmitted, showWarning, startWarningCountdown, clearWarning])

  useEffect(() => {
    if (!testStarted || timeLeft <= 0 || testSubmitted) return

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1 && !testSubmitted) {
          submitTest('timeUp')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [testStarted, timeLeft, testSubmitted, submitTest])

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (testStarted && !submitting && !testSubmitted) {
        e.preventDefault()
        e.returnValue = 'Your test progress will be lost. Are you sure you want to leave?'
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [testStarted, submitting, testSubmitted])

  // Cleanup timer on component unmount
  useEffect(() => {
    return () => {
      if (warningTimer) {
        clearInterval(warningTimer)
      }
    }
  }, [warningTimer])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const selectAnswer = (questionId: string, answer: 'A' | 'B' | 'C' | 'D') => {
    if (testSubmitted) return // Prevent answer changes after submission
    setUserAnswers(prev =>
      prev.map(ua =>
        ua.question_id === questionId ? { ...ua, selected_answer: answer } : ua
      )
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading test...</div>
      </div>
    )
  }

  if (error || !testData || questions.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl text-red-600 mb-4">{error || 'Test not available'}</div>
          <button
            onClick={() => router.push('/answer-test')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg"
          >
            Back to Answer Test
          </button>
        </div>
      </div>
    )
  }

  if (!testStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="max-w-2xl mx-auto px-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="bg-blue-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-4">{testData.title}</h1>
            <div className="grid grid-cols-2 gap-4 mb-8 text-left bg-gray-50 rounded-lg p-6">
              <div>
                <span className="text-sm text-gray-500">Questions</span>
                <p className="font-semibold">{testData.total_questions}</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Time Limit</span>
                <p className="font-semibold">{testData.time_limit} minutes</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Test Code</span>
                <p className="font-semibold uppercase">{testData.test_code}</p>
              </div>
              <div>
                <span className="text-sm text-gray-500">Type</span>
                <p className="font-semibold">MCQ Test</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
              <h3 className="font-semibold text-red-800 mb-2">⚠️ Important Instructions</h3>
              <ul className="text-sm text-red-700 text-left space-y-1">
                <li>• Once started, the timer cannot be paused</li>
                <li>• You can navigate between questions freely</li>
                <li>• Make sure to submit before time runs out</li>
                <li>• Do not refresh or close the browser</li>
                <li>• The test must be taken in full screen mode</li>
                <li>• Do not use Alt+Tab or switch tabs/windows, or the test will be auto-submitted in 10 seconds</li>
              </ul>
            </div>
            <button
              onClick={startTest}
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
            >
              Start Test
            </button>
          </div>
        </div>
      </div>
    )
  }

  const currentQ = questions[currentQuestion]
  const currentAnswer = userAnswers.find(ua => ua.question_id === currentQ?.id)

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white shadow-lg sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{testData.title}</h1>
              <p className="text-sm text-gray-600">
                Question {currentQuestion + 1} of {questions.length}
              </p>
            </div>
            <div className="flex items-center space-x-6">
              <div className="text-center">
                <div className="text-sm text-gray-500">Time Remaining</div>
                <div className={`text-lg font-bold ${timeLeft < 300 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatTime(timeLeft)}
                </div>
              </div>
              <button
                onClick={() => submitTest('manual')}
                disabled={submitting || testSubmitted}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : testSubmitted ? 'Submitted' : 'Submit Test'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md p-4 sticky top-24">
              <h3 className="font-semibold text-gray-900 mb-4">Questions</h3>
              <div className="grid grid-cols-5 lg:grid-cols-4 gap-2" role="tablist">
                {questions.map((_, index) => {
                  const answered = userAnswers[index]?.selected_answer !== null
                  const isCurrent = index === currentQuestion
                  return (
                    <button
                      key={index}
                      onClick={() => !testSubmitted && setCurrentQuestion(index)}
                      disabled={testSubmitted}
                      className={`w-10 h-10 rounded-lg font-medium text-sm transition-colors disabled:cursor-not-allowed ${
                        isCurrent
                          ? 'bg-blue-600 text-white'
                          : answered
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      } ${testSubmitted ? 'opacity-50' : ''}`}
                      role="tab"
                      aria-selected={isCurrent}
                      aria-label={`Question ${index + 1}`}
                    >
                      {index + 1}
                    </button>
                  )
                })}
              </div>
              <div className="mt-4 text-xs space-y-2">
                <div className="flex items-center">
                  <div className="w-4 h-4 bg-green-100 rounded mr-2"></div>
                  <span>Answered</span>
                </div>
                <div className="flex items-center">
                  <div className="w-4 h-4 bg-gray-100 rounded mr-2"></div>
                  <span>Not Answered</span>
                </div>
                <div className="flex items-center">
                  <div className="w-4 h-4 bg-blue-600 rounded mr-2"></div>
                  <span>Current</span>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow-md p-8">
              <div className="mb-8">
                <div className="flex justify-between items-start mb-4">
                  <span className="bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded">
                    Question {currentQuestion + 1}
                  </span>
                  <span className="text-sm text-gray-500">
                    {currentQ?.points} point{(currentQ?.points || 1) > 1 ? 's' : ''}
                  </span>
                </div>
                <h2 className="text-lg font-medium text-gray-900 leading-relaxed">
                  {currentQ?.question_text}
                </h2>
              </div>
              <div className="space-y-4 mb-8" role="radiogroup" aria-label={`Question ${currentQuestion + 1} options`}>
                {[
                  { key: 'A' as const, text: currentQ?.option_a },
                  { key: 'B' as const, text: currentQ?.option_b },
                  { key: 'C' as const, text: currentQ?.option_c },
                  { key: 'D' as const, text: currentQ?.option_d }
                ].map((option) => (
                  <label
                    key={option.key}
                    className={`flex items-start p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                      testSubmitted ? 'cursor-not-allowed opacity-50' : ''
                    } ${
                      currentAnswer?.selected_answer === option.key
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name={`question-${currentQ?.id}`}
                      value={option.key}
                      checked={currentAnswer?.selected_answer === option.key}
                      onChange={() => selectAnswer(currentQ.id, option.key)}
                      disabled={testSubmitted}
                      className="mt-1 mr-4 text-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed"
                      aria-label={`Option ${option.key}`}
                    />
                    <div className="flex-1">
                      <div className="flex items-center">
                        <span className="bg-gray-100 text-gray-800 text-sm font-medium px-2 py-1 rounded mr-3">
                          {option.key}
                        </span>
                        <span className="text-gray-900">{option.text}</span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              <div className="flex justify-between">
                <button
                  onClick={() => setCurrentQuestion(prev => Math.max(0, prev - 1))}
                  disabled={currentQuestion === 0 || testSubmitted}
                  className="flex items-center px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Previous question"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Previous
                </button>
                <button
                  onClick={() => setCurrentQuestion(prev => Math.min(questions.length - 1, prev + 1))}
                  disabled={currentQuestion === questions.length - 1 || testSubmitted}
                  className="flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Next question"
                >
                  Next
                  <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showWarning && !testSubmitted && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-lg shadow-xl text-center max-w-md w-full mx-4">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold text-red-600 mb-4">
              {showWarning === 'fullscreen' ? 'Full Screen Required!' : 'Return to Test!'}
            </h2>
            <p className="text-gray-800 mb-6 text-lg">
              {showWarning === 'fullscreen'
                ? 'Return to full screen mode'
                : 'Alt+Tab detected! Return to the test window'}
              {' or your test will be automatically submitted in:'}
            </p>
            <div className="text-6xl font-bold text-red-600 mb-6 animate-pulse">
              {countdown}
            </div>
            <p className="text-sm text-gray-600 mb-6">
              {countdown <= 3 && (
                <span className="font-bold text-red-600 animate-pulse">
                  🚨 FINAL WARNING: {countdown} seconds remaining! 🚨
                </span>
              )}
            </p>
            <button
              onClick={() => {
                if (showWarning === 'fullscreen') {
                  enterFullscreen()
                } else {
                  window.focus()
                }
              }}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium text-lg"
            >
              {showWarning === 'fullscreen' ? '↗️ Return to Full Screen' : '↗️ Return to Test'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
