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

  const [testTitle, setTestTitle] = useState('')
  const [testDescription, setTestDescription] = useState('')
  const [timeLimit, setTimeLimit] = useState(60)
  const [questions, setQuestions] = useState<CodingQuestion[]>([
    {
      id: crypto.randomUUID(),
      title: '',
      problem_statement: '',
      points: 5,
      language_id: 63
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
  }, [router])

  const addQuestion = () => {
    const newQuestion: CodingQuestion = {
      id: crypto.randomUUID(),
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

    if (timeLimit < 1 || timeLimit > 180) {
      alert('Time limit must be between 1 and 180 minutes')
      return false
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      if (!q.title.trim()) {
        alert(`Please enter a title for Question ${i + 1}`)
        return false
      }
      if (!q.problem_statement.trim()) {
        alert(`Please enter a problem statement for Question ${i + 1}`)
        return false
      }
      if (q.points < 1 || q.points > 20) {
        alert(`Points for Question ${i + 1} must be between 1 and 20`)
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
      const { data: testCodeData, error: testCodeError } = await supabase.rpc('generate_test_code')
      
      if (testCodeError) {
        console.error('Test code generation error:', testCodeError)
        throw new Error(`Failed to generate test code: ${testCodeError.message}`)
      }
      
      if (!testCodeData) {
        throw new Error('No test code returned from database')
      }
      
      const testCode = testCodeData

      // Create the test
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

      if (testError) {
        console.error('Test creation error:', testError)
        throw new Error(`Failed to create test: ${testError.message}`)
      }

      if (!createdTest) {
        throw new Error('No test data returned after creation')
      }

      // Prepare questions for insertion
      const questionsToInsert = questions.map((question, index) => ({
        test_id: createdTest.id,
        title: question.title.trim(),
        problem_statement: question.problem_statement.trim(),
        language_id: question.language_id,
        points: question.points,
        created_by: user.id,
        question_number: index + 1,
        test_cases: [],
        default_code: '',
        solution_template: ''
      }))

      // Insert all questions
      const { error: questionsError } = await supabase
        .from('coding_questions')
        .insert(questionsToInsert)

      if (questionsError) {
        console.error('Questions insertion error:', questionsError)
        // If questions fail to insert, we should clean up the test
        await supabase.from('tests').delete().eq('id', createdTest.id)
        throw new Error(`Failed to create questions: ${questionsError.message}`)
      }

      alert(`Test created successfully! Test Code: ${testCode}`)
      router.push('/view-marks')
      
    } catch (error: unknown) {
      console.error('Error creating test:', error)
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
            <Link href="/" className="text-2xl font-bold text-indigo-600">Invigilo</Link>
            <div className="flex items-center space-x-4">
              <span className="font-medium">Welcome, {user?.user_metadata?.full_name || user?.email}</span>
              <button onClick={() => supabase.auth.signOut()} className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg">
                Sign Out
              </button>
            </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Coding Test</h1>
        <p className="text-gray-600 mb-8">Design your coding challenge</p>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Test Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Test Title *</label>
                <input 
                  type="text" 
                  value={testTitle} 
                  onChange={(e) => setTestTitle(e.target.value)} 
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-black placeholder-gray-500"
                  style={{ color: '#000000 !important', backgroundColor: '#ffffff !important' }}
                  placeholder="Enter test title"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Time Limit (minutes)</label>
                <input 
                  type="number" 
                  value={timeLimit} 
                  onChange={(e) => setTimeLimit(Number(e.target.value))} 
                  min="1" 
                  max="180" 
                  className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-black placeholder-gray-500"
                  style={{ color: '#000000 !important', backgroundColor: '#ffffff !important' }}
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
              <textarea 
                value={testDescription} 
                onChange={(e) => setTestDescription(e.target.value)} 
                rows={3} 
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-black placeholder-gray-500"
                style={{ color: '#000000 !important', backgroundColor: '#ffffff !important' }}
                placeholder="Optional test description"
              />
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Coding Questions ({questions.length})</h2>
            {questions.map((question, index) => (
              <div key={question.id} className="bg-gray-50 rounded-xl p-6 mb-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Question {index + 1}</h3>
                  {questions.length > 1 && (
                    <button 
                      onClick={() => removeQuestion(index)} 
                      className="text-red-600 hover:text-red-800 px-3 py-1 rounded border border-red-200 hover:bg-red-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Question Title *</label>
                    <input 
                      type="text" 
                      value={question.title} 
                      onChange={(e) => updateQuestion(index, 'title', e.target.value)} 
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-black placeholder-gray-500"
                      style={{ color: '#000000 !important', backgroundColor: '#ffffff !important' }}
                      placeholder="Enter question title"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Programming Language *</label>
                    <select 
                      value={question.language_id} 
                      onChange={(e) => updateQuestion(index, 'language_id', Number(e.target.value))} 
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-black"
                      style={{ color: '#000000 !important', backgroundColor: '#ffffff !important' }}
                    >
                      {LANGUAGE_OPTIONS.map(lang => (
                        <option key={lang.id} value={lang.id} style={{ color: '#000000', backgroundColor: '#ffffff' }}>{lang.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Problem Statement *</label>
                    <textarea 
                      value={question.problem_statement} 
                      onChange={(e) => updateQuestion(index, 'problem_statement', e.target.value)} 
                      rows={8} 
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-black placeholder-gray-500"
                      style={{ color: '#000000 !important', backgroundColor: '#ffffff !important' }}
                      placeholder="Describe the coding problem, include input/output examples, constraints, etc."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Points</label>
                    <input 
                      type="number" 
                      value={question.points} 
                      onChange={(e) => updateQuestion(index, 'points', Number(e.target.value))} 
                      min="1" 
                      max="20" 
                      className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-black placeholder-gray-500"
                      style={{ color: '#000000 !important', backgroundColor: '#ffffff !important' }}
                    />
                  </div>
                </div>
              </div>
            ))}
            <button 
              onClick={addQuestion} 
              className="w-full bg-gray-100 p-4 rounded-xl border-2 border-dashed border-gray-300 hover:bg-gray-200 hover:border-gray-400 transition-colors text-black font-medium"
            >
              + Add Another Question
            </button>
          </div>

          <div className="flex justify-between mt-8">
            <Link href="/create-test">
              <button className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">← Back</button>
            </Link>
            <button 
              onClick={saveTest} 
              disabled={saving} 
              className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Creating...' : 'Create Test'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}