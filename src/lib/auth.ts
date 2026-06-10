export interface SessionUser {
  id: string
  email: string
  name?: string
}

// Auth removed — local personal tool. Always return the single local user.
export async function getSession(): Promise<SessionUser> {
  return {
    id: 'local-user',
    email: 'local@jobscope.local',
    name: 'Local User',
  }
}
