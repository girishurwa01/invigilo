'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/app/lib/supabase'

interface CodingQuestion {
  id: string
  title: string
  problem_statement: string
  points: number
  language_id: number
}

const LANGUAGE_OPTIONS = [
  { id: 50, name: 'C (GCC 9.2.0)' },
  { id: 54, name: 'C++ (GCC 9.2.0)' },
  { id: 62, name: 'Java' },
  { id: 63, name: 'JavaScript (Node.js)' },
  { id: 71, name: 'Python 3' }
]

export default function CreateCodingTest() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  // Test form data
  const [testTitle, setTestTitle] = useState('')
  const [testDescription, setTestDescription] = useState('')
  const [timeLimit, setTimeLimit] = useState(60)
  const [questions, setQuestions] = useState<CodingQuestion[]>([
    {
      id: '1',
      title: '',
      problem_statement: '',
      points: 5,
      language_id: 63 // Default to JavaScript
    }
  ])

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

  const addQuestion = () => {
    const newQuestion: CodingQuestion = {
      id: (questions.length + 1).toString(),
      title: '',
      problem_statement: '',
      points: 5,
      language_id: 63
    }
    setQuestions([...questions, newQuestion])
  }

  const removeQuestion = (index: number) => {
    if (questions.length > 1) {
      const updatedQuestions = questions.filter((_, i) => i !== index)
      setQuestions(updatedQuestions)
    }
  }

  const updateQuestion = (index: number, field: keyof CodingQuestion, value: string | number) => {
    const updatedQuestions = [...questions]
    updatedQuestions[index] = { ...updatedQuestions[index], [field]: value }
    setQuestions(updatedQuestions)
  }

  const validateForm = () => {
    if (!testTitle.trim()) {
      alert('Please enter a test title')
      return false
    }

    for (const q of questions) {
      if (!q.title.trim() || !q.problem_statement.trim()) {
        alert('Please fill in all question fields')
        return false
      }
    }

    return true
  }

  const saveTest = async () => {
    if (!validateForm() || !user) {
      return
    }

    setSaving(true)
    try {
      // Generate test code
      const { data: testCodeData, error: testCodeError } = await supabase
        .rpc('generate_test_code')

      if (testCodeError) throw new Error('Failed to generate test code')
      const testCode = testCodeData

      // Create test
      const { data: createdTest, error: testError } = await supabase
        .from('tests')
        .insert({
          test_code: testCode,
          title: testTitle.trim(),
          description: testDescription.trim() || null,
          created_by: user.id,
          time_limit: timeLimit,
          total_questions: questions.length,
          is_active: true,
          show_results: true,
          test_type: 'coding'
        })
        .select()
        .single()

      if (testError) throw testError

      // Create coding questions
      const questionsToInsert = questions.map((question, index) => ({
        test_id: createdTest.id,
        title: question.title.trim(),
        problem_statement: question.problem_statement.trim(),
        language_id: question.language_id,
        points: question.points,
        created_by: user.id,
        question_number: index + 1,
        test_cases: [], // Empty array since we're not using test cases
        default_code: '', // Empty since teacher doesn't provide default code
        solution_template: '' // Empty
      }))

      const { error: questionsError } = await supabase
        .from('coding_questions')
        .insert(questionsToInsert)

      if (questionsError) throw questionsError

      alert(`Test created successfully! Test Code: ${testCode}`)
      router.push('/view-marks')
    } catch (error: unknown) {
        if (error instanceof Error) {
            alert(`Error creating test: ${error.message}`)
        } else {
            alert('An unknown error occurred while creating the test.')
        }
    } finally {
      setSaving(false)
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
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Coding Test</h1>
          <p className="text-gray-600 font-medium">Design your coding challenge</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Test Information */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Test Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Test Title *
                </label>
                <input
                  type="text"
                  value={testTitle}
                  onChange={(e) => setTestTitle(e.target.value)}
                  placeholder="Enter test title"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Time Limit (minutes)
                </label>
                <input
                  type="number"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(Number(e.target.value))}
                  min="1"
                  max="180"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={testDescription}
                onChange={(e) => setTestDescription(e.target.value)}
                placeholder="Enter test description (optional)"
                rows={3}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          {/* Questions */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Coding Questions ({questions.length})</h2>

            {questions.map((question, index) => (
              <div key={question.id} className="bg-gray-50 rounded-xl p-6 mb-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Question {index + 1}</h3>
                  {questions.length > 1 && (
                    <button
                      onClick={() => removeQuestion(index)}
                      className="text-red-600 hover:text-red-800 p-2 rounded-lg"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Question Title *
                    </label>
                    <input
                      type="text"
                      value={question.title}
                      onChange={(e) => updateQuestion(index, 'title', e.target.value)}
                      placeholder="Enter question title"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Programming Language *
                    </label>
                    <select
                      value={question.language_id}
                      onChange={(e) => updateQuestion(index, 'language_id', Number(e.target.value))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    >
                      {LANGUAGE_OPTIONS.map(lang => (
                        <option key={lang.id} value={lang.id}>
                          {lang.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Problem Statement *
                    </label>
                    <textarea
                      value={question.problem_statement}
                      onChange={(e) => updateQuestion(index, 'problem_statement', e.target.value)}
                      placeholder="Enter problem statement with requirements, constraints, and examples"
                      rows={8}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Points
                    </label>
                    <input
                      type="number"
                      value={question.points}
                      onChange={(e) => updateQuestion(index, 'points', Number(e.target.value))}
                      min="1"
                      max="20"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                </div>
              </div>
            ))}

            <button
              onClick={addQuestion}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-4 px-6 rounded-xl"
            >
              + Add Another Question
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-between">
            <Link href="/create-test">
              <button className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700">
                ← Back
              </button>
            </Link>
            <button
              onClick={saveTest}
              disabled={saving}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg"
            >
              {saving ? 'Creating...' : 'Create Test'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
