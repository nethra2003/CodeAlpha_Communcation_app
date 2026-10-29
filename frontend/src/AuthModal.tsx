import { useState, type FormEvent } from 'react'
import { ArrowLeft, Eye, EyeOff, LoaderCircle, Video, X } from 'lucide-react'
import './AuthModal.css'

const API_URL = 'http://localhost:5000/api/auth'

type AuthMode = 'login' | 'register'

type AuthModalProps = {
  initialMode: AuthMode
  onClose: () => void
  onSuccess: (token: string, user: AuthUser) => void
}

type AuthUser = {
  id: string
  name: string
  email: string
  avatarUrl?: string | null
  role: string
}

export default function AuthModal({
  initialMode,
  onClose,
  onSuccess,
}: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const endpoint =
        mode === 'register' ? '/register' : '/login'

      const payload =
        mode === 'register'
          ? { name: name.trim(), email: email.trim(), password }
          : { email: email.trim(), password }

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.message || 'Something went wrong. Please try again.')
        return
      }

      if (!data.token || !data.user) {
        setError('The server returned an incomplete response.')
        return
      }

      onSuccess(data.token, data.user)
    } catch {
      setError(
        'Unable to connect to Viora. Make sure the backend is running on port 5000.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="auth-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !loading) onClose()
      }}
    >
      <section
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
      >
        <button
          type="button"
          className="auth-close"
          aria-label="Close authentication"
          onClick={onClose}
          disabled={loading}
        >
          <X size={21} />
        </button>

        <div className="auth-brand">
          <span className="auth-brand-icon">
            <Video size={23} />
          </span>
          <span>viora<span className="auth-brand-dot">.</span></span>
        </div>

        <div className="auth-heading">
          <p className="auth-eyebrow">
            {mode === 'register' ? 'YOUR NEXT CHAPTER STARTS HERE' : 'WELCOME BACK'}
          </p>

          <h2 id="auth-title">
            {mode === 'register' ? 'Create your account' : 'Good to see you again.'}
          </h2>

          <p>
            {mode === 'register'
              ? 'Join Viora and bring your team closer.'
              : 'Sign in to continue to your Viora workspace.'}
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === 'register' && (
            <label>
              Full name
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Enter your name"
                minLength={2}
                maxLength={60}
                autoComplete="name"
                required
              />
            </label>
          )}

          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              maxLength={254}
              autoComplete="email"
              required
            />
          </label>

          <label>
            Password
            <span className="auth-password-wrap">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={
                  mode === 'register'
                    ? 'At least 8 characters'
                    : 'Enter your password'
                }
                minLength={mode === 'register' ? 8 : 1}
                maxLength={72}
                autoComplete={
                  mode === 'register' ? 'new-password' : 'current-password'
                }
                required
              />
              <button
                type="button"
                className="auth-password-toggle"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </span>
          </label>

          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="auth-submit"
            disabled={loading}
          >
            {loading ? (
              <>
                <LoaderCircle className="auth-spinner" size={18} />
                Please wait...
              </>
            ) : (
              <>
                {mode === 'register' ? 'Create account' : 'Log in'}
                <span aria-hidden="true"> →</span>
              </>
            )}
          </button>
        </form>

        <p className="auth-switch">
          {mode === 'register'
            ? 'Already have an account?'
            : "Don't have an account?"}{' '}
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setMode(mode === 'register' ? 'login' : 'register')
              setError('')
              setPassword('')
            }}
          >
            {mode === 'register' ? 'Log in' : 'Sign up'}
          </button>
        </p>

        <button
          type="button"
          className="auth-back"
          onClick={onClose}
          disabled={loading}
        >
          <ArrowLeft size={15} /> Back to Viora
        </button>
      </section>
    </div>
  )
}
