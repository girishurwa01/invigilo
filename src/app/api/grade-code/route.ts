import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

// Environment variables
const JUDGE0_API_URL = 'https://judge0-ce.p.rapidapi.com'
const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY!
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!

/**
 * Defines the expected structure of the question object passed to the API.
 */
interface QuestionPayload {
  id: string;
  problem_statement: string;
  points: number;
}


/**
 * Pre-check 1: A new function to validate that the submitted code isn't empty or just comments.
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

async function evaluateWithAI(userCode: string, languageId: number, question: QuestionPayload, compilationStatus: string) {
    console.log('Starting AI evaluation...')
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY environment variable is missing')
    }

    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
        const model = genAI.getGenerativeModel({ 
            model: 'gemini-1.5-flash',
            generationConfig: {
                temperature: 0.1,
                topP: 0.8,
                topK: 40,
                maxOutputTokens: 1024,
            }
        })

        const languageNames = { 50: 'C', 54: 'C++', 62: 'Java', 63: 'JavaScript', 71: 'Python' }
        const languageName = languageNames[languageId as keyof typeof languageNames] || 'Unknown'
        
        // Pre-check 2: The AI prompt is now much stricter.
        // It's explicitly told to fail submissions that don't make a real attempt.
        const prompt = `
          You are a strict code evaluator for a programming test. Your primary goal is to grade a user's code submission based on multiple criteria.

          **CRITICAL RULE:** If the user's code is empty, contains only comments, is the default template code, or makes NO logical attempt to solve the problem (e.g., just "print('hello')"), you MUST assign a 'total_score' of 0. You must also explain in the 'feedback' field that the submission was not a valid attempt.

          Evaluate this ${languageName} code solution:

          PROBLEM STATEMENT: """${question.problem_statement}"""

          USER'S CODE:
          """
          ${userCode}
          """
          
          The code has already been checked for basic compilation. Its status is: ${compilationStatus}.

          Based on the problem statement and the user's code, provide a response in ONLY a valid JSON object format (no markdown, no extra text). The JSON object must have the following structure:
          {
            "total_score": <integer from 0 to ${question.points}>,
            "correctness_score": <integer from 0 to ${Math.round(question.points * 0.4)}>,
            "quality_score": <integer from 0 to ${Math.round(question.points * 0.25)}>,
            "efficiency_score": <integer from 0 to ${Math.round(question.points * 0.2)}>,
            "syntax_score": <integer from 0 to ${Math.round(question.points * 0.1)}>,
            "understanding_score": <integer from 0 to ${Math.round(question.points * 0.05)}>,
            "feedback": "Provide brief, constructive feedback in under 100 words. Explain the reasoning for the scores.",
            "suggestions": "Offer specific improvement tips in under 50 words."
          }`

        console.log('Sending stricter prompt to Gemini...')
        
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

        // Pre-check 3: Post-evaluation logic to enforce score dependency.
        // If the code isn't correct, it can't be high quality or efficient.
        let { 
            total_score,
            quality_score,
            efficiency_score,
            understanding_score,
            feedback
        } = parsed;

        const {
            correctness_score,
            syntax_score,
            suggestions
        } = parsed;

        if (correctness_score < (question.points * 0.4 * 0.1)) { // If correctness is less than 10% of its possible score
            console.log("Correctness score is near zero. Overriding secondary scores to prevent gaming the system.")
            quality_score = 0
            efficiency_score = 0
            understanding_score = 0
            feedback = "The solution was not correct, so points for code quality, efficiency, and problem understanding were not awarded. " + (feedback || "")
            // Recalculate total score based on the override
            total_score = correctness_score + syntax_score
        }
        
        return {
            total_score: Math.min(total_score, question.points),
            breakdown: {
                correctness: correctness_score || 0,
                code_quality: quality_score || 0,
                efficiency: efficiency_score || 0,
                syntax: syntax_score || 0,
                understanding: understanding_score || 0
            },
            overall_feedback: feedback || 'Evaluation completed',
            suggestions: suggestions || 'Keep practicing!'
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

        // Apply Pre-check 1: Validate for substantial code
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
                    breakdown: {},
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
            
            if (judgeResult.status.id <= 3) { // In Queue, Processing, Accepted
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
            // Fallback scoring is now much less generous.
            totalScore = (compilationStatus === 'Accepted') ? Math.round(question.points * 0.1) : 0 // Max 10% for just compiling
            aiFeedback = {
                total_score: totalScore,
                breakdown: { syntax: totalScore },
                overall_feedback: `AI evaluation was unavailable. Score is based solely on successful compilation.`,
                suggestions: 'The code compiles, but its correctness and quality could not be determined.'
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
        const errorMessage = error instanceof Error ? error.message : 'Internal server error'
        return NextResponse.json({
            success: false,
            error: errorMessage,
            debug: {
                hasGeminiKey: !!GEMINI_API_KEY,
                hasJudge0Key: !!JUDGE0_API_KEY,
                geminiKeyLength: GEMINI_API_KEY?.length || 0
            }
        }, { status: 500 })
    }
}
