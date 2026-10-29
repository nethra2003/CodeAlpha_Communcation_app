import { useEffect, useState } from 'react'
import AuthModal from './AuthModal'
import Dashboard from './Dashboard'
import {
  ArrowRight,
  Video,
  Users,
  MonitorUp,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Menu,
  X,
  Play,
  Check,
  Zap,
  Globe,
  Mic,
  CalendarDays,
} from 'lucide-react'
import './App.css'

const API_URL = 'http://localhost:5000/api/auth'

type CurrentUser = {
  id: string
  name: string
  email: string
  avatarUrl?: string | null
  role: string
}

function App() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [notice, setNotice] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'register' | null>(null)
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)

  // Restore the current user whenever the application starts.
  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      const token = sessionStorage.getItem('viora_token')

      if (!token) {
        if (!cancelled) setCheckingSession(false)
        return
      }

      try {
        const response = await fetch(`${API_URL}/me`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          // Remove only an invalid/expired session token.
          if (response.status === 401) {
            sessionStorage.removeItem('viora_token')
          }

          if (!cancelled) setCurrentUser(null)
          return
        }

        const data = await response.json()

        if (cancelled) return

        if (data.success && data.user) {
          setCurrentUser(data.user)
        } else {
          sessionStorage.removeItem('viora_token')
          setCurrentUser(null)
        }
      } catch (error) {
        // Keep a valid-looking token if the backend is temporarily
        // unreachable. The user can retry by refreshing the page.
        console.error('Unable to restore Viora session:', error)
        if (!cancelled) {
          setNotice('Unable to verify your session. Check that the backend is running, then refresh.')
        }
      } finally {
        if (!cancelled) setCheckingSession(false)
      }
    }

    void restoreSession()

    return () => {
      cancelled = true
    }
  }, [])

  const scrollToFeatures = () => {
    document.getElementById('features')?.scrollIntoView({
      behavior: 'smooth',
    })
    setMenuOpen(false)
  }

  const handleGetStarted = () => {
    setAuthMode('register')
    setNotice('')
  }

  const handleJoinMeeting = () => {
    setNotice('Meeting rooms will be available after we implement authentication and WebRTC.')
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!email.trim()) {
      setNotice('Please enter your email address.')
      return
    }

    setNotice(
      'Thanks for your interest! Email subscriptions will be connected to the backend in a later phase.',
    )
  }

  // Avoid showing the login page while checking a saved session.
  if (checkingSession) {
    return (
      <div className="app-shell" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <p>Restoring your Viora session...</p>
      </div>
    )
  }

  if (currentUser) {
    return (
      <Dashboard
        user={currentUser}
        onLogout={() => {
          sessionStorage.removeItem('viora_token')
          setCurrentUser(null)
          setNotice('')
          setAuthMode(null)
        }}
      />
    )
  }

  return (
    <div className="app-shell">
      <header className="navbar">
        <a href="#home" className="brand" aria-label="Viora home">
          <span className="brand-icon">
            <Video size={23} strokeWidth={2.3} />
          </span>
          <span>viora<span className="brand-dot">.</span></span>
        </a>

        <button
          className="mobile-menu-button"
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={23} /> : <Menu size={23} />}
        </button>

        <nav className={`nav-links ${menuOpen ? 'nav-links-open' : ''}`}>
          <a href="#home" onClick={() => setMenuOpen(false)}>Home</a>
          <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
          <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
          <a href="#about" onClick={() => setMenuOpen(false)}>About</a>
        </nav>

        <div className="nav-actions">
          <button
            className="button button-ghost"
            onClick={() => setAuthMode('login')}
          >
            Log in
          </button>

          <button
            className="button button-primary nav-cta"
            onClick={handleGetStarted}
          >
            Get started <ArrowRight size={16} />
          </button>
        </div>
      </header>

      <main>
        <section className="hero section-container" id="home">
          <div className="hero-content">
            <div className="announcement">
              <span className="announcement-icon"><Sparkles size={14} /></span>
              <span>Meet better. Create together.</span>
              <ArrowRight size={14} />
            </div>

            <h1>
              Great things happen
              <br />
              when we <span className="gradient-text">connect.</span>
            </h1>

            <p className="hero-description">
              More than a video call. Viora brings your team together with
              crystal-clear conversations, shared ideas, and effortless
              collaboration — all in one place.
            </p>

            <div className="hero-actions">
              <button className="button button-primary button-large" onClick={handleGetStarted}>
                Start collaborating <ArrowRight size={18} />
              </button>
              <button className="button button-secondary button-large" onClick={scrollToFeatures}>
                <Play size={16} fill="currentColor" /> Explore features
              </button>
            </div>

            <div className="hero-trust">
              <div className="trust-icon"><ShieldCheck size={17} /></div>
              <span>Privacy-minded by design</span>
              <span className="trust-separator">·</span>
              <span>Built for teamwork</span>
            </div>
          </div>

          <div className="hero-visual">
            <div className="visual-glow" />
            <div className="floating-label label-top">
              <span className="live-indicator" />
              Live collaboration
            </div>

            <div className="meeting-window">
              <div className="meeting-topbar">
                <div className="window-dots"><i /><i /><i /></div>
                <div className="meeting-room-label">
                  <span className="room-lock"><ShieldCheck size={12} /></span>
                  design-sync
                </div>
                <span className="meeting-duration">00:24:18</span>
              </div>

              <div className="video-grid">
                <div className="participant participant-one">
                  <div className="avatar avatar-one">A</div>
                  <span className="participant-name"><Mic size={12} /> Alex Morgan</span>
                </div>
                <div className="participant participant-two">
                  <div className="avatar avatar-two">J</div>
                  <span className="participant-name"><Mic size={12} /> Jordan Lee</span>
                </div>
                <div className="participant participant-three">
                  <div className="avatar avatar-three">S</div>
                  <span className="participant-name"><Mic size={12} /> Sam Rivera</span>
                </div>
                <div className="participant participant-four">
                  <div className="avatar avatar-four">Y</div>
                  <span className="participant-name"><Mic size={12} /> You</span>
                  <span className="you-indicator">YOU</span>
                </div>
              </div>

              <div className="meeting-controls">
                <button aria-label="Microphone preview"><Mic size={16} /></button>
                <button aria-label="Participants preview"><Users size={16} /></button>
                <button className="share-control" aria-label="Screen sharing preview"><MonitorUp size={16} /></button>
                <button aria-label="Chat preview"><MessageCircle size={16} /></button>
                <button className="end-call" aria-label="End call preview"><Video size={16} /></button>
              </div>
            </div>

            <div className="floating-label label-bottom">
              <span className="floating-sparkle"><Sparkles size={16} /></span>
              Ideas flow here
            </div>

            <div className="floating-stat">
              <div className="stat-icon"><Users size={18} /></div>
              <div>
                <strong>Better together</strong>
                <span>One space for your team</span>
              </div>
              <Check className="stat-check" size={17} />
            </div>
          </div>
        </section>

        <section className="capabilities section-container" id="about">
          <p className="eyebrow">YOUR WORKSPACE, REIMAGINED</p>
          <h2>Everything clicks when<br />everyone connects.</h2>
          <p className="section-description">
            Less switching between tools. More time doing meaningful work.
          </p>

          <div className="capability-strip">
            <div><Globe size={18} /><span>Connect from anywhere</span></div>
            <div><Zap size={18} /><span>Real-time collaboration</span></div>
            <div><ShieldCheck size={18} /><span>Security-focused design</span></div>
          </div>
        </section>

        <section className="features section-container" id="features">
          <div className="section-heading">
            <div>
              <p className="eyebrow">MADE FOR YOUR BEST WORK</p>
              <h2>One platform.<br /><span className="gradient-text">Endless possibilities.</span></h2>
            </div>
            <p className="section-description heading-description">
              From quick conversations to big ideas, every tool you need is
              right where you need it.
            </p>
          </div>

          <div className="feature-grid">
            <article className="feature-card feature-card-highlight">
              <div className="feature-icon purple-icon"><Video size={23} /></div>
              <span className="feature-number">01 / CONNECT</span>
              <h3>Video that feels personal</h3>
              <p>Bring every conversation to life with real-time audio and video designed to keep teams close.</p>
              <div className="feature-art video-art">
                <div className="art-video-tile"><div className="art-person art-person-one">A</div><span>Alex</span></div>
                <div className="art-video-tile"><div className="art-person art-person-two">J</div><span>Jordan</span></div>
                <div className="art-video-tile"><div className="art-person art-person-three">S</div><span>Sam</span></div>
              </div>
            </article>

            <article className="feature-card">
              <div className="feature-icon blue-icon"><MonitorUp size={23} /></div>
              <span className="feature-number">02 / SHARE</span>
              <h3>Your screen, one click away</h3>
              <p>Present your ideas, walk through a design, or solve a problem together on the same screen.</p>
              <div className="feature-art screen-art">
                <div className="screen-preview">
                  <div className="screen-preview-bar"><i /><i /><i /></div>
                  <div className="screen-preview-content"><span /><span /><span /></div>
                  <div className="screen-cursor"><ArrowRight size={20} /></div>
                </div>
              </div>
            </article>

            <article className="feature-card">
              <div className="feature-icon pink-icon"><MessageCircle size={23} /></div>
              <span className="feature-number">03 / COMMUNICATE</span>
              <h3>Every thought has a place</h3>
              <p>Keep conversations and shared files alongside your meeting instead of losing them in another app.</p>
              <div className="feature-art chat-art">
                <div className="chat-bubble chat-left">Let's build something great.</div>
                <div className="chat-bubble chat-right">I'm in! ✨</div>
                <div className="chat-bubble chat-left chat-short">Sharing the files now…</div>
              </div>
            </article>

            <article className="feature-card">
              <div className="feature-icon green-icon"><Sparkles size={23} /></div>
              <span className="feature-number">04 / CREATE</span>
              <h3>Make ideas visible</h3>
              <p>Sketch a flow, map out a plan, and turn abstract thoughts into something everyone can see.</p>
              <div className="feature-art whiteboard-art">
                <div className="board-line board-line-one" />
                <div className="board-line board-line-two" />
                <div className="board-node node-one">IDEA</div>
                <div className="board-node node-two">PLAN</div>
                <div className="board-node node-three">BUILD</div>
              </div>
            </article>
          </div>
        </section>

        <section className="steps-section section-container" id="how-it-works">
          <div className="steps-copy">
            <p className="eyebrow">SIMPLE BY DESIGN</p>
            <h2>From hello to<br /><span className="gradient-text">let's do this.</span></h2>
            <p className="section-description">
              Collaboration should feel natural. Getting started with Viora
              will be just as easy.
            </p>
            <button className="button button-primary button-large" onClick={handleGetStarted}>
              Get started <ArrowRight size={17} />
            </button>
          </div>

          <div className="steps-list">
            <div className="step-item">
              <span className="step-index">01</span>
              <div className="step-symbol"><Users size={21} /></div>
              <div><h3>Bring your people</h3><p>Create a space and invite your teammates with a meeting link.</p></div>
            </div>
            <div className="step-item">
              <span className="step-index">02</span>
              <div className="step-symbol"><Video size={21} /></div>
              <div><h3>Meet face to face</h3><p>Talk, listen, and share your screen in real time.</p></div>
            </div>
            <div className="step-item">
              <span className="step-index">03</span>
              <div className="step-symbol"><CalendarDays size={21} /></div>
              <div><h3>Make progress together</h3><p>Exchange files, sketch ideas, and keep the momentum going.</p></div>
            </div>
          </div>
        </section>

        <section className="cta-section section-container">
          <div className="cta-glow" />
          <div className="cta-content">
            <div className="cta-badge"><Sparkles size={14} /> YOUR NEXT GREAT MEETING STARTS HERE</div>
            <h2>Better conversations.<br /><span>Brighter ideas.</span></h2>
            <p>One shared space for the people and ideas that move you forward.</p>
            <button className="button button-light button-large" onClick={handleGetStarted}>
              Meet with Viora <ArrowRight size={18} />
            </button>
          </div>
          <div className="cta-decoration"><Video size={90} strokeWidth={1} /></div>
        </section>

        <section className="newsletter section-container">
          <div>
            <p className="eyebrow">STAY IN THE LOOP</p>
            <h2>Good things are connecting.</h2>
            <p className="section-description">Get updates as Viora's collaboration features take shape.</p>
          </div>
          <form className="newsletter-form" onSubmit={handleSubmit}>
            <input
              type="email"
              placeholder="Enter your email address"
              aria-label="Email address"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <button className="button button-primary" type="submit">Keep me posted <ArrowRight size={16} /></button>
          </form>
          {notice && <p className="notice-message" role="status">{notice}</p>}
        </section>
      </main>

      <footer className="footer section-container">
        <a href="#home" className="brand footer-brand">
          <span className="brand-icon"><Video size={21} /></span>
          <span>viora<span className="brand-dot">.</span></span>
        </a>
        <p>Connect. Collaborate. Create.</p>
        <span className="footer-copyright">© 2026 Viora · Built for better collaboration.</span>
        <button className="button button-ghost footer-join" onClick={handleJoinMeeting}>Join a meeting <ArrowRight size={15} /></button>
      </footer>

      {authMode && (
        <AuthModal
          key={authMode}
          initialMode={authMode}
          onClose={() => setAuthMode(null)}
          onSuccess={(token, user) => {
            sessionStorage.setItem('viora_token', token)
            setCurrentUser(user)
            setAuthMode(null)
            setNotice(`Welcome to Viora, ${user.name}!`)
          }}
        />
      )}
    </div>
  )
}

export default App
