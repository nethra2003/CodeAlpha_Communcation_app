import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { io, type Socket } from 'socket.io-client'
import {
  ArrowLeft,
  Camera,
  CameraOff,
  Copy,
  Brush,
  RotateCcw,
  Download,
  FileText,
  MessageCircle,
  Paperclip,
  Send,
  Mic,
  MicOff,
  MonitorUp,
  PhoneOff,
  Users,
  Video,
} from 'lucide-react'
import type { Meeting } from './meetingApi'
import './MeetingRoom.css'

const SOCKET_URL = 'http://localhost:5000'

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
  ],
}

type MeetingRoomProps = {
  meeting: Meeting
  userName: string
  onLeave: () => void
}

type RemoteParticipant = {
  stream: MediaStream
  displayName: string
  cameraOn: boolean
  isScreenSharing: boolean
}

type ChatMessage = {
  id: string
  senderId: string
  senderName: string
  text: string
  createdAt: string
}

type SharedFile = {
  id: string
  name: string
  size: number
  url: string
  senderId: string
  senderName: string
  createdAt: string
}

type WhiteboardPoint = { x: number; y: number }
type WhiteboardStroke = {
  id: string
  color: string
  width: number
  points: WhiteboardPoint[]
  senderId?: string
}


function RemoteVideo({
  participant,
  peerId,
}: {
  participant: RemoteParticipant
  peerId: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = participant.stream
    }
  }, [participant.stream])

  return (
    <article className="room-video-card" data-peer-id={peerId}>
      <div className="room-video-stage">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={
            participant.cameraOn || participant.isScreenSharing
              ? 'room-video visible'
              : 'room-video hidden'
          }
        />

        {!participant.cameraOn && !participant.isScreenSharing && (
          <div className="room-avatar-placeholder">
            <div>
              {participant.displayName.trim().charAt(0).toUpperCase() || 'U'}
            </div>
            <p>Camera off</p>
          </div>
        )}

        <span className="room-participant-name">
          {participant.displayName}
        </span>
      </div>
    </article>
  )
}

export default function MeetingRoom({
  meeting,
  userName,
  onLeave,
}: MeetingRoomProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const namesRef = useRef<Map<string, string>>(new Map())
  // Keep status events even if they arrive before the remote media track.
  const cameraStatusRef = useRef<Map<string, boolean>>(new Map())
  const screenStatusRef = useRef<Map<string, boolean>>(new Map())

  const [cameraOn, setCameraOn] = useState(false)
  const [micOn, setMicOn] = useState(false)
  const [mediaError, setMediaError] = useState('')
  const [connectionMessage, setConnectionMessage] =
    useState('Connecting to meeting...')
  const [copied, setCopied] = useState(false)
  const [startingMedia, setStartingMedia] = useState(true)
  const [remoteParticipants, setRemoteParticipants] =
    useState<Record<string, RemoteParticipant>>({})
  const [participantNames, setParticipantNames] = useState<Record<string, string>>({})
  const [meetingActionError, setMeetingActionError] = useState('')
  const [meetingActionLoading, setMeetingActionLoading] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatText, setChatText] = useState('')
  const [chatError, setChatError] = useState('')
  const [sharedFiles, setSharedFiles] = useState<SharedFile[]>([])
  const [uploadingFile, setUploadingFile] = useState(false)
  const [fileError, setFileError] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const whiteboardCanvasRef = useRef<HTMLCanvasElement>(null)
  const activeStrokeRef = useRef<WhiteboardStroke | null>(null)
  const [whiteboardStrokes, setWhiteboardStrokes] = useState<WhiteboardStroke[]>([])
  const [whiteboardColor, setWhiteboardColor] = useState('#7c3aed')
  const [whiteboardWidth, setWhiteboardWidth] = useState(4)
  const [whiteboardError, setWhiteboardError] = useState('')

  const removePeer = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId)

    if (peer) {
      peer.ontrack = null
      peer.onicecandidate = null
      peer.close()
      peersRef.current.delete(peerId)
    }

    namesRef.current.delete(peerId)
    cameraStatusRef.current.delete(peerId)
    screenStatusRef.current.delete(peerId)

    setRemoteParticipants((current) => {
      const updated = { ...current }
      delete updated[peerId]
      return updated
    })
  }, [])

  const sendSignal = useCallback(
    (targetId: string, signal: Record<string, unknown>) => {
      socketRef.current?.emit('webrtc-signal', {
        targetId,
        signal,
      })
    },
    [],
  )

  const createPeer = useCallback(
    (peerId: string, displayName: string) => {
      const existing = peersRef.current.get(peerId)
      if (existing) return existing

      const peer = new RTCPeerConnection(ICE_SERVERS)
      peersRef.current.set(peerId, peer)
      namesRef.current.set(peerId, displayName)

      const localStream = streamRef.current
      localStream?.getTracks().forEach((track) => {
        peer.addTrack(track, localStream)
      })

      peer.onicecandidate = (event) => {
        if (event.candidate) {
          sendSignal(peerId, {
            type: 'candidate',
            candidate: event.candidate,
          })
        }
      }

      peer.ontrack = (event) => {
        // Prefer the stream supplied by WebRTC; create a stream if the
        // browser does not attach one to the track event.
        const stream =
          event.streams[0] ?? new MediaStream([event.track])

        const peerName =
          namesRef.current.get(peerId) || displayName

        setRemoteParticipants((current) => {
          const previous = current[peerId]
          const videoTrack = stream.getVideoTracks()[0]

          return {
            ...current,
            [peerId]: {
              stream,
              displayName: peerName,
              // Preserve status events that may have arrived before ontrack.
              cameraOn:
                cameraStatusRef.current.get(peerId) ??
                previous?.cameraOn ??
                Boolean(videoTrack && videoTrack.readyState === 'live'),
              isScreenSharing:
                screenStatusRef.current.get(peerId) ??
                previous?.isScreenSharing ??
                false,
            },
          }
        })

        // Ensure the newly mounted video element starts playback.
        window.setTimeout(() => {
          const video = document.querySelector<HTMLVideoElement>(
            `[data-peer-id="${peerId}"] video`,
          )
          if (video) void video.play().catch(() => undefined)
        }, 0)
      }

      peer.onconnectionstatechange = () => {
        if (
          peer.connectionState === 'failed' ||
          peer.connectionState === 'closed'
        ) {
          removePeer(peerId)
        }
      }

      return peer
    },
    [removePeer, sendSignal],
  )

  const makeOffer = useCallback(
    async (peerId: string, displayName: string) => {
      try {
        const peer = createPeer(peerId, displayName)
        const offer = await peer.createOffer()

        await peer.setLocalDescription(offer)

        sendSignal(peerId, {
          type: 'offer',
          sdp: peer.localDescription,
        })
      } catch (error) {
        console.error('Unable to create WebRTC offer:', error)
        setMediaError('Unable to start a peer connection. Please rejoin the meeting.')
      }
    },
    [createPeer, sendSignal],
  )

  useEffect(() => {
    let cancelled = false
    let socket: Socket | null = null

    async function startMeeting() {
      setStartingMedia(true)
      setMediaError('')

      // Request local media. The room can still connect if permission
      // is denied, but video/audio will be unavailable.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        })

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream

        stream.getVideoTracks().forEach((track) => {
          track.enabled = true
        })

        stream.getAudioTracks().forEach((track) => {
          track.enabled = false
        })

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          void videoRef.current.play().catch(() => undefined)
        }

        setCameraOn(stream.getVideoTracks().length > 0)
        setMicOn(false)
      } catch (error) {
        console.error('Media permission error:', error)

        if (!cancelled) {
          setMediaError(
            'Camera or microphone unavailable. Check browser permissions; you can still join without media.',
          )
        }
      } finally {
        if (!cancelled) setStartingMedia(false)
      }

      if (cancelled) return

      const token = sessionStorage.getItem('viora_token')

      if (!token) {
        setConnectionMessage('Please log in again to join this meeting.')
        return
      }

      socket = io(SOCKET_URL, {
        auth: { token },
        reconnection: true,
      })

      socketRef.current = socket

      socket.on('connect', () => {
        setConnectionMessage('Connecting to the meeting room...')

        socket?.emit(
          'join-room',
          {
            // Use the database meeting ID as the Socket.IO room ID.
            roomId: meeting.id,
            displayName: userName,
          },
          (result: {
            success: boolean
            error?: string
            participants?: { 
              socketId: string
              displayName: string
             }[]
          }) => {
            if (!result?.success) {
              setConnectionMessage(
                result?.error || 'Unable to join the meeting room.',
              )
              return
            }

            setConnectionMessage('Connected to the meeting room.')
            const initialParticipants = Object.fromEntries(
              (result.participants ?? []).map((participant) => [
                participant.socketId,
                participant.displayName,
              ]),
            )
            setParticipantNames(initialParticipants)

            socket?.emit(
              'whiteboard-history',
              { meetingId: meeting.id },
              (result: { success: boolean; strokes?: WhiteboardStroke[]; message?: string }) => {
                if (!result?.success) {
                  setWhiteboardError(result?.message || 'Unable to load the whiteboard.')
                  return
                }
                setWhiteboardStrokes(result.strokes ?? [])
                setWhiteboardError('')
              },
            )

            // Restore persisted chat history after successfully joining the room.
            socket?.emit(
              'meeting-chat-history',
              { meetingId: meeting.id },
              (result: {
                success: boolean
                messages?: ChatMessage[]
                message?: string
              }) => {
                if (!result?.success) {
                  setChatError(result?.message || 'Unable to load chat history.')
                  return
                }

                // Merge history with messages that may arrive while the request is in flight.
                setChatMessages((current) => {
                  const byId = new Map(current.map((message) => [message.id, message]))
                  for (const message of result.messages ?? []) {
                    byId.set(message.id, message)
                  }
                  return [...byId.values()]
                    .sort(
                      (a, b) =>
                        new Date(a.createdAt).getTime() -
                        new Date(b.createdAt).getTime(),
                    )
                    .slice(-300)
                })
                setChatError('')
              },
            )

            // Restore file metadata from the authenticated meeting-files endpoint.
            const token = sessionStorage.getItem('viora_token')
            if (token) {
              void fetch(
                `${SOCKET_URL}/api/meetings/${encodeURIComponent(meeting.id)}/files`,
                { headers: { Authorization: `Bearer ${token}` } },
              )
                .then(async (response) => {
                  const data = await response.json().catch(() => ({}))
                  if (!response.ok) {
                    throw new Error(data.message || 'Unable to load shared files.')
                  }
                  if (data.success === false) {
                    throw new Error(data.message || 'Unable to load shared files.')
                  }
                  const files = Array.isArray(data.files)
                    ? data.files as SharedFile[]
                    : []
                  return files
                })
                .then((files) => {
                  setSharedFiles((current) => {
                    const byId = new Map(current.map((file) => [file.id, file]))
                    for (const file of files) {
                      if (file?.id && file.name && file.url) byId.set(file.id, file)
                    }
                    return [...byId.values()].slice(-100)
                  })
                  setFileError('')
                })
                .catch((error) => {
                  console.error('Load shared-file history error:', error)
                  setFileError(
                    error instanceof Error
                      ? error.message
                      : 'Unable to load shared files.',
                  )
                })
            } else {
              setFileError('Your session has expired. Please log in again.')
            }

            // The newly joined participant initiates offers to peers
            // already in the room.
            for (const participant of result.participants ?? []) {
              namesRef.current.set(
                participant.socketId,
                participant.displayName,
              )
              void makeOffer(
                participant.socketId,
                participant.displayName,
              )
            }
          },
        )
      })

      socket.on('meeting-ended', (payload: { message?: string }) => {
        setConnectionMessage(payload?.message || 'The meeting has ended.')
        setMeetingActionError(payload?.message || 'The host ended this meeting.')
        window.setTimeout(() => leaveMeeting(), 250)
      })

      socket.on('connect_error', (error) => {
        console.error('Socket connection error:', error)
        setConnectionMessage('Unable to connect to the signaling server.')
      })

      socket.on(
        'participant-joined',
        (participant: {
          socketId: string
          displayName: string
        }) => {
          namesRef.current.set(
            participant.socketId,
            participant.displayName,
          )
          setParticipantNames((current) => ({
            ...current,
            [participant.socketId]: participant.displayName,
          }))
        },
      )

      socket.on(
        'participant-left',
        (participant: { socketId: string }) => {
          removePeer(participant.socketId)
          setParticipantNames((current) => {
            const updated = { ...current }
            delete updated[participant.socketId]
            return updated
          })
        },
      )

      
      socket.on(
        'camera-status',
        (payload: { socketId: string; cameraOn: boolean }) => {
          cameraStatusRef.current.set(payload.socketId, payload.cameraOn)

          setRemoteParticipants((current) => {
            const participant = current[payload.socketId]
            if (!participant) return current

            return {
              ...current,
              [payload.socketId]: {
                ...participant,
                cameraOn: payload.cameraOn,
              },
            }
          })
        },
      )

      socket.on(
        'screen-share-status',
        (payload: {
          socketId: string
          isScreenSharing: boolean
        }) => {
          screenStatusRef.current.set(
            payload.socketId,
            payload.isScreenSharing,
          )

          setRemoteParticipants((current) => {
            const participant = current[payload.socketId]
            if (!participant) return current

            return {
              ...current,
              [payload.socketId]: {
                ...participant,
                isScreenSharing: payload.isScreenSharing,
              },
            }
          })
        },
      )

      socket.on('meeting-chat-message', (message: ChatMessage) => {
        if (!message || typeof message.text !== 'string') return
        setChatMessages((current) => {
          if (current.some((item) => item.id === message.id)) return current
          return [...current, message].slice(-300)
        })
      })

      socket.on('meeting-file-shared', (file: SharedFile) => {
        if (!file || typeof file.name !== 'string' || typeof file.url !== 'string') return
        setSharedFiles((current) => {
          if (current.some((item) => item.id === file.id)) return current
          return [...current, file].slice(-100)
        })
      })

      socket.on('whiteboard-stroke', (payload: { meetingId: string; stroke: WhiteboardStroke }) => {
        if (payload?.meetingId !== meeting.id || !payload.stroke?.id) return
        setWhiteboardStrokes((current) => {
          const index = current.findIndex((stroke) => stroke.id === payload.stroke.id)
          if (index < 0) return [...current, payload.stroke].slice(-2000)
          const updated = [...current]
          updated[index] = payload.stroke
          return updated
        })
      })

      socket.on('whiteboard-cleared', (payload: { meetingId: string }) => {
        if (payload?.meetingId !== meeting.id) return
        setWhiteboardStrokes([])
        activeStrokeRef.current = null
        setWhiteboardError('')
      })

      socket.on('meeting-chat-error', (payload: { message?: string }) => {
        setChatError(payload?.message || 'Unable to send this message.')
      })

      socket.on(
        'webrtc-signal',
        async (payload: {
          senderId: string
          signal: {
            type?: string
            sdp?: RTCSessionDescriptionInit
            candidate?: RTCIceCandidateInit
          }
        }) => {
          const { senderId, signal } = payload

          if (!senderId || !signal) return

          try {
            const peer = createPeer(
              senderId,
              namesRef.current.get(senderId) ||
                `Participant ${senderId.slice(0, 5)}`,
            )

            if (signal.type === 'offer' && signal.sdp) {
              await peer.setRemoteDescription(
                new RTCSessionDescription(signal.sdp),
              )

              const answer = await peer.createAnswer()
              await peer.setLocalDescription(answer)

              sendSignal(senderId, {
                type: 'answer',
                sdp: peer.localDescription,
              })
            } else if (signal.type === 'answer' && signal.sdp) {
              await peer.setRemoteDescription(
                new RTCSessionDescription(signal.sdp),
              )
            } else if (signal.type === 'candidate' && signal.candidate) {
              await peer.addIceCandidate(
                new RTCIceCandidate(signal.candidate),
              )
            }
          } catch (error) {
            console.error('WebRTC signaling error:', error)
            setMediaError(
              'A participant connection could not be established. Try leaving and rejoining.',
            )
          }
        },
      )
    }

    void startMeeting()

    return () => {
      cancelled = true

      socket?.disconnect()
      socketRef.current = null

      peersRef.current.forEach((peer) => peer.close())
      peersRef.current.clear()
      namesRef.current.clear()
      cameraStatusRef.current.clear()
      screenStatusRef.current.clear()

      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
  }, [
    meeting.id,
    userName,
    createPeer,
    makeOffer,
    removePeer,
    sendSignal,
  ])

  function toggleCamera() {
    const tracks = streamRef.current?.getVideoTracks() ?? []

    if (!tracks.length) {
      setMediaError('No camera is available or permission was not granted.')
      return
    }

    const next = !cameraOn
    tracks.forEach((track) => {
      track.enabled = next
    })
    setCameraOn(next)
    setMediaError('')
    socketRef.current?.emit('camera-status', {
      cameraOn: next,
    })
  }

  function toggleMicrophone() {
    const tracks = streamRef.current?.getAudioTracks() ?? []

    if (!tracks.length) {
      setMediaError('No microphone is available or permission was not granted.')
      return
    }

    const next = !micOn
    tracks.forEach((track) => {
      track.enabled = next
    })
    setMicOn(next)
  }

  
  async function stopScreenShare() {
    const screenStream = screenStreamRef.current
    if (!screenStream) return

    // Stop the screen capture.
    screenStream.getTracks().forEach((track) => {
      track.onended = null
      track.stop()
    })

    screenStreamRef.current = null

    // Restore the original camera track for every participant.
    const cameraTrack = streamRef.current?.getVideoTracks()[0] ?? null

    const replacements = Array.from(peersRef.current.values()).map(
      async (peer) => {
        const sender = peer.getSenders().find(
          (item) => item.track?.kind === 'video',
        )

        if (sender) {
          await sender.replaceTrack(cameraTrack)
        }
      },
    )

    await Promise.allSettled(replacements)

    if (videoRef.current) {
      videoRef.current.srcObject = streamRef.current
      void videoRef.current.play().catch(() => undefined)
    }

    setIsScreenSharing(false)
    socketRef.current?.emit('screen-share-status', {
      isScreenSharing: false,
    })
  }

  async function startScreenShare() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setMediaError('Screen sharing is not supported in this browser.')
      return
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      })

      const screenTrack = screenStream.getVideoTracks()[0]

      if (!screenTrack) {
        screenStream.getTracks().forEach((track) => track.stop())
        setMediaError('No screen-sharing video track was selected.')
        return
      }

      screenStreamRef.current = screenStream

      // Replace each peer's outgoing camera video with the screen.
      const replacements = Array.from(peersRef.current.values()).map(
        async (peer) => {
          const sender = peer.getSenders().find(
            (item) => item.track?.kind === 'video',
          )

          if (!sender) {
            throw new Error(
              'A video sender is unavailable. Camera permission may be required before sharing.',
            )
          }

          await sender.replaceTrack(screenTrack)
       },
      )

      const results = await Promise.allSettled(replacements)
      const failed = results.some((result) => result.status === 'rejected')

      if (failed) {
        await stopScreenShare()
        setMediaError(
          'Screen sharing could not be started for every participant. Please try again.',
        )
        return
      }

      if (videoRef.current) {
        videoRef.current.srcObject = screenStream
        void videoRef.current.play().catch(() => undefined)
      }

      setIsScreenSharing(true)
      setMediaError('')

      socketRef.current?.emit('screen-share-status', {
        isScreenSharing: true,
      })

      // The browser's own Stop sharing button also stops the share.
      screenTrack.onended = () => {
        void stopScreenShare()
      }
    } catch (error) {
      console.error('Screen sharing error:', error)

      if (screenStreamRef.current) {
        await stopScreenShare()
      }

      setMediaError(
        error instanceof Error
          ? error.message
          : 'Screen sharing was cancelled or could not be started.',
      )
    }
  }

  function toggleScreenShare() {
    if (isScreenSharing) {
      void stopScreenShare()
    } else {
      void startScreenShare()
    }
  }

  function sendChatMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = chatText.trim()
    const socket = socketRef.current
    if (!text || !socket?.connected) {
      setChatError(!socket?.connected ? 'Chat is not connected yet. Please try again.' : '')
      return
    }

    setChatError('')
    socket.emit('meeting-chat-message', {
      meetingId: meeting.id,
      text,
    })
    setChatText('')
  }

  function formatFileSize(bytes: number) {
    if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown size'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  async function uploadSharedFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Reset the input so selecting the same file again triggers change.
    event.target.value = ''
    if (!file) return

    const maxBytes = 10 * 1024 * 1024
    if (file.size > maxBytes) {
      setFileError('Please choose a file smaller than 10 MB.')
      return
    }

    const token = sessionStorage.getItem('viora_token')
    if (!token) {
      setFileError('Your session has expired. Please log in again.')
      return
    }

    setUploadingFile(true)
    setFileError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch(
        `${SOCKET_URL}/api/meetings/${encodeURIComponent(meeting.id)}/files`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        },
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.message || 'File upload failed. Please try again.')
      }

      const uploadedFile = data.file as SharedFile | undefined
      if (!uploadedFile?.url || !uploadedFile?.name) {
        throw new Error('The server returned an incomplete file response.')
      }

      setSharedFiles((current) => {
        if (current.some((item) => item.id === uploadedFile.id)) return current
        return [...current, uploadedFile]
      })
      socketRef.current?.emit('meeting-file-shared', {
        meetingId: meeting.id,
        file: uploadedFile,
      })
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'Unable to upload file.')
    } finally {
      setUploadingFile(false)
    }
  }

  // Redraw the normalized shared strokes whenever the board changes or resizes.
  useEffect(() => {
    const canvas = whiteboardCanvasRef.current
    if (!canvas) return

    const redraw = () => {
      const rect = canvas.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.round(rect.width * ratio)
      canvas.height = Math.round(rect.height * ratio)
      const context = canvas.getContext('2d')
      if (!context) return
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      context.clearRect(0, 0, rect.width, rect.height)
      context.lineCap = 'round'
      context.lineJoin = 'round'

      for (const stroke of whiteboardStrokes) {
        if (!stroke.points?.length) continue
        context.strokeStyle = stroke.color
        context.lineWidth = stroke.width
        context.beginPath()
        context.moveTo(stroke.points[0].x * rect.width, stroke.points[0].y * rect.height)
        if (stroke.points.length === 1) {
          context.lineTo(stroke.points[0].x * rect.width + 0.1, stroke.points[0].y * rect.height + 0.1)
        } else {
          for (const point of stroke.points.slice(1)) {
            context.lineTo(point.x * rect.width, point.y * rect.height)
          }
        }
        context.stroke()
      }
    }

    redraw()
    const observer = new ResizeObserver(redraw)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [whiteboardStrokes])

  function getWhiteboardPoint(event: ReactPointerEvent<HTMLCanvasElement>): WhiteboardPoint {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    }
  }

  function startWhiteboardStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const stroke: WhiteboardStroke = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      color: whiteboardColor,
      width: whiteboardWidth,
      points: [getWhiteboardPoint(event)],
    }
    activeStrokeRef.current = stroke
    setWhiteboardStrokes((current) => [...current, stroke].slice(-2000))
    socketRef.current?.emit('whiteboard-stroke', { meetingId: meeting.id, stroke })
  }

  function continueWhiteboardStroke(event: ReactPointerEvent<HTMLCanvasElement>) {
    const active = activeStrokeRef.current
    if (!active) return
    event.preventDefault()
    if (active.points.length >= 500) return
    const updatedStroke = { ...active, points: [...active.points, getWhiteboardPoint(event)] }
    activeStrokeRef.current = updatedStroke
    setWhiteboardStrokes((current) => current.map((stroke) => stroke.id === updatedStroke.id ? updatedStroke : stroke))
    socketRef.current?.emit('whiteboard-stroke', { meetingId: meeting.id, stroke: updatedStroke })
  }

  function finishWhiteboardStroke() {
    activeStrokeRef.current = null
  }

  function clearWhiteboard() {
    socketRef.current?.emit('whiteboard-clear', { meetingId: meeting.id })
  }

  async function copyRoomCode() {
    try {
      await navigator.clipboard.writeText(meeting.roomCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setMediaError(`Copy failed. Meeting code: ${meeting.roomCode}`)
    }
  }

  function leaveMeeting() {
    const activeSocket = socketRef.current
    if (activeSocket?.connected) {
      activeSocket.emit('leave-meeting', { meetingId: meeting.id })
    }
    activeSocket?.disconnect()
    socketRef.current = null

    peersRef.current.forEach((peer) => peer.close())
    peersRef.current.clear()

    screenStreamRef.current?.getTracks().forEach((track) => {
     track.onended = null
     track.stop()
    })
    screenStreamRef.current = null

    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null

    onLeave()
  }

  async function endMeetingForEveryone() {
    if (!window.confirm('End this meeting for everyone? All participants will be disconnected.')) return
    const activeSocket = socketRef.current
    if (!activeSocket?.connected) {
      setMeetingActionError('You are not connected to the meeting. Rejoin before ending it.')
      return
    }
    setMeetingActionLoading(true)
    setMeetingActionError('')

    // Socket.IO acknowledgement timeout prevents the control from staying
    // disabled forever if the server does not respond.
    activeSocket.timeout(8000).emit(
      'end-meeting',
      { meetingId: meeting.id },
      (timeoutError: Error | null, result?: { success: boolean; message?: string }) => {
        setMeetingActionLoading(false)

        if (timeoutError) {
          setMeetingActionError(
            'The server did not confirm that the meeting ended. Check your connection and try again.',
          )
          return
        }

        if (!result?.success) {
          setMeetingActionError(result?.message || 'Unable to end the meeting.')
          return
        }

        leaveMeeting()
      },
    )
  }

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [chatMessages])

  
const downloadSharedFile = async (file: {
  url: string
  name: string
}) => {
  try {
    // Use the same token key that your login code stores.
    const token = sessionStorage.getItem('viora_token')

    if (!token) {
      alert('Please log in again to download this file.')
      return
    }

    const downloadUrl = file.url.startsWith('http')
      ? file.url
      : `${SOCKET_URL}${file.url}`

    const response = await fetch(downloadUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error(
        `Download failed (${response.status}). Please try again.`,
      )
    }

    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = objectUrl
    link.download = file.name
    document.body.appendChild(link)
    link.click()
    link.remove()

    URL.revokeObjectURL(objectUrl)
  } catch (error) {
    console.error('File download error:', error)
    alert(
      error instanceof Error
        ? error.message
        : 'Unable to download the file.',
    )
  }
}



  return (
    <main className="meeting-room">
      <header className="meeting-room-header">
        <button
          type="button"
          className="room-back-button"
          onClick={leaveMeeting}
        >
          <ArrowLeft size={18} />
          Back to dashboard
        </button>

        <div className="room-brand">
          <span className="room-brand-icon">
            <Video size={21} />
          </span>
          <span>viora<span className="room-brand-dot">.</span></span>
        </div>

        <div className="room-live-indicator">
          <span />
          {connectionMessage}
        </div>
      </header>

      <section className="room-content">
        <div className="room-title-row">
          <div>
            <p className="room-eyebrow">YOUR MEETING</p>
            <h1>{meeting.title}</h1>
            <p className="room-subtitle">Signed in as {userName}</p>
          </div>

          <button
            type="button"
            className="room-code-button"
            onClick={() => void copyRoomCode()}
          >
            <Copy size={16} />
            {copied ? 'Copied!' : meeting.roomCode}
          </button>
        </div>

        {meetingActionError && (
          <p className="room-inline-error room-action-alert" role="alert">{meetingActionError}</p>
        )}

        <section className="room-participants-panel" aria-label="Meeting participants">
          <div className="room-panel-heading">
            <div className="room-panel-icon"><Users size={19} /></div>
            <div>
              <h2>Participants ({Object.keys(participantNames).length + 1})</h2>
              <p>People currently connected to this meeting</p>
            </div>
          </div>
          <div className="room-participants-list">
            <div className="room-participant-row">
              <span className="room-participant-avatar">{userName.trim().charAt(0).toUpperCase() || 'Y'}</span>
              <span>{userName} (You)</span>
              <span className="room-participant-online">You</span>
            </div>
            {Object.entries(participantNames).map(([id, name]) => (
              <div className="room-participant-row" key={id}>
                <span className="room-participant-avatar">{name.trim().charAt(0).toUpperCase() || 'P'}</span>
                <span>{name}</span>
                <span className="room-participant-online">Connected</span>
              </div>
            ))}
          </div>
        </section>

        <div className="room-video-grid">
          <article className="room-video-card">
            <div className="room-video-stage">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={cameraOn || isScreenSharing ? 'room-video visible' : 'room-video hidden'}
              />

              {!cameraOn && !isScreenSharing && (
                <div className="room-avatar-placeholder">
                  <div>{userName.trim().charAt(0).toUpperCase() || 'U'}</div>
                  <p>Camera off</p>
                </div>
              )}

              <span className="room-participant-name">{userName} (You)</span>
              <span className="room-participant-status">
                {micOn ? <Mic size={14} /> : <MicOff size={14} />}
                {micOn ? 'Microphone on' : 'Muted'}
              </span>
            </div>
          </article>

          {Object.entries(remoteParticipants).map(([id, participant]) => (
            <RemoteVideo key={id} peerId={id} participant={participant} />
          ))}

          {Object.keys(remoteParticipants).length === 0 && (
            <article className="room-empty-card">
              <div className="room-empty-icon">
                <Users size={30} />
              </div>
              <h2>Waiting for participants</h2>
              <p>Share the meeting code so others can join.</p>
              <button
                type="button"
                className="room-invite-button"
                onClick={() => void copyRoomCode()}
              >
                <Copy size={16} />
                {copied ? 'Code copied!' : 'Copy meeting code'}
              </button>
            </article>
          )}
        </div>

        <section className="room-panel room-whiteboard-panel" aria-label="Collaborative whiteboard">
          <div className="room-panel-heading">
            <div className="room-panel-icon"><Brush size={19} /></div>
            <div>
              <h2>Collaborative whiteboard</h2>
              <p>Draw together. Your strokes are shared with everyone in this meeting.</p>
            </div>
          </div>

          <div className="room-whiteboard-toolbar">
            <div className="room-whiteboard-colors" aria-label="Brush color">
              {[
                { value: '#7c3aed', label: 'Purple' },
                { value: '#2563eb', label: 'Blue' },
                { value: '#059669', label: 'Green' },
                { value: '#dc2626', label: 'Red' },
                { value: '#111827', label: 'Black' },
                { value: '#f59e0b', label: 'Amber' },
              ].map((color) => (
                <button
                  key={color.value}
                  type="button"
                  className={`room-whiteboard-color ${whiteboardColor === color.value ? 'selected' : ''}`}
                  style={{ backgroundColor: color.value }}
                  onClick={() => setWhiteboardColor(color.value)}
                  aria-label={`${color.label} brush`}
                  aria-pressed={whiteboardColor === color.value}
                  title={color.label}
                />
              ))}
            </div>
            <label className="room-whiteboard-size">
              Brush size
              <select value={whiteboardWidth} onChange={(event) => setWhiteboardWidth(Number(event.target.value))}>
                <option value={2}>Fine</option>
                <option value={4}>Medium</option>
                <option value={7}>Thick</option>
                <option value={10}>Extra thick</option>
              </select>
            </label>
            <button type="button" className="room-whiteboard-clear" onClick={clearWhiteboard}>
              <RotateCcw size={15} />
              Clear board
            </button>
          </div>

          <div className="room-whiteboard-canvas-wrap">
            <canvas
              ref={whiteboardCanvasRef}
              className="room-whiteboard-canvas"
              onPointerDown={startWhiteboardStroke}
              onPointerMove={continueWhiteboardStroke}
              onPointerUp={finishWhiteboardStroke}
              onPointerCancel={finishWhiteboardStroke}
              aria-label="Whiteboard drawing canvas. Use your mouse or touch to draw."
            />
            {whiteboardStrokes.length === 0 && (
              <div className="room-whiteboard-empty">Start drawing here — everyone in the meeting can see it.</div>
            )}
          </div>
          {whiteboardError && <p className="room-inline-error" role="alert">{whiteboardError}</p>}
          <p className="room-whiteboard-note">{whiteboardStrokes.length} shared stroke{whiteboardStrokes.length === 1 ? '' : 's'} · Updates are shared as you draw.</p>
        </section>

        <section className="room-collaboration-grid" aria-label="Meeting chat and file sharing">
          <article className="room-panel room-chat-panel">
            <div className="room-panel-heading">
              <div className="room-panel-icon"><MessageCircle size={19} /></div>
              <div>
                <h2>Meeting chat</h2>
                <p>Messages are shared with everyone in this meeting.</p>
              </div>
            </div>

            <div className="room-chat-messages" aria-live="polite" aria-label="Chat messages">
              {chatMessages.length === 0 ? (
                <div className="room-panel-empty">
                  <MessageCircle size={25} />
                  <p>No messages yet. Say hello to your team!</p>
                </div>
              ) : (
                chatMessages.map((message) => {
                  const ownMessage = message.senderName === userName
                  return (
                    <div className={`room-chat-message ${ownMessage ? 'own-message' : ''}`} key={message.id}>
                      <div className="room-chat-message-meta">
                        <strong>{ownMessage ? 'You' : message.senderName}</strong>
                        <time dateTime={message.createdAt}>
                          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </time>
                      </div>
                      <p>{message.text}</p>
                    </div>
                  )
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {chatError && <p className="room-inline-error" role="alert">{chatError}</p>}
            <form className="room-chat-form" onSubmit={sendChatMessage}>
              <input
                type="text"
                value={chatText}
                onChange={(event) => setChatText(event.target.value)}
                placeholder="Write a message..."
                maxLength={2000}
                aria-label="Chat message"
              />
              <button type="submit" disabled={!chatText.trim()} aria-label="Send message" title="Send message">
                <Send size={18} />
              </button>
            </form>
          </article>

          <article className="room-panel room-files-panel">
            <div className="room-panel-heading">
              <div className="room-panel-icon"><Paperclip size={19} /></div>
              <div>
                <h2>Shared files</h2>
                <p>Upload a file up to 10 MB for this meeting.</p>
              </div>
            </div>

            <input
              ref={fileInputRef}
              className="room-file-input"
              type="file"
              onChange={(event) => void uploadSharedFile(event)}
              disabled={uploadingFile}
              aria-label="Choose a file to share"
            />
            <button
              type="button"
              className="room-upload-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFile}
            >
              <Paperclip size={17} />
              {uploadingFile ? 'Uploading...' : 'Choose file to share'}
            </button>
            {fileError && <p className="room-inline-error" role="alert">{fileError}</p>}

            <div className="room-shared-files-list">
              {sharedFiles.length === 0 ? (
                <div className="room-panel-empty room-files-empty">
                  <FileText size={25} />
                  <p>No files shared yet.</p>
                </div>
              ) : (
                sharedFiles.map((file) => (
                  <div className="room-shared-file" key={file.id}>
                    <div className="room-file-icon"><FileText size={19} /></div>
                    <div className="room-file-details">
                      <strong title={file.name}>{file.name}</strong>
                      <span>{formatFileSize(file.size)} · {file.senderName}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadSharedFile(file)}
                      aria-label={`Download ${file.name}`}
                      title="Download file"
                      className="file-download-button"
                    >
                       <Download size={17} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </article>
        </section>

        {mediaError && (
          <div className="room-media-message" role="status">
            {mediaError}
          </div>
        )}

        <footer className="room-controls">
          <div className="room-control-group">
            <button
              type="button"
              className={`room-control ${micOn ? 'active' : 'muted'}`}
              onClick={toggleMicrophone}
              aria-label={micOn ? 'Mute microphone' : 'Unmute microphone'}
            >
              {micOn ? <Mic size={21} /> : <MicOff size={21} />}
            </button>
            <span>{micOn ? 'Mute' : 'Unmute'}</span>
          </div>

          <div className="room-control-group">
            <button
              type="button"
              className={`room-control ${cameraOn ? 'active' : 'muted'}`}
              onClick={toggleCamera}
              aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'}
            >
              {cameraOn ? <Camera size={21} /> : <CameraOff size={21} />}
            </button>
            <span>{cameraOn ? 'Camera on' : 'Camera off'}</span>
          </div>

          <div className="room-control-group">
            <button
              type="button"
              className={`room-control ${isScreenSharing ? 'active' : ''}`}
              onClick={toggleScreenShare}
              aria-label={isScreenSharing ? 'Stop screen sharing' : 'Share screen'}
              title={isScreenSharing ? 'Stop sharing' : 'Share your screen'}
            >
              <MonitorUp size={21} />
            </button>
            <span>{isScreenSharing ? 'Stop sharing' : 'Share screen'}</span>
          </div>

          <div className="room-control-group">
            <button
              type="button"
              className="room-control end-control"
              onClick={() => void endMeetingForEveryone()}
              disabled={meetingActionLoading}
              title="End meeting for everyone (host only)"
              aria-label="End meeting for everyone"
            >
              <PhoneOff size={21} />
            </button>
            <span>{meetingActionLoading ? 'Ending…' : 'End for all'}</span>
          </div>

          <div className="room-control-group">
            <button
              type="button"
              className="room-control leave-control"
              onClick={leaveMeeting}
              title="Leave meeting"
            >
              <PhoneOff size={21} />
            </button>
            <span>Leave</span>
          </div>
        </footer>

        <p className="room-footer-note">
          {startingMedia
            ? 'Requesting camera and microphone access...'
            : 'WebRTC signaling is active. Actual media connectivity depends on browser permissions and network configuration.'}
        </p>
      </section>
    </main>
  )
}
