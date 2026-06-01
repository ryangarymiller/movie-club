import { supabase } from '../lib/supabase'

export default function NotApproved() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="text-center px-6 max-w-sm">
        <div className="text-4xl mb-4">🔒</div>
        <h2 className="text-xl font-semibold text-white mb-2">Awaiting Approval</h2>
        <p className="text-gray-400 text-sm mb-6">
          Your account is pending admin approval. You'll receive an email once you're approved.
        </p>
        <button
          onClick={() => supabase.auth.signOut()}
          className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
