// NextAuth v5 configuration — credentials + Google OAuth
// For now: credentials provider only (email/password) for development
// Google OAuth can be added later with GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
import * as NextAuthModule from 'next-auth'
import Credentials from 'next-auth/providers/credentials'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const NextAuth = (NextAuthModule as any).default ?? NextAuthModule

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        // TODO: replace with real DB lookup before production
        // For now: accept any email/password in dev
        if (credentials?.email && credentials?.password) {
          return { id: 'dev-user-id', email: credentials.email as string, name: 'Dev User' }
        }
        return null
      },
    }),
  ],
  session: { strategy: 'jwt' },
  secret: process.env.NEXTAUTH_SECRET,
})
