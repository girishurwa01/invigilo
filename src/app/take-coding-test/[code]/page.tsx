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

interface FeedbackCriterion {
  score: number;
  feedback: string;
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

const LANGUAGE_NAMES: Record<number, string> = {
  50: 'C (GCC 9.2.0)',
  54: 'C++ (GCC 9.2.0)',
  62: 'Java',
  63: 'JavaScript (Node.js)',
  71: 'Python 3'
}

const MONACO_LANGUAGES: Record<number, string> = {
  50: 'c',
  54: 'cpp',
  62: 'java',
  63: 'javascript',
  71: 'python'
}

const DEFAULT_CODE_TEMPLATES: Record<number, string> = {
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
  const [showWarning, setShowWarning] = useState<'fullscreen' | 'visibility' | null>(null)
  const [countdown, setCountdown] = useState(10)
  const [warningTimer, setWarningTimer] = useState<NodeJS.Timeout | null>(null)
  const submissionInProgress = useRef(false)
  const router = useRouter()

  const loadTestData = useCallback(async (userId: string) => {
    try {
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

      // Check if user has ALREADY COMPLETED this test
      const { data: attempts, error: attemptError } = await supabase
        .from('test_attempts')
        .select('id')
        .eq('test_id', test.id)
        .eq('user_id', userId)
        .not('completed_at', 'is', null)
        .limit(1)

      if (attemptError) {
        throw new Error(attemptError.message)
      }

      if (attempts && attempts.length > 0) {
        setError('You have already completed this coding test. Redirecting to view your marks.')
        setTimeout(() => router.push('/view-marks'), 2000)
        return
      }
      
      const { data: questionsData, error: questionsError } = await supabase
        .from('coding_questions')
        .select('*')
        .eq('test_id', test.id)
        .order('question_number')

      if (questionsError || !questionsData || questionsData.length === 0) {
        throw new Error('No questions found for this coding test.')
      }

      setTestData(test)
      setQuestions(questionsData)
      
      // Always start fresh, no resume functionality
      const initialAnswers = questionsData.map(q => ({
        question_id: q.id,
        code_submission: DEFAULT_CODE_TEMPLATES[q.language_id] || '',
        compilation_status: 'Not Submitted',
        points_earned: 0
      }))
      setUserAnswers(initialAnswers)
      setTimeLeft(test.time_limit * 60)
      
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(`Error loading coding test: ${errorMessage}`)
    } finally {
        setLoading(false)
    }
  }, [code, router])

  const submitTest = useCallback(async (reason: 'timeUp' | 'fullscreenExit' | 'visibilityExit' | 'manual' = 'timeUp') => {
    if (submissionInProgress.current || testSubmitted || !user || !testData) {
      return;
    }
  
    console.log('Submitting coding test due to:', reason);
    submissionInProgress.current = true;
    setSubmitting(true);
    setTestSubmitted(true);

    // Clear any active warning timer
    if (warningTimer) {
      clearInterval(warningTimer);
      setWarningTimer(null);
    }
  
    try {
      const totalScore = userAnswers.reduce((sum, answer) => sum + (answer.points_earned || 0), 0);
      const timeTaken = Math.ceil((testData.time_limit * 60 - timeLeft) / 60);

      // Step 1: Create the single, final test_attempts record
      const { data: newAttempt, error: attemptError } = await supabase
        .from('test_attempts')
        .insert({
          test_id: testData.id,
          user_id: user.id,
          score: totalScore,
          total_questions: questions.length,
          time_taken: timeTaken,
          completed_at: new Date().toISOString(),
          answers: userAnswers,
        })
        .select('id')
        .single();

      if (attemptError) {
        if (attemptError.code === '23505') { // Handle unique constraint violation
            throw new Error("You have already submitted this test.");
        }
        throw new Error(`Failed to create test attempt record: ${attemptError.message}`);
      }
      
      const attemptId = newAttempt.id;

      // Step 2: Save all individual coding answers linked to the new attemptId
      const answersToInsert = userAnswers.map(answer => ({
          attempt_id: attemptId,
          question_id: answer.question_id,
          code_submission: answer.code_submission || '',
          compilation_status: answer.compilation_status || 'Not Submitted',
          execution_time: answer.execution_time || null,
          memory_used: answer.memory_used || null,
          points_earned: answer.points_earned || 0,
          ai_feedback: answer.ai_feedback ? JSON.stringify(answer.ai_feedback) : null,
      }));
      
      if (answersToInsert.length > 0) {
          const { error: answersError } = await supabase
            .from('user_coding_answers')
            .insert(answersToInsert);
    
          if (answersError) {
            console.error(`Failed to save detailed answers, but the main attempt was recorded:`, answersError);
          }
      }
  
      console.log(`Test submitted successfully. Final Score: ${totalScore}`);
      
      const totalPossibleScore = questions.reduce((sum, q) => sum + q.points, 0);
      alert(
        reason === 'timeUp'
          ? `Time&apos;s up! Your coding test was submitted automatically. Score: ${totalScore}/${totalPossibleScore}`
          : reason === 'fullscreenExit'
          ? `Test submitted due to exiting full screen mode. Score: ${totalScore}/${totalPossibleScore}`
          : reason === 'visibilityExit'
          ? `Test submitted due to switching tabs/windows (Alt+Tab detected). Score: ${totalScore}/${totalPossibleScore}`
          : `Coding test submitted successfully. Score: ${totalScore}/${totalPossibleScore}`
      );
  
      router.push('/view-marks');
  
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error submitting coding test:', error);
      alert(`Error submitting test: ${errorMessage}`);
      submissionInProgress.current = false;
      setSubmitting(false);
      setTestSubmitted(false);
    }
  }, [user, testData, userAnswers, timeLeft, questions, router, testSubmitted, warningTimer]);

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

  // Enter fullscreen when test starts
  useEffect(() => {
    if (testStarted) {
      enterFullscreen()
    }
  }, [testStarted])

  // Monitor fullscreen and visibility changes
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

  // Prevent browser refresh/close during test
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (testStarted && !submitting && !testSubmitted) {
        e.preventDefault()
        e.returnValue = 'Your coding test progress will be lost. Are you sure you want to leave?'
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

  const updateCode = (questionId: string, code: string) => {
    if (testSubmitted) return
    
    setUserAnswers((prev: UserCodingAnswer[]) => {
      const updated = prev.map((ua: UserCodingAnswer) =>
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

    const defaultTemplate = DEFAULT_CODE_TEMPLATES[currentQ.language_id]
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
        
        const pointsEarned = Math.max(0, Math.min(currentQ.points, result.totalScore || 0))
        
        setUserAnswers((prev: UserCodingAnswer[]) => {
          const updated = prev.map((ua: UserCodingAnswer) =>
            ua.question_id === currentQ.id ? {
              ...ua,
              compilation_status: result.compilationStatus,
              execution_time: result.executionTime,
              memory_used: result.memoryUsed,
              points_earned: pointsEarned,
              ai_feedback: result.aiFeedback
            } : ua
          )
          console.log(`Updated local score for Q${currentQuestion + 1} to ${pointsEarned}`);
          return updated
        })

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

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
          <div className="text-xl text-gray-600 mt-4">Loading coding test...</div>
        </div>
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
                <p className="font-semibold">{questions.reduce((sum: number, q: CodingQuestion) => sum + q.points, 0)} points</p>
              </div>
            </div>
            
            <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-8 text-left">
              <h3 className="font-semibold text-red-800 mb-3">⚠️ Important Instructions</h3>
              <ul className="text-sm text-red-700 space-y-2">
                <li>• Once started, the timer cannot be paused</li>
                <li>• Write code in the provided editor for each question</li>
                <li>• Test your code using the &apos;Run & Grade&apos; button to see your score</li>
                <li>• Each question has its own point value and programming language</li>
                <li>• You can navigate between questions freely</li>
                <li>• Submit your test before the timer runs out</li>
                <li>• Do not refresh or close the browser</li>
                <li>• The test must be taken in full screen mode</li>
                <li>• Do not use Alt+Tab or switch tabs/windows, or the test will be auto-submitted in 10 seconds</li>
              </ul>
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

  const currentTotalScore = userAnswers.reduce((sum: number, answer: UserCodingAnswer) => sum + (answer.points_earned || 0), 0)
  const maxPossibleScore = questions.reduce((sum: number, q: CodingQuestion) => sum + q.points, 0)

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white shadow-lg sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{testData.title}</h1>
              <p className="text-sm text-gray-600">
                Question {currentQuestion + 1} of {questions.length} •{' '}
                {LANGUAGE_NAMES[currentQ?.language_id]} • {currentQ?.points} points
              </p>
            </div>
            <div className="flex items-center space-x-6">
              <div className="text-center">
                <div className="text-sm text-gray-500">Current Score</div>
                <div className="text-lg font-bold text-blue-600">
                  {currentTotalScore}/{maxPossibleScore}
                </div>
              </div>
              <div className="text-center">
                <div className="text-sm text-gray-500">Time Remaining</div>
                <div className={`text-lg font-bold ${timeLeft < 300 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatTime(timeLeft)}
                </div>
              </div>
              <button
                onClick={runCode}
                disabled={runningCode || testSubmitted}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
              >
                {runningCode ? 'Evaluating...' : 'Run & Grade'}
              </button>
              <button
                onClick={() => submitTest('manual')}
                disabled={submitting || testSubmitted}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Submitting...' : testSubmitted ? 'Submitted' : 'Submit Test'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md p-4 sticky top-24">
              <h3 className="font-semibold text-gray-900 mb-4">Questions</h3>
              <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
                {questions.map((q, index) => {
                  const answer = userAnswers[index]
                  const defaultTemplate = DEFAULT_CODE_TEMPLATES[q.language_id]
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
                        {q.points} pts • {LANGUAGE_NAMES[q.language_id]?.split(' ')[0]}
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

          <div className="lg:col-span-3 space-y-6">
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

            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900">Code Editor</h3>
                <div className="flex items-center space-x-4">
                  <span className="text-sm text-gray-500">
                    {LANGUAGE_NAMES[currentQ?.language_id]}
                  </span>
                  <button
                    onClick={() => {
                      const defaultCode = DEFAULT_CODE_TEMPLATES[currentQ?.language_id] || ''
                      if (currentQ) {
                        updateCode(currentQ.id, defaultCode)
                      }
                    }}
                    disabled={testSubmitted}
                    className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded disabled:opacity-50"
                  >
                    Reset Code
                  </button>
                </div>
              </div>
              
              <CodeEditor
                code={currentAnswer?.code_submission || DEFAULT_CODE_TEMPLATES[currentQ?.language_id] || ''}
                language={MONACO_LANGUAGES[currentQ?.language_id] || 'javascript'}
                height="500px"
                onChange={(value) => {
                  if (currentQ) {
                    updateCode(currentQ.id, value || '')
                  }
                }}
                readOnly={testSubmitted}
              />
            </div>

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

            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex justify-between">
                <button
                  onClick={() => setCurrentQuestion(prev => Math.max(0, prev - 1))}
                  disabled={currentQuestion === 0 || testSubmitted}
                  className="flex items-center px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                  <div className="text-sm font-medium text-blue-600">
                    Total Score: {currentTotalScore}/{maxPossibleScore}
                  </div>
                  <button
                    onClick={() => setCurrentQuestion(prev => Math.min(questions.length - 1, prev + 1))}
                    disabled={currentQuestion === questions.length - 1 || testSubmitted}
                    className="flex items-center px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

      {/* Warning Modal */}
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
              {' or your coding test will be automatically submitted in:'}
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