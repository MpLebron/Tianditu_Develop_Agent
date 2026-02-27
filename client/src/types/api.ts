export interface ChatResponse {
  success: boolean
  data: {
    code: string | null
    response: string
    error: string | null
  }
}

export interface FixResponse {
  success: boolean
  data: {
    code: string
    explanation: string
    fixed: boolean
  }
}
