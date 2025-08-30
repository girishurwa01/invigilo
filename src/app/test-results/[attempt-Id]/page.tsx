'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
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

interface UserAnswer {
  id: string
  question_id: string
  selected_answer: 'A' | 'B' | 'C' | 'D' | null
  is_correct: boolean
  points_earned: number
}

interface TestAttempt {
  id: string
  test_id: string
  user_id: string
  score: number
  total_questions: number
  time_taken: number | null
  completed_at: string | null
  started_at: string
  test: {
    id: string
    title: string
    test_code: string
    description: string | null
    time_limit: number
    show_results: boolean
    created_by: string
    created_by_name?: string
  }
}

interface DetailedResult {
  question: Question
  userAnswer: UserAnswer | null
  isCorrect: boolean
  pointsEarned: number
  totalPoints: number
}

export default function TestResultsPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState<TestAttempt | null>(null)
  const [results, setResults] = useState<DetailedResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0)
  const router = useRouter()
  const params = useParams()
  
  // Extract attemptId from params with proper type checking
  // Note: The file is named [attempt-Id] so we access it with the hyphen
  const attemptId = Array.isArray(params['attempt-Id']) ? params['attempt-Id'][0] : params['attempt-Id']

  useEffect(() => {
    // Add validation for attemptId
    if (!attemptId) {
      setError('No attempt ID provided')
      setLoading(false)
      return
    }

    const getSession = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError) {
          console.error('Session error:', sessionError)
          router.push('/login')
          return
        }
        
        if (!session?.user) {
          router.push('/login')
          return
        }
        
        setUser(session.user)
        await loadTestResults(session.user.id, attemptId)
        
      } catch (error) {
        console.error('Error in getSession:', error)
        setError('Failed to load session')
        setLoading(false)
      }
    }

    getSession()
  }, [router, attemptId])

  const loadTestResults = async (userId: string, attemptId: string) => {
    try {
      console.log('Loading results for attemptId:', attemptId, 'userId:', userId) // Debug log
      
      // Load test attempt details
      const { data: attemptData, error: attemptError } = await supabase
        .from('test_attempts')
        .select(`
          *,
          tests!inner (
            id,
            title,
            test_code,
            description,
            time_limit,
            show_results,
            created_by,
            profiles!tests_created_by_fkey (
              full_name
            )
          )
        `)
        .eq('id', attemptId)
        .eq('user_id', userId)
        .single()

      if (attemptError) {
        console.error('Attempt error:', attemptError)
        throw attemptError
      }
      if (!attemptData) throw new Error('Test attempt not found')

      // Check if results are allowed to be shown
      if (!attemptData.tests.show_results) {
        setError('Results are not available for this test')
        setLoading(false)
        return
      }

      const transformedAttempt: TestAttempt = {
        ...attemptData,
        test: {
          ...attemptData.tests,
          created_by_name: attemptData.tests.profiles?.full_name || 'Unknown Teacher'
        }
      }
      setAttempt(transformedAttempt)

      // Load questions for this test
      const { data: questionsData, error: questionsError } = await supabase
        .from('questions')
        .select('*')
        .eq('test_id', attemptData.test_id)
        .order('question_number', { ascending: true })

      if (questionsError) {
        console.error('Questions error:', questionsError)
        throw questionsError
      }

      // Load user answers for this attempt
      const { data: answersData, error: answersError } = await supabase
        .from('user_answers')
        .select('*')
        .eq('attempt_id', attemptId)

      if (answersError) {
        console.error('Answers error:', answersError)
        throw answersError
      }

      // Combine questions with user answers
      const detailedResults: DetailedResult[] = (questionsData || []).map((question: Question) => {
        const userAnswer = (answersData || []).find((answer: UserAnswer) => answer.question_id === question.id)
        
        let isCorrect = false
        let pointsEarned = 0

        if (userAnswer) {
          isCorrect = userAnswer.is_correct
          pointsEarned = userAnswer.points_earned
        }

        return {
          question,
          userAnswer: userAnswer || null,
          isCorrect,
          pointsEarned,
          totalPoints: question.points
        }
      })

      setResults(detailedResults)
      
    } catch (error) {
      console.error('Error loading test results:', error)
      // More detailed error logging
      if (error && typeof error === 'object' && 'message' in error) {
        setError(`Failed to load test results: ${error.message}`)
      } else {
        setError('Failed to load test results')
      }
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const calculatePercentage = (score: number, totalPoints: number) => {
    if (totalPoints === 0) return '0.0'
    return ((score / totalPoints) * 100).toFixed(1)
  }

  const getOptionText = (question: Question, optionLetter: 'A' | 'B' | 'C' | 'D') => {
    switch (optionLetter) {
      case 'A': return question.option_a
      case 'B': return question.option_b
      case 'C': return question.option_c
      case 'D': return question.option_d
      default: return ''
    }
  }

  const getAnswerStyle = (isCorrect: boolean, isSelected: boolean = false) => {
    if (isCorrect && isSelected) {
      return 'bg-green-100 border-green-500 text-green-800'
    } else if (isCorrect) {
      return 'bg-green-50 border-green-300 text-green-700'
    } else if (isSelected && !isCorrect) {
      return 'bg-red-100 border-red-500 text-red-800'
    } else {
      return 'bg-gray-50 border-gray-200 text-gray-700'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <div className="text-xl text-gray-600 mt-4">Loading test results...</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-xl mb-4">{error}</div>
          <Link href="/view-marks" className="text-indigo-600 hover:text-indigo-800">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  if (!attempt) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-600 text-xl mb-4">Test attempt not found</div>
          <Link href="/view-marks" className="text-indigo-600 hover:text-indigo-800">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const currentResult = results[activeQuestionIndex]
  const correctAnswers = results.filter(r => r.isCorrect).length
  const totalQuestions = results.length
  const totalPossiblePoints = results.reduce((sum, r) => sum + r.totalPoints, 0)

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

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Back Navigation */}
        <div className="mb-6">
          <Link href="/view-marks" className="text-indigo-600 hover:text-indigo-800 flex items-center">
            ← Back to Dashboard
          </Link>
        </div>

        {/* Test Summary */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-indigo-600">
                {attempt.score}
              </div>
              <div className="text-sm text-gray-600">Total Score</div>
              <div className="text-xs text-gray-500">out of {totalPossiblePoints} points</div>
            </div>
            <div className="text-center">
              <div className={`text-3xl font-bold ${
                parseFloat(calculatePercentage(attempt.score, totalPossiblePoints)) >= 70
                  ? 'text-green-600'
                  : parseFloat(calculatePercentage(attempt.score, totalPossiblePoints)) >= 50
                  ? 'text-yellow-600'
                  : 'text-red-600'
              }`}>
                {calculatePercentage(attempt.score, totalPossiblePoints)}%
              </div>
              <div className="text-sm text-gray-600">Percentage</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600">
                {correctAnswers}
              </div>
              <div className="text-sm text-gray-600">Correct Answers</div>
              <div className="text-xs text-gray-500">out of {totalQuestions} questions</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600">
                {attempt.time_taken || 'N/A'}
              </div>
              <div className="text-sm text-gray-600">Time Taken (min)</div>
            </div>
          </div>
          
          <div className="mt-6 text-center">
            <h1 className="text-2xl font-bold text-gray-900">{attempt.test.title}</h1>
            <p className="text-gray-600 mt-1">
              Test Code: {attempt.test.test_code} | Created by: {attempt.test.created_by_name}
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Completed on {attempt.completed_at ? formatDate(attempt.completed_at) : 'In Progress'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Question Navigation Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-lg p-4 sticky top-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Questions</h3>
              <div className="grid grid-cols-5 lg:grid-cols-1 gap-2">
                {results.map((result, index) => (
                  <button
                    key={result.question.id}
                    onClick={() => setActiveQuestionIndex(index)}
                    className={`p-2 rounded-lg text-sm font-medium transition-colors ${
                      index === activeQuestionIndex
                        ? 'bg-indigo-600 text-white'
                        : result.isCorrect
                        ? 'bg-green-100 text-green-800 hover:bg-green-200'
                        : result.userAnswer
                        ? 'bg-red-100 text-red-800 hover:bg-red-200'
                        : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                    }`}
                  >
                    Q{result.question.question_number}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Question Detail */}
          <div className="lg:col-span-3">
            {currentResult && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                {/* Question Header */}
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">
                      Question {currentResult.question.question_number}
                    </h2>
                    <div className="flex items-center space-x-4 mt-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        currentResult.isCorrect
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {currentResult.isCorrect ? 'Correct' : 'Incorrect'}
                      </span>
                      <span className="text-sm text-gray-600">
                        Points: {currentResult.pointsEarned} / {currentResult.totalPoints}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setActiveQuestionIndex(Math.max(0, activeQuestionIndex - 1))}
                      disabled={activeQuestionIndex === 0}
                      className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      ←
                    </button>
                    <button
                      onClick={() => setActiveQuestionIndex(Math.min(results.length - 1, activeQuestionIndex + 1))}
                      disabled={activeQuestionIndex === results.length - 1}
                      className="p-2 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      →
                    </button>
                  </div>
                </div>

                {/* Question Text */}
                <div className="mb-6">
                  <div className="text-lg text-gray-900 mb-4">
                    {currentResult.question.question_text}
                  </div>
                </div>

                {/* Answer Options */}
                <div className="space-y-3 mb-6">
                  <h4 className="text-md font-semibold text-gray-700">Answer Options:</h4>
                  {(['A', 'B', 'C', 'D'] as const).map((optionLetter) => {
                    const optionText = getOptionText(currentResult.question, optionLetter)
                    const isCorrectAnswer = optionLetter === currentResult.question.correct_answer
                    const isSelectedAnswer = currentResult.userAnswer?.selected_answer === optionLetter
                    
                    return (
                      <div
                        key={optionLetter}
                        className={`p-4 rounded-lg border-2 ${getAnswerStyle(isCorrectAnswer, isSelectedAnswer)}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            {optionLetter}. {optionText}
                          </span>
                          <div className="flex space-x-2">
                            {isCorrectAnswer && (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                Correct Answer
                              </span>
                            )}
                            {isSelectedAnswer && (
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                                isCorrectAnswer 
                                  ? 'bg-green-100 text-green-800' 
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                Your Answer
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Answer Summary */}
                <div className="border-t pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Your Answer:</h4>
                      <p className={`text-sm font-medium ${
                        !currentResult.userAnswer?.selected_answer 
                          ? 'text-gray-500 italic' 
                          : currentResult.isCorrect 
                          ? 'text-green-600' 
                          : 'text-red-600'
                      }`}>
                        {currentResult.userAnswer?.selected_answer 
                          ? `${currentResult.userAnswer.selected_answer}. ${getOptionText(currentResult.question, currentResult.userAnswer.selected_answer)}`
                          : 'No answer provided-> Auto Submitted the test bcoz you either exited the full screen mode or we detected tab switch'
                        }
                      </p>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Correct Answer:</h4>
                      <p className="text-sm text-green-600 font-medium">
                        {currentResult.question.correct_answer}. {getOptionText(currentResult.question, currentResult.question.correct_answer)}
                      </p>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 mb-2">Result:</h4>
                      <p className={`text-sm font-medium ${
                        currentResult.isCorrect ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {currentResult.isCorrect ? 'Correct ✓' : 'Incorrect ✗'} 
                        <br />
                        <span className="text-xs text-gray-600">
                          {currentResult.pointsEarned}/{currentResult.totalPoints} points
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Overall Statistics */}
            <div className="mt-6 bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Test Statistics</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{correctAnswers}</div>
                  <div className="text-sm text-gray-600">Correct Answers</div>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{totalQuestions - correctAnswers}</div>
                  <div className="text-sm text-gray-600">Incorrect Answers</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{attempt.score}</div>
                  <div className="text-sm text-gray-600">Points Earned</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {calculatePercentage(attempt.score, totalPossiblePoints)}%
                  </div>
                  <div className="text-sm text-gray-600">Overall Score</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
