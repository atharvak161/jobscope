import { auth } from '@/lib/auth-config'

export interface SessionUser {
  id: string
  email: string
  name?: string
}

export async function getSession(): Promise<SessionUser | null> {
  const session = await auth()
  if (!session?.user?.email) return null
  return {
    id: (session.user as { id?: string }).id ?? session.user.email,
    email: session.user.email,
    name: session.user.name ?? undefined,
  }
}
