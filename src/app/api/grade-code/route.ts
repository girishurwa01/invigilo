import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

// Environment variables
const JUDGE0_API_URL = 'https://judge0-ce.p.rapidapi.com'
const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY!
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!

/**
 * Defines the structure of a question object for type safety.
 */
interface Question {
  id: string;
  problem_statement: string;
  points: number;
}

/**
 * A new function to validate that the submitted code isn't empty or just comments.
 * This is the first line of defense against meaningless submissions.
 * @param code The user's submitted code.
 * @returns boolean True if the code has functional lines, false otherwise.
 */
function isCodeSubstantial(code: string): boolean {
  if (!code || code.trim() === '') {
    return false
  }
  // This regex checks for any line that is NOT just whitespace or a comment.
  const substantialLineRegex = /^(?!\s*(\/\/|#|\/\*|\*|\s*$)).+/
  return code.split('\n').some(line => substantialLineRegex.test(line))
}


async function runOnJudge0(language_id: number, source_code: string) {
    try {
        console.log(`Sending to Judge0: Language ${language_id}, Code length: ${source_code.length}`)
        
        const response = await fetch(`${JUDGE0_API_URL}/submissions?base64_encoded=false&wait=true`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-RapidAPI-Key': JUDGE0_API_KEY,
                'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
            },
            body: JSON.stringify({
                language_id,
                source_code,
                stdin: "",
            }),
        })

        if (!response.ok) {
            const errorText = await response.text()
            console.error('Judge0 API error response:', errorText)
            throw new Error(`Judge0 API error: ${response.status} ${response.statusText}`)
        }
        
        const result = await response.json()
        console.log('Judge0 result:', result)
        return result
    } catch (error) {
        console.error('Judge0 execution error:', error)
        throw error
    }
}

async function evaluateWithAI(userCode: string, languageId: number, question: Question, compilationStatus: string) {
    console.log('Starting AI evaluation...')
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY environment variable is missing')
    }

    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
        const model = genAI.getGenerativeModel({ 
            model: 'gemini-1.5-flash',
            generationConfig: {
                temperature: 0.2,
                topP: 0.9,
                topK: 40,
                maxOutputTokens: 1024,
            }
        })

        const languageNames = { 50: 'C', 54: 'C++', 62: 'Java', 63: 'JavaScript', 71: 'Python' }
        const languageName = languageNames[languageId as keyof typeof languageNames] || 'Unknown Language'
        
        const prompt = `
          Your task is to act as a fair and helpful programming instructor. Grade the user's code solution for the given problem.

          PROBLEM STATEMENT: """${question.problem_statement}"""

          USER'S CODE (${languageName}):
          """
          ${userCode}
          """
          
          The code's compilation status is: "${compilationStatus}".

          Please evaluate the code based on the problem's requirements and provide a response in a valid JSON object format ONLY.

          GRADING CRITERIA (Total Score: ${question.points} points):
          1.  **Correctness**: Does the code solve the problem correctly? This is the most important factor.
          2.  **Efficiency & Quality**: Is the solution reasonably efficient and the code well-written?

          Provide a JSON object with this exact structure:
          {
            "total_score": <integer from 0 to ${question.points}>,
            "feedback": "Provide brief, constructive feedback explaining the score. Focus on what the user did well and where they can improve.",
            "suggestions": "Offer one or two specific tips for improvement."
          }

          Base the 'total_score' primarily on correctness. A fully correct and working solution should receive the maximum score of ${question.points}. A partially correct solution should receive partial credit. If the code compiles but is logically incorrect, it should still receive at least 1 point for effort if it's a genuine attempt.
        `

        console.log('Sending lenient prompt to Gemini...')
        
        const result = await model.generateContent(prompt)
        const responseText = await result.response.text()
        
        console.log('Gemini raw response:', responseText)
        
        const cleanedResponse = responseText.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '')
        
        const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
            throw new Error('No JSON object found in AI response')
        }
        
        const parsed = JSON.parse(jsonMatch[0])
        console.log('Parsed AI result:', parsed)
        
        if (typeof parsed.total_score !== 'number') {
            throw new Error('Invalid total_score in AI response')
        }

        const { total_score, feedback, suggestions } = parsed;

        // Ensure suggestions is always a string to prevent frontend errors
        const finalSuggestions = Array.isArray(suggestions)
          ? suggestions.join(' ')
          : suggestions || 'Keep practicing!';


        return {
            total_score: Math.min(total_score, question.points), // Ensure score doesn't exceed max points
            overall_feedback: feedback || 'Evaluation completed.',
            suggestions: finalSuggestions,
        }
        
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown AI error'
        console.error('AI evaluation error details:', error)
        throw new Error(`AI evaluation failed: ${errorMessage}`)
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { userCode, languageId, question } = body

        console.log('=== GRADING REQUEST START ===')
        console.log('Language ID:', languageId, 'Question ID:', question?.id)

        if (!userCode || !languageId || !question) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        if (!isCodeSubstantial(userCode)) {
            console.log('Submission failed pre-check: No substantial code found.')
            return NextResponse.json({
                success: true,
                compilationStatus: 'No substantial code submitted.',
                executionTime: 0,
                memoryUsed: 0,
                totalScore: 0,
                maxScore: question.points,
                aiFeedback: {
                    total_score: 0,
                    overall_feedback: 'Your submission was either empty or only contained comments. Please write a functional solution.',
                    suggestions: 'Start by writing code that attempts to solve the problem described.'
                }
            })
        }

        let compilationStatus = 'Error'
        let executionTime = 0
        let memoryUsed = 0

        try {
            console.log('Step 1: Judge0 compilation check')
            const judgeResult = await runOnJudge0(languageId, userCode)
            
            if (judgeResult.status.id <= 3) {
                compilationStatus = 'Accepted'
                executionTime = judgeResult.time ? parseFloat(judgeResult.time) * 1000 : 0
                memoryUsed = judgeResult.memory || 0
            } else {
                compilationStatus = judgeResult.status.description || 'Compilation Error'
            }
        } catch (judgeError) {
            console.error('Judge0 failed:', judgeError)
            compilationStatus = 'Judge0 Service Error'
        }

        let aiFeedback = null
        let totalScore = 0

        try {
            console.log('Step 2: AI evaluation')
            aiFeedback = await evaluateWithAI(userCode, languageId, question, compilationStatus)
            totalScore = aiFeedback.total_score
        } catch (aiError) {
            console.error('AI evaluation failed:', aiError)
            
            totalScore = (compilationStatus === 'Accepted' && question.points > 0) ? 1 : 0
            aiFeedback = {
                total_score: totalScore,
                overall_feedback: `The AI grader is currently unavailable. Your score is based on successful compilation.`,
                suggestions: 'Your code compiles successfully. Please try submitting again later for a full evaluation.'
            }
        }

        const response = {
            success: true,
            compilationStatus,
            executionTime,
            memoryUsed,
            totalScore,
            maxScore: question.points,
            aiFeedback,
        }

        console.log('=== GRADING REQUEST END ===')
        return NextResponse.json(response)

    } catch (error: unknown) {
        console.error("Critical grading error:", error)
        const errorMessage = error instanceof Error ? error.message : 'Internal server error';
        return NextResponse.json({
            success: false,
            error: errorMessage
        }, { status: 500 })
    }
}
