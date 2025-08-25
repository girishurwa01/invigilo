'use client'

import { useState, useEffect, useCallback } from 'react'
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

export default function EditTestPage() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testTitle, setTestTitle] = useState('')
  const [testDescription, setTestDescription] = useState('')
  const [timeLimit, setTimeLimit] = useState(30)
  const [showResults, setShowResults] = useState(true)
  const [questions, setQuestions] = useState<Question[]>([])
  const router = useRouter()
  const params = useParams()
  const testId = params.id

  const loadTestData = useCallback(async (userId: string) => {
    try {
      const { data: testData, error: testError } = await supabase
        .from('tests')
        .select('*')
        .eq('id', testId)
        .eq('created_by', userId)
        .single();

      if (testError || !testData) {
        alert('Test not found or you are not authorized to edit it.');
        router.push('/view-marks');
        return;
      }

      const { data: questionsData, error: questionsError } = await supabase
        .from('questions')
        .select('*')
        .eq('test_id', testId)
        .order('question_number');

      if (questionsError) throw questionsError;

      setTestTitle(testData.title);
      setTestDescription(testData.description || '');
      setTimeLimit(testData.time_limit);
      setShowResults(testData.show_results);
      
      const processedQuestions = (questionsData || []).map((q, index) => ({
        ...q,
        question_number: index + 1
      }));
      
      setQuestions(processedQuestions);
    } catch (error) {
      console.error('Error loading test:', error);
      alert('Error loading test. Please try again.');
      router.push('/view-marks');
    }
  }, [router, testId]);

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/login');
        return;
      }
      setUser(session.user);
      await loadTestData(session.user.id);
      setLoading(false);
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!session?.user) {
          router.push('/login');
        } else {
          setUser(session.user);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [router, testId, loadTestData]);

  // Helper function to renumber all questions
  const renumberQuestions = (questionList: Question[]) => {
    return questionList.map((q, index) => ({
      ...q,
      question_number: index + 1
    }))
  }

  const addQuestion = () => {
    const newQuestion: Question = {
      id: `temp-${Date.now()}`,
      question_text: '',
      option_a: '',
      option_b: '',
      option_c: '',
      option_d: '',
      correct_answer: 'A',
      question_number: questions.length + 1,
      points: 1,
    }
    const updatedQuestions = renumberQuestions([...questions, newQuestion])
    setQuestions(updatedQuestions)
  }

  const removeQuestion = (index: number) => {
    if (questions.length > 1) {
      const filteredQuestions = questions.filter((_, i) => i !== index)
      const renumberedQuestions = renumberQuestions(filteredQuestions)
      setQuestions(renumberedQuestions)
    }
  }

  const updateQuestion = (index: number, field: keyof Question, value: string | number) => {
    const updatedQuestions = [...questions]
    updatedQuestions[index] = { 
      ...updatedQuestions[index], 
      [field]: value 
    }
    
    // If we're updating question_number specifically, renumber all questions
    if (field === 'question_number') {
      const renumberedQuestions = renumberQuestions(updatedQuestions)
      setQuestions(renumberedQuestions)
    } else {
      setQuestions(updatedQuestions)
    }
  }

  const validateForm = () => {
    if (!testTitle.trim()) {
      alert('Please enter a test title')
      return false
    }

    if (questions.some(q => 
      !q.question_text.trim() || 
      !q.option_a.trim() || 
      !q.option_b.trim() || 
      !q.option_c.trim() || 
      !q.option_d.trim()
    )) {
      alert('Please fill in all question fields')
      return false
    }

    return true
  }

  const saveTest = async () => {
    if (!validateForm() || !user) return

    setSaving(true)
    try {
      // Update test
      const { error: testError } = await supabase
        .from('tests')
        .update({
          title: testTitle.trim(),
          description: testDescription.trim() || null,
          time_limit: timeLimit,
          total_questions: questions.length,
          show_results: showResults,
          updated_at: new Date().toISOString(),
        })
        .eq('id', testId)
        .eq('created_by', user.id)

      if (testError) throw testError

      // Delete existing questions
      const { error: deleteError } = await supabase
        .from('questions')
        .delete()
        .eq('test_id', testId)

      if (deleteError) throw deleteError

      // Insert updated questions with proper numbering
      const questionsToInsert = questions.map((question, index) => ({
        test_id: testId,
        question_text: question.question_text.trim(),
        option_a: question.option_a.trim(),
        option_b: question.option_b.trim(),
        option_c: question.option_c.trim(),
        option_d: question.option_d.trim(),
        correct_answer: question.correct_answer,
        question_number: index + 1, // Ensure sequential numbering
        points: question.points,
      }))

      const { error: questionsError } = await supabase
        .from('questions')
        .insert(questionsToInsert)

      if (questionsError) throw questionsError

      alert('Test updated successfully!')
      router.push('/view-marks')
    } catch (error) {
      console.error('Error updating test:', error)
      alert('Error updating test. Please try again.')
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
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Edit Test</h1>
          <p className="text-gray-600">Modify your test details and questions</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
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
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
              />
            </div>
            <div className="mt-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={showResults}
                  onChange={(e) => setShowResults(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <span className="ml-2 text-sm text-gray-700">
                  Show results to students after submission
                </span>
              </label>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Questions ({questions.length})</h2>
            {questions.map((question, index) => (
              <div key={`question-${index}-${question.id}`} className="bg-gray-50 rounded-xl p-6 mb-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Question {index + 1}</h3>
                  {questions.length > 1 && (
                    <button
                      onClick={() => removeQuestion(index)}
                      className="text-red-600 hover:text-red-800 p-2 rounded-lg hover:bg-red-50"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Question Text *
                    </label>
                    <textarea
                      value={question.question_text}
                      onChange={(e) => updateQuestion(index, 'question_text', e.target.value)}
                      placeholder="Enter your question"
                      rows={3}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Option A *
                      </label>
                      <input
                        type="text"
                        value={question.option_a}
                        onChange={(e) => updateQuestion(index, 'option_a', e.target.value)}
                        placeholder="Option A"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Option B *
                      </label>
                      <input
                        type="text"
                        value={question.option_b}
                        onChange={(e) => updateQuestion(index, 'option_b', e.target.value)}
                        placeholder="Option B"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Option C *
                      </label>
                      <input
                        type="text"
                        value={question.option_c}
                        onChange={(e) => updateQuestion(index, 'option_c', e.target.value)}
                        placeholder="Option C"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Option D *
                      </label>
                      <input
                        type="text"
                        value={question.option_d}
                        onChange={(e) => updateQuestion(index, 'option_d', e.target.value)}
                        placeholder="Option D"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Correct Answer *
                      </label>
                      <select
                        value={question.correct_answer}
                        onChange={(e) => updateQuestion(index, 'correct_answer', e.target.value as 'A' | 'B' | 'C' | 'D')}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                      >
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                      </select>
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
                        max="10"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <button
              onClick={addQuestion}
              className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-4 px-6 rounded-xl border-2 border-dashed border-gray-300 hover:border-gray-400"
            >
              + Add Another Question
            </button>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-between">
            <Link href="/view-marks">
              <button className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                ← Back
              </button>
            </Link>
            <div className="flex gap-4">
              <button
                onClick={saveTest}
                disabled={saving}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}