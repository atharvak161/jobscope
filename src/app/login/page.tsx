import { redirect } from 'next/navigation'

// Auth removed — redirect straight to the jobs feed.
export default function LoginPage() {
  redirect('/jobs')
}
