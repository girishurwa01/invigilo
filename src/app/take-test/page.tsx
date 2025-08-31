'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function TestSelection() {
  const router = useRouter()
  const [mcqTestCode, setMcqTestCode] = useState('')

  const handleMcqTest = () => {
    if (!mcqTestCode.trim()) {
      alert('Please enter a valid test code for MCQ test')
      return
    }
    router.push(`/take-test/${mcqTestCode}`)
  }

  const handleCodingTest = () => {
    router.push('/take-coding-test')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
      <div className="max-w-3xl mx-auto px-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Choose Your Test Type</h1>
          <p className="text-gray-600 mb-8">Select whether you want to take an MCQ test or a coding test.</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gray-50 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">MCQ Test</h2>
              <p className="text-gray-600 mb-4">Answer multiple-choice questions with a time limit.</p>
              <input
                type="text"
                value={mcqTestCode}
                onChange={(e) => setMcqTestCode(e.target.value)}
                placeholder="Enter MCQ Test Code"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleMcqTest}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200"
              >
                Start MCQ Test
              </button>
            </div>
            <div className="bg-gray-50 rounded-lg p-6">
              <h2 className="text-xl font-semibold text-gray-800 mb-4">Coding Test</h2>
              <p className="text-gray-600 mb-4">Solve programming challenges in a coding environment.</p>
              <button
                onClick={handleCodingTest}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200"
              >
                Start Coding Test
              </button>
            </div>
          </div>
          
          <div className="mt-8">
            <button
              onClick={() => router.push('/dashboard')}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}