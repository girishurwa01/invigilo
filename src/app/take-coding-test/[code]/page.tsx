'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/app/lib/supabase'
import CodeEditor from '@/app/components/CodeEditor'

interface CodingQuestion {
  id: string
  title: string
  problem_statement: string
  language_id: number
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
  test_type: string
}

interface AIFeedback {
  total_score: number;
  breakdown: {
      correctness?: number;
      code_quality?: number;
      efficiency?: number;
      syntax?: number;
      understanding?: number;
  };
  overall_feedback: string;
  suggestions: string;
  detailed_feedback?: {
      [key: string]: FeedbackCriterion;
  };
}


interface UserCodingAnswer {
  question_id: string
  code_submission: string
  compilation_status?: string
  execution_time?: number
  memory_used?: number
  points_earned?: number
  ai_feedback?: AIFeedback
}

interface TestResult {
    compilationStatus: string;
    executionTime?: number;
    memoryUsed?: number;
    totalScore: number;
    maxScore: number;
    aiFeedback: AIFeedback;
}

interface FeedbackCriterion {
    score: number;
    feedback: string;
}

const LANGUAGE_NAMES = {
  50: 'C (GCC 9.2.0)',
  54: 'C++ (GCC 9.2.0)',
  62: 'Java',
  63: 'JavaScript (Node.js)',
  71: 'Python 3'
}

const MONACO_LANGUAGES = {
  50: 'c',
  54: 'cpp',
  62: 'java',
  63: 'javascript',
  71: 'python'
}

const DEFAULT_CODE_TEMPLATES = {
  50: `#include <stdio.h>\n\nint main() {\n    // Your code here\n    return 0;\n}`,
  54: `#include <iostream>\nusing namespace std;\n\nint main() {\n    // Your code here\n    return 0;\n}`,
  62: `public class Solution {\n    public static void main(String[] args) {\n        // Your code here\n    }\n}`,
  63: `// Your code here\nconsole.log("Hello World");`,
  71: `# Your code here\nprint("Hello World")`
}

export default function TakeCodingTestMain() {
  const params = useParams()
  const code = params.code as string
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [testData, setTestData] = useState<TestData | null>(null)
  const [questions, setQuestions] = useState<CodingQuestion[]>([])
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [userAnswers, setUserAnswers] = useState<UserCodingAnswer[]>([])
  const [timeLeft, setTimeLeft] = useState(0)
  const [testStarted, setTestStarted] = useState(false)
  const [testSubmitted, setTestSubmitted] = useState(false)
  const [runningCode, setRunningCode] = useState(false)
  const [testResults, setTestResults] = useState<TestResult | null>(null)
  const submissionInProgress = useRef(false)
  const router = useRouter()

  const loadTestData = useCallback(async (userId: string) => {
    try {
      console.log('Loading coding test data for user:', userId, 'test code:', code)
      
      // Get test information
      const { data: test, error: testError } = await supabase
        .from('tests')
        .select('*')
        .ilike('test_code', code)
        .eq('is_active', true)
        .eq('test_type', 'coding')
        .single()

      if (testError || !test) {
        throw new Error('Coding test not found or inactive')
      }

      // Check for existing attempts
      const { data: attempts, error: attemptError } = await supabase
        .from('test_attempts')
        .select('id, completed_at, score')
        .eq('test_id', test.id)
        .eq('user_id', userId)
        .order('completed_at', { ascending: false })

      if (attemptError && attemptError.code !== 'PGRST116') {
        throw new Error(attemptError.message)
      }

      if (attempts && attempts.length > 0) {
        const completedAttempt = attempts.find(attempt => attempt.completed_at !== null)
        if (completedAttempt) {
          setError('You have already completed this coding test. Redirecting to view your marks.')
          setTimeout(() => {
            router.push('/view-marks')
          }, 2000)
          return
        }
      }

      // Get questions from coding_questions table
      const { data: questionsData, error: questionsError } = await supabase
        .from('coding_questions')
        .select('*')
        .eq('test_id', test.id)
        .order('question_number')

      if (questionsError) {
        console.error('Error loading questions:', questionsError)
        throw new Error(`Error loading coding questions: ${questionsError.message}`)
      }

      if (!questionsData || questionsData.length === 0) {
        throw new Error(`No questions found for this coding test (test_id: ${test.id}). Please ensure questions have been created for this test.`)
      }

      setTestData(test)
      setQuestions(questionsData)
      
      // Initialize user answers with default code templates
      setUserAnswers(questionsData.map(q => ({
        question_id: q.id,
        code_submission: DEFAULT_CODE_TEMPLATES[q.language_id as keyof typeof DEFAULT_CODE_TEMPLATES] || '',
        compilation_status: 'Not Submitted',
        points_earned: 0
      })))
      
      setTimeLeft(test.time_limit * 60)
      setLoading(false)
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('Error loading coding test:', error)
      setError(`Error loading coding test: ${errorMessage}`)
      setLoading(false)
    }
  }, [code, router])

  const submitTest = useCallback(async (reason: 'timeUp' | 'manual' = 'timeUp') => {
    if (submissionInProgress.current || testSubmitted || !user || !testData) {
      return
    }

    console.log('Submitting coding test due to:', reason)
    submissionInProgress.current = true
    setSubmitting(true)
    setTestSubmitted(true)

    try {
      // Create test attempt first
      const timeTaken = Math.ceil((testData.time_limit * 60 - timeLeft) / 60)
      
      const { data: attempt, error: attemptError } = await supabase
        .from('test_attempts')
        .insert({
          test_id: testData.id,
          user_id: user.id,
          score: 0, // Will update after grading
          total_questions: questions.length,
          time_taken: timeTaken,
          completed_at: new Date().toISOString(),
          answers: userAnswers // Store as backup
        })
        .select()
        .single()

      if (attemptError) {
        if (attemptError.code === '23505') {
          alert('Test has already been submitted. Redirecting to view marks.')
          router.push('/view-marks')
          return
        }
        throw new Error(attemptError.message)
      }

      // Grade each question and save to user_coding_answers
      let totalScore = 0
      const gradingPromises = userAnswers.map(async (ua, index) => {
        const question = questions[index]
        if (!ua.code_submission || !question) {
          // Save empty submission
          await supabase.from('user_coding_answers').insert({
            attempt_id: attempt.id,
            question_id: ua.question_id,
            code_submission: ua.code_submission || '',
            compilation_status: 'Not Submitted',
            points_earned: 0,
            ai_feedback: 'No code submitted'
          })
          return 0
        }

        try {
          const response = await fetch('/api/grade-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userCode: ua.code_submission,
              languageId: question.language_id,
              question: question
            })
          })

          let gradingResult = {
            compilationStatus: 'Error',
            totalScore: 0,
            executionTime: 0,
            memoryUsed: 0,
            aiFeedback: 'Grading failed'
          }

          if (response.ok) {
            gradingResult = await response.json()
          } else {
            console.error('Grading API error for question:', question.id)
          }

          const pointsEarned = gradingResult.totalScore || 0
          totalScore += pointsEarned

          // Save detailed answer to user_coding_answers
          await supabase.from('user_coding_answers').insert({
            attempt_id: attempt.id,
            question_id: ua.question_id,
            code_submission: ua.code_submission,
            compilation_status: gradingResult.compilationStatus,
            execution_time: gradingResult.executionTime,
            memory_used: gradingResult.memoryUsed,
            points_earned: pointsEarned,
            ai_feedback: JSON.stringify(gradingResult.aiFeedback)
          })

          return pointsEarned
        } catch (error) {
          console.error('Error grading question:', question.id, error)
          
          // Save error submission
          await supabase.from('user_coding_answers').insert({
            attempt_id: attempt.id,
            question_id: ua.question_id,
            code_submission: ua.code_submission,
            compilation_status: 'Error',
            points_earned: 0,
            ai_feedback: 'Error occurred during grading'
          })
          
          return 0
        }
      })

      await Promise.all(gradingPromises)

      // Update test attempt with final score
      const { error: updateError } = await supabase
        .from('test_attempts')
        .update({ score: totalScore })
        .eq('id', attempt.id)

      if (updateError) {
        console.error('Error updating final score:', updateError)
      }

      const totalPossibleScore = questions.reduce((sum, q) => sum + (q.points || 5), 0)
      
      alert(
        reason === 'timeUp'
          ? `Time's up! Your coding test was submitted automatically. Score: ${totalScore}/${totalPossibleScore}`
          : `Coding test submitted successfully. Score: ${totalScore}/${totalPossibleScore}`
      )

      router.push('/view-marks')
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error('Error submitting coding test:', error)
      alert(`Error submitting test: ${errorMessage}`)
      submissionInProgress.current = false
      setSubmitting(false)
      setTestSubmitted(false)
    }
  }, [testSubmitted, user, testData, userAnswers, questions, timeLeft, router])

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
        await loadTestData(session.user.id)
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
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [router, loadTestData])

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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const updateCode = (questionId: string, code: string) => {
    if (testSubmitted) return
    
    setUserAnswers(prev => {
      const updated = prev.map(ua =>
        ua.question_id === questionId ? { ...ua, code_submission: code } : ua
      )
      return updated
    })
  }

  const runCode = async () => {
    const currentQ = questions[currentQuestion]
    const currentAnswer = userAnswers.find(ua => ua.question_id === currentQ?.id)
    
    if (!currentQ || !currentAnswer?.code_submission) {
      alert('Please write some code first!')
      return
    }

    // Check if code is just the default template
    const defaultTemplate = DEFAULT_CODE_TEMPLATES[currentQ.language_id as keyof typeof DEFAULT_CODE_TEMPLATES]
    if (currentAnswer.code_submission.trim() === defaultTemplate?.trim()) {
      alert('Please modify the code before running!')
      return
    }

    setRunningCode(true)
    setTestResults(null)

    try {
      const response = await fetch('/api/grade-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userCode: currentAnswer.code_submission,
          languageId: currentQ.language_id,
          question: currentQ
        })
      })

      if (response.ok) {
        const result = await response.json()
        setTestResults(result)
        
        // Update user answer with test results
        setUserAnswers(prev =>
          prev.map(ua =>
            ua.question_id === currentQ.id ? {
              ...ua,
              compilation_status: result.compilationStatus,
              execution_time: result.executionTime,
              memory_used: result.memoryUsed,
              points_earned: result.totalScore,
              ai_feedback: result.aiFeedback
            } : ua
          )
        )
      } else {
        const error = await response.json()
        alert(`Error running code: ${error.error}`)
      }
    } catch (error) {
      console.error('Error running code:', error)
      alert('Error running code. Please try again.')
    } finally {
      setRunningCode(false)
    }
  }

  const saveProgress = useCallback(async () => {
    if (!user || !testData || testSubmitted) return

    try {
      // Check if attempt exists (in progress, not completed)
      const { data: existingAttempt } = await supabase
        .from('test_attempts')
        .select('id')
        .eq('test_id', testData.id)
        .eq('user_id', user.id)
        .is('completed_at', null)
        .single()

      if (existingAttempt) {
        // Update existing attempt answers
        const { error } = await supabase
          .from('test_attempts')
          .update({ answers: userAnswers })
          .eq('id', existingAttempt.id)

        if (!error) {
          console.log('Progress saved successfully')
        }
      }
    } catch (error) {
      console.error('Error saving progress:', error)
    }
  }, [user, testData, userAnswers, testSubmitted])

  // Auto-save progress every 30 seconds
  useEffect(() => {
    if (!testStarted || testSubmitted) return

    const saveInterval = setInterval(saveProgress, 30000)
    return () => clearInterval(saveInterval)
  }, [testStarted, testSubmitted, saveProgress])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading coding test...</div>
      </div>
    )
  }

  if (error || !testData || questions.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl text-red-600 mb-4">{error || 'Coding test not available'}</div>
          <button
            onClick={() => router.push('/take-coding-test')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg"
          >
            Back to Take Test
          </button>
        </div>
      </div>
    )
  }

  if (!testStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="max-w-3xl mx-auto px-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-4">{testData.title}</h1>
            <p className="text-lg text-gray-600 mb-8">Coding Challenge</p>
            
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
                <span className="text-sm text-gray-500">Total Points</span>
                <p className="font-semibold">{questions.reduce((sum, q) => sum + q.points, 0)} points</p>
              </div>
            </div>
            
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8 text-left">
              <h3 className="font-semibold text-blue-800 mb-3">Coding Test Instructions</h3>
              <ul className="text-sm text-blue-700 space-y-2">
                <li>• Write code in the provided editor for each question</li>
                <li>• Test your code using the &apos;Run & Grade&apos; button to see your score</li>
                <li>• Your code will be evaluated by AI based on multiple criteria</li>
                <li>• Each question has its own point value and programming language</li>
                <li>• You can navigate between questions freely</li>
                <li>• Your progress is auto-saved every 30 seconds</li>
                <li>• Submit before time runs out to avoid losing your work</li>
              </ul>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 text-sm">
              <div className="bg-green-50 p-4 rounded-lg">
                <h4 className="font-semibold text-green-800 mb-2">Supported Languages</h4>
                <div className="text-green-700 space-y-1">
                  {Array.from(new Set(questions.map(q => q.language_id))).map(langId => (
                    <div key={langId}>• {LANGUAGE_NAMES[langId as keyof typeof LANGUAGE_NAMES]}</div>
                  ))}
                </div>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg">
                <h4 className="font-semibold text-yellow-800 mb-2">AI Evaluation Criteria</h4>
                <div className="text-yellow-700 space-y-1">
                  <div>• Correctness (40%)</div>
                  <div>• Code Quality (25%)</div>
                  <div>• Efficiency (20%)</div>
                  <div>• Syntax & Compilation (10%)</div>
                  <div>• Problem Understanding (5%)</div>
                </div>
              </div>
            </div>
            
            <button
              onClick={() => setTestStarted(true)}
              className="bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
            >
              Start Coding Test
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
      {/* Header */}
      <div className="bg-white shadow-lg sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{testData.title}</h1>
              <p className="text-sm text-gray-600">
                Question {currentQuestion + 1} of {questions.length} •
                {LANGUAGE_NAMES[currentQ?.language_id as keyof typeof LANGUAGE_NAMES]} • {currentQ?.points} points
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
                onClick={runCode}
                disabled={runningCode || testSubmitted}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50"
              >
                {runningCode ? 'Evaluating...' : 'Run & Grade'}
              </button>
              <button
                onClick={() => submitTest('manual')}
                disabled={submitting || testSubmitted}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : testSubmitted ? 'Submitted' : 'Submit Test'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Question Navigator */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md p-4 sticky top-24">
              <h3 className="font-semibold text-gray-900 mb-4">Questions</h3>
              <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
                {questions.map((q, index) => {
                  const answer = userAnswers[index]
                  const defaultTemplate = DEFAULT_CODE_TEMPLATES[q.language_id as keyof typeof DEFAULT_CODE_TEMPLATES]
                  const hasCode = answer?.code_submission && answer.code_submission.trim() !== defaultTemplate?.trim()
                  const isCurrent = index === currentQuestion
                  const hasBeenGraded = answer?.points_earned !== undefined && answer?.compilation_status !== 'Not Submitted'
                  
                  return (
                    <button
                      key={index}
                      onClick={() => !testSubmitted && setCurrentQuestion(index)}
                      disabled={testSubmitted}
                      className={`p-3 rounded-lg font-medium text-sm transition-colors disabled:cursor-not-allowed ${
                        isCurrent
                          ? 'bg-green-600 text-white'
                          : hasBeenGraded
                          ? 'bg-purple-100 text-purple-800 hover:bg-purple-200'
                          : hasCode
                          ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      } ${testSubmitted ? 'opacity-50' : ''}`}
                    >
                      Q{index + 1}
                      <br />
                      <span className="text-xs">
                        {q.points} pts • {LANGUAGE_NAMES[q.language_id as keyof typeof LANGUAGE_NAMES]?.split(' ')[0]}
                      </span>
                      {hasBeenGraded && (
                        <div className="text-xs mt-1 font-bold">
                          {answer?.points_earned || 0}/{q.points}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
              
              {testResults && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-semibold text-gray-900 mb-2">Latest Results</h4>
                  <div className="text-sm space-y-1">
                    <div>Status: <span className={`font-medium ${testResults.compilationStatus === 'Accepted' ? 'text-green-600' : 'text-red-600'}`}>
                      {testResults.compilationStatus}
                    </span></div>
                    <div>Score: <span className="font-medium text-blue-600">{testResults.totalScore}/{testResults.maxScore}</span></div>
                    {testResults.executionTime && (
                      <div>Time: <span className="font-medium">{testResults.executionTime}ms</span></div>
                    )}
                    {testResults.aiFeedback && (
                      <div className="mt-2 p-2 bg-blue-50 rounded text-xs">
                        <div className="font-medium text-blue-800">AI Feedback:</div>
                        <div className="text-blue-700">{testResults.aiFeedback.overall_feedback}</div>
                        {testResults.aiFeedback.suggestions && (
                          <div className="text-blue-600 mt-1">
                            <strong>Suggestions:</strong> {testResults.aiFeedback.suggestions}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {/* Problem Statement */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex justify-between items-start mb-4">
                <span className="bg-green-100 text-green-800 text-sm font-medium px-3 py-1 rounded">
                  Question {currentQuestion + 1}
                </span>
                <span className="text-sm text-gray-500">
                  {currentQ?.points} points
                </span>
              </div>
              <div className="prose max-w-none">
                <h2 className="text-lg font-medium text-gray-900 mb-4">{currentQ?.title}</h2>
                <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {currentQ?.problem_statement}
                </div>
              </div>
            </div>

            {/* Code Editor */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Code Editor</h3>
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-gray-500">
                    {LANGUAGE_NAMES[currentQ?.language_id as keyof typeof LANGUAGE_NAMES]}
                  </span>
                  <button
                    onClick={() => {
                      const defaultCode = DEFAULT_CODE_TEMPLATES[currentQ?.language_id as keyof typeof DEFAULT_CODE_TEMPLATES] || ''
                      updateCode(currentQ.id, defaultCode)
                    }}
                    disabled={testSubmitted}
                    className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded disabled:opacity-50"
                  >
                    Reset Code
                  </button>
                </div>
              </div>
              
              <CodeEditor
                code={currentAnswer?.code_submission || DEFAULT_CODE_TEMPLATES[currentQ?.language_id as keyof typeof DEFAULT_CODE_TEMPLATES] || ''}
                language={MONACO_LANGUAGES[currentQ?.language_id as keyof typeof MONACO_LANGUAGES] || 'javascript'}
                height="500px"
                onChange={(value) => {
                  if (currentQ) {
                    updateCode(currentQ.id, value || '')
                  }
                }}
                readOnly={testSubmitted}
              />
            </div>

            {/* Detailed AI Feedback */}
            {testResults && testResults.aiFeedback && testResults.aiFeedback.detailed_feedback && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Detailed AI Evaluation</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(testResults.aiFeedback.detailed_feedback).map(([criterion, data]: [string, FeedbackCriterion]) => (
                    <div key={criterion} className="bg-gray-50 p-4 rounded-lg">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-medium text-gray-800 capitalize">
                          {criterion.replace('_', ' ')}
                        </h4>
                        <span className="text-sm font-bold text-blue-600">
                          {data.score}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">{data.feedback}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex justify-between">
                <button
                  onClick={() => setCurrentQuestion(prev => Math.max(0, prev - 1))}
                  disabled={currentQuestion === 0 || testSubmitted}
                  className="flex items-center px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Previous
                </button>
                <div className="flex items-center space-x-4">
                  <div className="text-sm text-gray-600">
                    Progress: {userAnswers.filter(ua => ua.compilation_status !== 'Not Submitted').length}/{questions.length} evaluated
                  </div>
                  <button
                    onClick={() => setCurrentQuestion(prev => Math.min(questions.length - 1, prev + 1))}
                    disabled={currentQuestion === questions.length - 1 || testSubmitted}
                    className="flex items-center px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
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
      </div>
    </div>
  )
}
