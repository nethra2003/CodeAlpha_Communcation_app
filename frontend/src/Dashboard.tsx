import { useEffect, useState, type FormEvent } from 'react'
import MeetingRoom from './MeetingRoom'
import { createMeeting, joinMeeting, getMeetings, type Meeting } from './meetingApi'
import {
  Video,
  Plus,
  CalendarDays,
  Users,
  Clock3,
  ArrowRight,
  Copy,
  LogOut,
  Search,
  Sparkles,
  Mic,
  VideoIcon,
  MonitorUp,
  MessageSquare,
  CalendarClock,
  X,
  CheckCircle2,
  LoaderCircle,
} from 'lucide-react'
import './Dashboard.css'
import './DashboardMeetings.css'

type DashboardUser = {
  id: string
  name: string
  email: string
  avatarUrl?: string | null
  role: string
}

type DashboardProps = {
  user: DashboardUser
  onLogout: () => void
}

const features = [
  {
    icon: VideoIcon,
    title: 'HD Video',
    description: 'Clear video meetings with your team.',
  },
  {
    icon: MonitorUp,
    title: 'Screen sharing',
    description: 'Present your screen in real time.',
  },
  {
    icon: MessageSquare,
    title: 'Live chat',
    description: 'Keep conversations flowing.',
  },
]

export default function Dashboard({ user, onLogout }: DashboardProps) {
    const firstName = user.name.trim().split(/\s+/)[0] || 'there'
    const [meetings, setMeetings] = useState<Meeting[]>([])
    const [loading, setLoading] = useState(false)
    const [meetingMessage, setMeetingMessage] = useState('')
    const [roomCode, setRoomCode] = useState('')
    const [createdRoomCode, setCreatedRoomCode] = useState('')
    const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null)
    const [meetingsLoading, setMeetingsLoading] = useState(true)
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [meetingTitle, setMeetingTitle] = useState('')
    const [meetingMode, setMeetingMode] = useState<'instant' | 'scheduled'>('instant')
    const [meetingDate, setMeetingDate] = useState('')
    const [meetingTime, setMeetingTime] = useState('')
    const [durationHours, setDurationHours] = useState('2')
    const [showAllMeetings, setShowAllMeetings] = useState(false)

    useEffect(() => {
      let cancelled = false
      async function loadMeetings() {
        setMeetingsLoading(true)
        try {
          const result = await getMeetings()
          if (!cancelled) setMeetings(result.meetings)
        } catch (error) {
          if (!cancelled) setMeetingMessage(error instanceof Error ? error.message : 'Unable to load meetings.')
        } finally {
          if (!cancelled) setMeetingsLoading(false)
        }
      }
      void loadMeetings()
      return () => { cancelled = true }
    }, [user.id])

    // Restore the meeting that was active in this browser tab after a refresh.
    useEffect(() => {
      let cancelled = false

      async function restoreMeeting() {
        const savedRoomCode = sessionStorage.getItem('viora_active_room_code')
        if (!savedRoomCode) return

        const token = sessionStorage.getItem('viora_token')
        if (!token) {
          sessionStorage.removeItem('viora_active_room_code')
          return
        }

        try {
          const result = await joinMeeting(savedRoomCode)

          if (!cancelled) {
            setActiveMeeting(result.meeting)
            setRoomCode(savedRoomCode)
            setMeetingMessage('')
          }
        } catch (error) {
          console.error('Unable to restore previous meeting:', error)

          if (!cancelled) {
            sessionStorage.removeItem('viora_active_room_code')
            setMeetingMessage(
              error instanceof Error
                ? `Your previous meeting could not be restored: ${error.message}`
                : 'Your previous meeting could not be restored. Please join again.',
            )
          }
        }
      }

      void restoreMeeting()

      return () => {
        cancelled = true
      }
    }, [user.id])

    function openCreateMeeting(mode: 'instant' | 'scheduled') {
      setMeetingMode(mode)
      setMeetingTitle(mode === 'instant' ? 'Instant Meeting' : '')
      setMeetingDate('')
      setMeetingTime('')
      setDurationHours('2')
      setMeetingMessage('')
      setShowCreateModal(true)
    }

    async function handleCreateMeeting(event: FormEvent<HTMLFormElement>) {
      event.preventDefault()
      const title = meetingTitle.trim()
      if (!title) {
        setMeetingMessage('Please enter a meeting name.')
        return
      }
      let scheduledAt: string | null = null
      if (meetingMode === 'scheduled') {
        if (!meetingDate || !meetingTime) {
          setMeetingMessage('Choose a date and start time for your meeting.')
          return
        }
        const chosen = new Date(`${meetingDate}T${meetingTime}`)
        if (Number.isNaN(chosen.getTime()) || chosen.getTime() <= Date.now()) {
          setMeetingMessage('Choose a future date and time.')
          return
        }
        scheduledAt = chosen.toISOString()
      }
      if (!Number.isInteger(Number(durationHours)) || Number(durationHours) < 1 || Number(durationHours) > 24) {
        setMeetingMessage('Choose a meeting duration between 1 and 24 hours.')
        return
      }
      setLoading(true)
      setMeetingMessage('')
      setCreatedRoomCode('')
      try {
        const result = await createMeeting(title, scheduledAt, Number(durationHours))
        setCreatedRoomCode(result.meeting.roomCode)
        setMeetingMessage(result.message)
        setShowCreateModal(false)
        const updated = await getMeetings()
        setMeetings(updated.meetings)
        if (meetingMode === 'instant') {
          sessionStorage.setItem('viora_active_room_code', result.meeting.roomCode)
          setActiveMeeting(result.meeting)
        }
      } catch (error) {
        setMeetingMessage(error instanceof Error ? error.message : 'Could not create the meeting.')
      } finally {
        setLoading(false)
      }
    }

        async function handleJoinMeeting() {
            if (!roomCode.trim()) {
                setMeetingMessage('Enter a meeting code first.')
                return
            }

            setLoading(true)
            setMeetingMessage('')

            try {
                const result = await joinMeeting(roomCode.trim())
                sessionStorage.setItem(
                  'viora_active_room_code',
                  result.meeting.roomCode,
                )
                setActiveMeeting(result.meeting)
            } catch (error) {
              setMeetingMessage(
                error instanceof Error ? error.message : 'Could not join the meeting.',
              )
            } finally {
                setLoading(false)
            }
        }

        if (activeMeeting) {
            return (
                <MeetingRoom
                    meeting={activeMeeting}
                    userName={user.name}
                    onLeave={() => {
                      sessionStorage.removeItem('viora_active_room_code')
                      setActiveMeeting(null)
                    }}
                />
            )
        }

  return (
    <>
    {showCreateModal && (
      <div className="meeting-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !loading) setShowCreateModal(false) }}>
        <section className="meeting-modal" role="dialog" aria-modal="true" aria-labelledby="meeting-modal-title">
          <header className="meeting-modal-header">
            <span className="meeting-modal-icon"><CalendarClock size={22} /></span>
            <button type="button" className="meeting-modal-close" aria-label="Close dialog" onClick={() => setShowCreateModal(false)} disabled={loading}><X size={20} /></button>
            <div><h2 id="meeting-modal-title">{meetingMode === 'instant' ? 'Create an instant meeting' : 'Schedule a meeting'}</h2><p>{meetingMode === 'instant' ? 'Your room will be ready right away.' : 'Choose when you want your team to meet.'}</p></div>
          </header>
          <form onSubmit={handleCreateMeeting} className="meeting-modal-form">
            <label htmlFor="new-meeting-title">Meeting name</label>
            <input id="new-meeting-title" value={meetingTitle} onChange={(event) => setMeetingTitle(event.target.value)} placeholder="e.g. Project planning" maxLength={100} required autoFocus />
            <div className="meeting-mode-switch" role="group" aria-label="Meeting type">
              <button type="button" className={meetingMode === 'instant' ? 'selected' : ''} onClick={() => { setMeetingMode('instant'); setMeetingMessage('') }}><Video size={17} /> Start now</button>
              <button type="button" className={meetingMode === 'scheduled' ? 'selected' : ''} onClick={() => { setMeetingMode('scheduled'); setMeetingMessage('') }}><CalendarDays size={17} /> Schedule for later</button>
            </div>
            {meetingMode === 'scheduled' && <div className="meeting-datetime-grid">
              <div><label htmlFor="meeting-date">Date</label><input id="meeting-date" type="date" min={`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`} value={meetingDate} onChange={(event) => setMeetingDate(event.target.value)} required /></div>
              <div><label htmlFor="meeting-time">Start time</label><input id="meeting-time" type="time" value={meetingTime} onChange={(event) => setMeetingTime(event.target.value)} required /></div>
            </div>}
            <div className="meeting-duration-field"><label htmlFor="meeting-duration">Meeting link active for</label><select id="meeting-duration" value={durationHours} onChange={(event) => setDurationHours(event.target.value)}><option value="1">1 hour</option><option value="2">2 hours</option><option value="3">3 hours</option><option value="4">4 hours</option><option value="6">6 hours</option><option value="8">8 hours</option><option value="12">12 hours</option><option value="24">24 hours</option></select><small>The meeting code expires after this duration from the scheduled start time (or now for instant meetings).</small></div>
            {meetingMessage && <p className="meeting-modal-error" role="alert">{meetingMessage}</p>}
            <footer className="meeting-modal-footer"><button type="button" className="meeting-cancel-button" onClick={() => setShowCreateModal(false)} disabled={loading}>Cancel</button><button type="submit" className="meeting-create-button" disabled={loading}>{loading ? <><LoaderCircle size={17} className="viora-spin" /> Creating…</> : <><CheckCircle2 size={17} /> {meetingMode === 'instant' ? 'Create meeting' : 'Schedule meeting'}</>}</button></footer>
          </form>
        </section>
      </div>
    )}
    <main className="dashboard-page">
      <aside className="dashboard-sidebar">
        <a className="dashboard-brand" href="#dashboard">
          <span className="dashboard-brand-icon">
            <Video size={23} />
          </span>
          <span>viora<span className="brand-dot">.</span></span>
        </a>

        <div className="sidebar-label">WORKSPACE</div>

        <a className="sidebar-link active" href="#dashboard">
          <span>▦</span> Dashboard
        </a>
        <a className="sidebar-link" href="#meetings">
          <CalendarDays size={18} /> Meetings
        </a>
        <a className="sidebar-link" href="#features">
          <Users size={18} /> Collaboration
        </a>

        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <div className="user-avatar">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="sidebar-user-info">
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>
          </div>

          <button
            className="sidebar-logout"
            onClick={() => {
              sessionStorage.removeItem('viora_active_room_code')
              onLogout()
            }}
          >
            <LogOut size={17} /> Log out
          </button>
        </div>
      </aside>

      <section className="dashboard-main" id="dashboard">
        <header className="dashboard-topbar">
          <div className="dashboard-breadcrumb">
            Workspace <span>/</span> Dashboard
          </div>

          <div className="dashboard-top-actions">
            <span className="online-indicator">
              <span /> You're online
            </span>
            <div className="top-avatar">
              {user.name.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        <div className="dashboard-content">
          <section className="welcome-section">
            <div>
              <div className="welcome-eyebrow">
                <Sparkles size={15} /> YOUR WORKSPACE
              </div>
              <h1>Good to see you, {firstName}!</h1>
              <p>Bring your people together. What would you like to do today?</p>
            </div>
            <div className="welcome-decoration">
              <div className="decoration-orbit orbit-one" />
              <div className="decoration-orbit orbit-two" />
              <Video size={43} />
            </div>
          </section>

          <section className="meeting-actions" id="meetings">
            <button
              className="meeting-action-card create-meeting-card"
              onClick={() => openCreateMeeting('instant')}
              disabled={loading}
            >
              <span className="action-icon purple-icon">
                <Plus size={24} />
              </span>
              <span className="action-card-text">
                <strong>Start an instant meeting</strong>
                <small>Create a new meeting room and invite your team.</small>
                <span className="action-link">
                  Start meeting <ArrowRight size={16} />
                </span>
                <span className="action-link schedule-action-link" onClick={(event) => { event.stopPropagation(); openCreateMeeting('scheduled') }} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); openCreateMeeting('scheduled') } }}>
                  Schedule for later <CalendarDays size={15} />
                </span>
              </span>
            </button>

            <button
              className="meeting-action-card join-meeting-card"
              onClick={handleJoinMeeting}
              disabled={loading}
            >
              <span className="action-icon blue-icon">
                <Users size={23} />
              </span>
              <span className="action-card-text">
                <strong>Join a meeting</strong>

                <span className="action-link">
                  Enter meeting code <ArrowRight size={16} />
                </span>
              </span>
            </button>
          </section>
          
          {meetingMessage && (
            <p role="status" className="meeting-status-message">
                {meetingMessage}
            </p>
          )}

          {createdRoomCode && (
            <div className="created-room-code">
                <div>
                    <strong>Your meeting code</strong>
                    <p>{createdRoomCode}</p>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        void navigator.clipboard.writeText(createdRoomCode)
                            .then(() => setMeetingMessage('Meeting code copied!'))
                            .catch(() => setMeetingMessage('Copy failed. Please copy the code manually.'))
                    }}
                >
                    <Copy size={16} /> Copy code
                </button>
            </div>
           )}
        
          <div className="meeting-join-form">
            <label htmlFor="meeting-room-code">Meeting code</label>

            <div className="meeting-join-input-row">
             <input
                id="meeting-room-code"
                className="meeting-code-input"
                value={roomCode}
                onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                placeholder="Enter 12-character code"
                maxLength={12}
                aria-label="Meeting code"
              />
             <button
                type="button"
                className="meeting-join-submit"
                onClick={handleJoinMeeting}
                disabled={loading}
             >
                {loading ? 'Joining...' : 'Join'}
             </button>
            </div>
          </div>


          <section className="dashboard-stats">
            <article className="stat-card">
              <span className="stat-icon"><Video size={19} /></span>
              <span className="stat-label">Meetings created</span>
              <strong>{meetings.length}</strong>
              <small>Meetings in your workspace</small>
            </article>
            <article className="stat-card">
              <span className="stat-icon blue-stat"><Users size={19} /></span>
              <span className="stat-label">Team collaboration</span>
              <strong>Ready</strong>
              <small>Your workspace is active</small>
            </article>
            <article className="stat-card">
              <span className="stat-icon green-stat"><Clock3 size={19} /></span>
              <span className="stat-label">Upcoming meetings</span>
              <strong>{meetings.filter((meeting) => meeting.status === 'SCHEDULED').length}</strong>
              <small>Scheduled meetings</small>
            </article>
          </section>

          <section className="dashboard-lower-grid">
            <article className="dashboard-panel">
              <div className="panel-heading">
                <div>
                  <h2>Recent meetings</h2>
                  <p>Your meeting activity will appear here.</p>
                </div>
                <CalendarDays size={21} />
              </div>
              {meetingsLoading ? (
                <div className="meetings-loading"><LoaderCircle size={24} className="viora-spin" /><span>Loading your meetings…</span></div>
              ) : meetings.length === 0 ? (
                <div className="empty-meetings">
                  <div className="empty-meeting-icon"><Video size={27} /></div>
                  <strong>No meetings yet</strong>
                  <p>Create an instant meeting or schedule one for later.</p>
                  <button type="button" className="meeting-outline-button" onClick={() => openCreateMeeting('scheduled')}>Schedule a meeting</button>
                </div>
              ) : (
                <div className="meeting-list">
                  {(showAllMeetings ? meetings : meetings.slice(0, 3)).map((meeting) => {
                    const when = meeting.scheduledAt || meeting.startedAt || meeting.createdAt
                    const statusLabel = meeting.status === 'ENDED' ? 'Completed' : meeting.status === 'ACTIVE' ? 'In progress' : 'Scheduled'
                    return (
                      <article className="meeting-list-item" key={meeting.id}>
                        <span className={`meeting-status-dot status-${meeting.status.toLowerCase()}`} />
                        <div className="meeting-list-details">
                          <strong>{meeting.title}</strong>
                          <span><CalendarDays size={14} /> {new Date(when).toLocaleDateString([], { dateStyle: 'medium' })} · {new Date(when).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                          <small>Host: {meeting.host.name}</small>
                        </div>
                        <div className="meeting-list-actions">
                          <span className={`meeting-status-pill status-${meeting.status.toLowerCase()}`}>{statusLabel}</span>
                          {meeting.status !== 'ENDED' && (
                            <button type="button" className="meeting-small-button" disabled={loading} onClick={async () => {
                              setLoading(true); setMeetingMessage('')
                              try { const result = await joinMeeting(meeting.roomCode); sessionStorage.setItem('viora_active_room_code', result.meeting.roomCode); setActiveMeeting(result.meeting) }
                              catch (error) { setMeetingMessage(error instanceof Error ? error.message : 'Unable to join meeting.') }
                              finally { setLoading(false) }
                            }}>{meeting.status === 'SCHEDULED' ? 'Join' : 'Open'}</button>
                          )}
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
              {!meetingsLoading && meetings.length > 3 && <button type="button" className="view-all-meetings-button" onClick={() => setShowAllMeetings((value) => !value)}>{showAllMeetings ? 'Show recent meetings' : `View all meetings (${meetings.length})`} <ArrowRight size={15} /></button>}
            </article>

            <article className="dashboard-panel" id="features">
              <div className="panel-heading">
                <div>
                  <h2>Explore Viora</h2>
                  <p>Tools designed for better teamwork.</p>
                </div>
                <Sparkles size={21} />
              </div>

              <div className="feature-list">
                {features.map(({ icon: Icon, title, description }) => (
                  <div className="dashboard-feature" key={title}>
                    <span className="feature-icon"><Icon size={19} /></span>
                    <span>
                      <strong>{title}</strong>
                      <small>{description}</small>
                    </span>
                    <ArrowRight size={16} className="feature-arrow" />
                  </div>
                ))}
              </div>
            </article>
          </section>

          <footer className="dashboard-footer">
            <span>© 2026 Viora · Made for better conversations</span>
            <span><Mic size={14} /> Connect. Collaborate. Create.</span>
          </footer>
        </div>
      </section>
    </main>
    </>
  )
}
