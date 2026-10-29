const API_URL = 'http://localhost:5000/api/meetings'

export type Meeting = {
  id: string
  title: string
  roomCode: string
  status: 'SCHEDULED' | 'ACTIVE' | 'ENDED'
  isPrivate: boolean
  scheduledAt: string | null
  durationHours: number
  expiresAt: string | null
  startedAt: string | null
  createdAt: string
  host: {
    id: string
    name: string
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem('viora_token')

  if (!token) {
    throw new Error('Your session has expired. Please log in again.')
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.message || 'The request failed.')
  }

  return data as T
}

export async function createMeeting(title: string, scheduledAt: string | null = null) {
  return request<{ success: boolean; message: string; meeting: Meeting }>('', {
    method: 'POST',
    body: JSON.stringify({ title, scheduledAt }),
  })
}

export async function joinMeeting(roomCode: string) {
  return request<{ success: boolean; message: string; meeting: Meeting }>(
    '/join',
    {
      method: 'POST',
      body: JSON.stringify({ roomCode }),
    },
  )
}

export async function getMeetings() {
  return request<{ success: boolean; meetings: Meeting[] }>('')
}
