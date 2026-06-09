/**
 * Minimal next-auth type declarations.
 *
 * next-auth is not yet installed as a package. These declarations are a
 * compile-time shim so that the API routes typecheck cleanly until the package
 * is added by the package manager.
 *
 * When next-auth is installed, delete this file — the real types will take over.
 */

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email?: string | null
      name?: string | null
      image?: string | null
    }
  }

  interface User {
    id: string
    email?: string | null
    name?: string | null
    image?: string | null
  }

  function getServerSession(
    ...args: unknown[]
  ): Promise<Session | null>
}
