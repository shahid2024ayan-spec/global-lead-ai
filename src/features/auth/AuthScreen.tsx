import { useState, type FormEvent } from 'react'
import { ArrowRight, LockKeyhole, Mail, Sparkles, UserRound } from 'lucide-react'
import { useAuth } from './AuthProvider'

export default function AuthScreen() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    setError('')
    try {
      if (mode === 'signup') {
        const result = await signUp(email.trim(), password, name.trim())
        setMessage(result.needsEmailConfirmation
          ? 'Account created. Check your email to confirm it, then sign in.'
          : 'Your account is ready. Welcome to GlobalLead AI.')
        if (result.needsEmailConfirmation) setMode('signin')
      } else {
        await signIn(email.trim(), password)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="auth-screen">
    <section className="auth-card">
      <div className="auth-brand"><span><Sparkles size={20}/></span><strong>GlobalLead<span> AI</span></strong></div>
      <div className="auth-eyebrow">GLOBAL OPPORTUNITY INTELLIGENCE</div>
      <h1>{mode === 'signin' ? 'Welcome back.' : 'Build your pipeline.'}</h1>
      <p className="auth-description">{mode === 'signin'
        ? 'Sign in to access your private opportunity workspace.'
        : 'Create your account and start building a smarter client pipeline.'}</p>
      <div className="auth-tabs">
        <button type="button" className={mode === 'signin' ? 'selected' : ''} onClick={() => { setMode('signin'); setError(''); setMessage('') }}>Sign in</button>
        <button type="button" className={mode === 'signup' ? 'selected' : ''} onClick={() => { setMode('signup'); setError(''); setMessage('') }}>Create account</button>
      </div>
      <form className="auth-form" onSubmit={submit}>
        {mode === 'signup' && <label><span>Your name</span><div className="auth-input"><UserRound size={17}/><input autoComplete="name" value={name} onChange={e => setName(e.target.value)} placeholder="Full name" required maxLength={80}/></div></label>}
        <label><span>Email address</span><div className="auth-input"><Mail size={17}/><input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required/></div></label>
        <label><span>Password</span><div className="auth-input"><LockKeyhole size={17}/><input type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" required minLength={8}/></div></label>
        {error && <div className="auth-message error" role="alert">{error}</div>}
        {message && <div className="auth-message success" role="status">{message}</div>}
        <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in to workspace' : 'Create my account'} <ArrowRight size={17}/></button>
      </form>
      <div className="auth-security"><LockKeyhole size={14}/> Your workspace and leads are private to your account.</div>
    </section>
    <p className="auth-foot">GLOBALLEAD AI · EVIDENCE-FIRST CLIENT DISCOVERY</p>
  </main>
}
