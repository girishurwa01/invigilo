'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { User } from '@supabase/supabase-js'
import { supabase } from '@/app/lib/supabase'

// Interface for MCQ Questions
interface MCQQuestion {
  id: string
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_answer: 'A' | 'B' | 'C' | 'D'
  question_number: number
  points: number
  isNew?: boolean // Track if this is a new question
}

// Interface for Coding Questions
interface CodingQuestion {
  id: string
  title: string
  problem_statement: string
  points: number
  language_id: number
  question_number: number
  test_cases: string // Stored as a JSON string for the textarea
  isNew?: boolean // Track if this is a new question
}

const LANGUAGE_OPTIONS = [
  { id: 50, name: 'C (GCC 9.2.0)' },
  { id: 54, name: 'C++ (GCC 9.2.0)' },
  { id: 62, name: 'Java' },
  { id: 63, name: 'JavaScript (Node.js)' },
  { id: 71, name: 'Python 3' }
]

export default function EditTestPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testTitle, setTestTitle] = useState('')
  const [testDescription, setTestDescription] = useState('')
  const [timeLimit, setTimeLimit] = useState(30)
  const [showResults, setShowResults] = useState(true)
  const [testType, setTestType] = useState<'mcq' | 'coding' | null>(null)

  // State for different question types
  const [mcqQuestions, setMcqQuestions] = useState<MCQQuestion[]>([])
  const [codingQuestions, setCodingQuestions] = useState<CodingQuestion[]>([])
  const [deletedQuestionIds, setDeletedQuestionIds] = useState<string[]>([])
 
  const router = useRouter()
  const params = useParams()
  const testId = params.id as string

  const loadTestData = useCallback(async (userId: string) => {
    try {
      const { data: testData, error: testError } = await supabase
        .from('tests')
        .select('*')
        .eq('id', testId)
        .eq('created_by', userId)
        .single()

      if (testError || !testData) {
        alert('Test not found or you are not authorized to edit it.')
        router.push('/view-marks')
        return
      }

      setTestTitle(testData.title)
      setTestDescription(testData.description || '')
      setTimeLimit(testData.time_limit)
      setShowResults(testData.show_results)
      setTestType(testData.test_type as 'mcq' | 'coding')

      if (testData.test_type === 'coding') {
        const { data: questionsData, error: questionsError } = await supabase
          .from('coding_questions')
          .select('*')
          .eq('test_id', testId)
          .order('question_number')

        if (questionsError) throw questionsError
       
        const processedQuestions = (questionsData || []).map(q => ({
            ...q,
            test_cases: JSON.stringify(q.test_cases || [], null, 2),
            isNew: false
        }));

        setCodingQuestions(processedQuestions)
      } else { // MCQ - fetch from questions table with question_type = 'mcq'
        const { data: questionsData, error: questionsError } = await supabase
          .from('questions')
          .select('*')
          .eq('test_id', testId)
          .eq('question_type', 'mcq') // Add this filter to ensure we get MCQ questions
          .order('question_number')

        if (questionsError) throw questionsError
        const processedQuestions = (questionsData || []).map(q => ({
          ...q,
          isNew: false
        }));
        setMcqQuestions(processedQuestions)
      }
    } catch (error) {
      console.error('Error loading test:', error)
      alert('Error loading test. Please try again.')
      router.push('/view-marks')
    } finally {
        setLoading(false)
    }
  }, [router, testId])

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        router.push('/login')
        return
      }
      setUser(session.user)
      if (testId) {
        await loadTestData(session.user.id)
      }
    }

    getSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!session?.user) router.push('/login')
        else setUser(session.user)
      }
    )

    return () => subscription.unsubscribe()
  }, [router, testId, loadTestData])

  // --- Generic Handlers ---
  const validateForm = () => {
    if (!testTitle.trim()) {
      alert('Please enter a test title')
      return false
    }

    if (testType === 'mcq') {
        if (mcqQuestions.some(q => !q.question_text.trim() || !q.option_a.trim() || !q.option_b.trim() || !q.option_c.trim() || !q.option_d.trim())) {
            alert('Please fill in all MCQ fields.')
            return false
        }
    } else if (testType === 'coding') {
        for (const [index, q] of codingQuestions.entries()) {
            if (!q.title.trim() || !q.problem_statement.trim()) {
                alert(`Please fill in title and problem statement for Question ${index + 1}`)
                return false
            }
            try {
                JSON.parse(q.test_cases)
            } catch {
                alert(`Invalid JSON in test cases for Question ${index + 1}`)
                return false
            }
        }
    }
    return true
  }

  const saveTest = async () => {
    if (!validateForm() || !user || !testType) return

    setSaving(true)
    try {
      // Update test details
      const { error: testError } = await supabase
        .from('tests')
        .update({
          title: testTitle.trim(),
          description: testDescription.trim() || null,
          time_limit: timeLimit,
          total_questions: testType === 'mcq' ? mcqQuestions.length : codingQuestions.length,
          show_results: showResults,
          updated_at: new Date().toISOString(),
        })
        .eq('id', testId)
        .eq('created_by', user.id)

      if (testError) throw testError

      // Handle questions based on type with proper update/insert logic
      if (testType === 'mcq') {
        // Delete removed questions
        if (deletedQuestionIds.length > 0) {
          const { error: deleteError } = await supabase
            .from('questions')
            .delete()
            .in('id', deletedQuestionIds)
          if (deleteError) throw deleteError
        }

        // Process existing and new questions
        for (const [index, q] of mcqQuestions.entries()) {
          const questionData = {
            test_id: testId,
            question_text: q.question_text.trim(),
            option_a: q.option_a.trim(),
            option_b: q.option_b.trim(),
            option_c: q.option_c.trim(),
            option_d: q.option_d.trim(),
            correct_answer: q.correct_answer,
            question_number: index + 1,
            points: q.points,
            question_type: 'mcq'
          }

          if (q.isNew || q.id.startsWith('temp-')) {
            // Insert new question
            const { error: insertError } = await supabase
              .from('questions')
              .insert(questionData)
            if (insertError) throw insertError
          } else {
            // Update existing question
            const { error: updateError } = await supabase
              .from('questions')
              .update(questionData)
              .eq('id', q.id)
            if (updateError) throw updateError
          }
        }
      } else if (testType === 'coding') {
        // Delete removed questions
        if (deletedQuestionIds.length > 0) {
          const { error: deleteError } = await supabase
            .from('coding_questions')
            .delete()
            .in('id', deletedQuestionIds)
          if (deleteError) throw deleteError
        }

        // Process existing and new questions
        for (const [index, q] of codingQuestions.entries()) {
          const questionData = {
            test_id: testId,
            title: q.title.trim(),
            problem_statement: q.problem_statement.trim(),
            language_id: q.language_id,
            points: q.points,
            created_by: user.id,
            question_number: index + 1,
            test_cases: JSON.parse(q.test_cases),
          }

          if (q.isNew || q.id.startsWith('temp-')) {
            // Insert new question
            const { error: insertError } = await supabase
              .from('coding_questions')
              .insert(questionData)
            if (insertError) throw insertError
          } else {
            // Update existing question
            const { error: updateError } = await supabase
              .from('coding_questions')
              .update(questionData)
              .eq('id', q.id)
            if (updateError) throw updateError
          }
        }
      }

      // Reset deleted questions tracking
      setDeletedQuestionIds([])
      
      alert('Test updated successfully!')
      router.push('/view-marks')
    } catch (error) {
      console.error('Error updating test:', error)
      alert('Error updating test. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  // --- MCQ Handlers ---
  const addMCQQuestion = () => {
    const newQuestion: MCQQuestion = {
      id: `temp-${Date.now()}`,
      question_text: '',
      option_a: '',
      option_b: '',
      option_c: '',
      option_d: '',
      correct_answer: 'A',
      question_number: mcqQuestions.length + 1,
      points: 1,
      isNew: true
    }
    setMcqQuestions([...mcqQuestions, newQuestion])
  }

  const removeMCQQuestion = (index: number) => {
    if (mcqQuestions.length > 1) {
      const questionToRemove = mcqQuestions[index]
      
      // If it's not a new question, add it to deleted list
      if (!questionToRemove.isNew && !questionToRemove.id.startsWith('temp-')) {
        setDeletedQuestionIds(prev => [...prev, questionToRemove.id])
      }
      
      setMcqQuestions(mcqQuestions.filter((_, i) => i !== index))
    }
  }

  const updateMCQQuestion = (index: number, field: keyof MCQQuestion, value: string | number) => {
    const updated = [...mcqQuestions]
    updated[index] = { ...updated[index], [field]: value }
    setMcqQuestions(updated)
  }

  // --- Coding Handlers ---
  const addCodingQuestion = () => {
    const newQuestion: CodingQuestion = {
      id: `temp-${Date.now()}`,
      title: '',
      problem_statement: '',
      points: 5,
      language_id: 63,
      question_number: codingQuestions.length + 1,
      test_cases: '[]',
      isNew: true
    }
    setCodingQuestions([...codingQuestions, newQuestion])
  }

  const removeCodingQuestion = (index: number) => {
    if (codingQuestions.length > 1) {
      const questionToRemove = codingQuestions[index]
      
      // If it's not a new question, add it to deleted list
      if (!questionToRemove.isNew && !questionToRemove.id.startsWith('temp-')) {
        setDeletedQuestionIds(prev => [...prev, questionToRemove.id])
      }
      
      setCodingQuestions(codingQuestions.filter((_, i) => i !== index))
    }
  }

  const updateCodingQuestion = (index: number, field: keyof CodingQuestion, value: string | number) => {
    const updated = [...codingQuestions]
    updated[index] = { ...updated[index], [field]: value }
    setCodingQuestions(updated)
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <div className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="text-2xl font-bold text-indigo-600">Invigilo</Link>
            <div className="flex items-center space-x-4">
              <span className="text-gray-700">Welcome, {user?.user_metadata?.full_name || user?.email}</span>
              <button onClick={() => supabase.auth.signOut()} className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg">Sign Out</button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Edit {testType?.toUpperCase()} Test</h1>
        <p className="text-gray-600 mb-8">Modify your test details and questions</p>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Test Information */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Test Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Test Title *</label>
                    <input type="text" value={testTitle} onChange={(e) => setTestTitle(e.target.value)} className="w-full p-2 border border-gray-300 rounded-lg bg-white text-gray-900" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Time Limit (minutes)</label>
                    <input type="number" value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))} min="1" max="180" className="w-full p-2 border border-gray-300 rounded-lg bg-white text-gray-900" />
                </div>
            </div>
            <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea value={testDescription} onChange={(e) => setTestDescription(e.target.value)} rows={3} className="w-full p-2 border border-gray-300 rounded-lg bg-white text-gray-900" />
            </div>
            <div className="mt-4">
              <label className="flex items-center">
                <input type="checkbox" checked={showResults} onChange={(e) => setShowResults(e.target.checked)} className="h-4 w-4 text-blue-600 rounded" />
                <span className="ml-2 text-sm text-gray-700">Show results to students after submission</span>
              </label>
            </div>
          </div>

          {/* Conditional Question Editor */}
          {testType === 'mcq' && (
            <div id="mcq-editor">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">MCQ Questions ({mcqQuestions.length})</h2>
              {mcqQuestions.map((q, index) => (
                <div key={q.id} className="bg-gray-50 rounded-xl p-6 mb-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium">
                      Question {index + 1} 
                      {q.isNew && <span className="text-green-600 text-sm ml-2">(New)</span>}
                    </h3>
                    <button onClick={() => removeMCQQuestion(index)} className="text-red-600 hover:text-red-800">Remove</button>
                  </div>
                  <div className="space-y-4">
                    <textarea value={q.question_text} onChange={(e) => updateMCQQuestion(index, 'question_text', e.target.value)} placeholder="Question Text" rows={3} className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input type="text" value={q.option_a} onChange={(e) => updateMCQQuestion(index, 'option_a', e.target.value)} placeholder="Option A" className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900" />
                        <input type="text" value={q.option_b} onChange={(e) => updateMCQQuestion(index, 'option_b', e.target.value)} placeholder="Option B" className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900" />
                        <input type="text" value={q.option_c} onChange={(e) => updateMCQQuestion(index, 'option_c', e.target.value)} placeholder="Option C" className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900" />
                        <input type="text" value={q.option_d} onChange={(e) => updateMCQQuestion(index, 'option_d', e.target.value)} placeholder="Option D" className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Correct Answer</label>
                          <select value={q.correct_answer} onChange={(e) => updateMCQQuestion(index, 'correct_answer', e.target.value as 'A' | 'B' | 'C' | 'D')} className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900">
                              <option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Points</label>
                          <input type="number" value={q.points} onChange={(e) => updateMCQQuestion(index, 'points', Number(e.target.value))} min="1" max="10" className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900" />
                        </div>
                    </div>
                  </div>
                </div>
              ))}
              <button onClick={addMCQQuestion} className="w-full bg-gray-100 hover:bg-gray-200 p-4 rounded-xl border-2 border-dashed border-gray-300 text-gray-600 font-medium">+ Add MCQ Question</button>
            </div>
          )}

          {testType === 'coding' && (
            <div id="coding-editor">
              <h2 className="text-xl font-semibold text-gray-900 mb-6">Coding Questions ({codingQuestions.length})</h2>
              {codingQuestions.map((q, index) => (
                <div key={q.id} className="bg-gray-50 rounded-xl p-6 mb-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium">
                      Question {index + 1}
                      {q.isNew && <span className="text-green-600 text-sm ml-2">(New)</span>}
                    </h3>
                    <button onClick={() => removeCodingQuestion(index)} className="text-red-600 hover:text-red-800">Remove</button>
                  </div>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Question Title</label>
                        <input type="text" value={q.title} onChange={(e) => updateCodingQuestion(index, 'title', e.target.value)} placeholder="Question Title" className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Programming Language</label>
                        <select value={q.language_id} onChange={(e) => updateCodingQuestion(index, 'language_id', Number(e.target.value))} className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900">
                            {LANGUAGE_OPTIONS.map(lang => (<option key={lang.id} value={lang.id}>{lang.name}</option>))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Problem Statement</label>
                        <textarea value={q.problem_statement} onChange={(e) => updateCodingQuestion(index, 'problem_statement', e.target.value)} placeholder="Problem Statement" rows={8} className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Test Cases (JSON Format)</label>
                        <textarea value={q.test_cases} onChange={(e) => updateCodingQuestion(index, 'test_cases', e.target.value)} placeholder='[{"input": "5", "expected_output": "5"}]' rows={4} className="w-full p-2 border border-gray-300 rounded font-mono text-sm bg-white text-gray-900" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Points</label>
                        <input type="number" value={q.points} onChange={(e) => updateCodingQuestion(index, 'points', Number(e.target.value))} min="1" max="20" className="w-full p-2 border border-gray-300 rounded bg-white text-gray-900" />
                      </div>
                    </div>
                </div>
              ))}
              <button onClick={addCodingQuestion} className="w-full bg-gray-100 hover:bg-gray-200 p-4 rounded-xl border-2 border-dashed border-gray-300 text-gray-600 font-medium">+ Add Coding Question</button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between mt-8">
            <Link href="/view-marks">
                <button className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50">← Back</button>
            </Link>
            <button onClick={saveTest} disabled={saving} className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg disabled:bg-blue-300">
                {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}