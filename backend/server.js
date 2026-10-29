const express = require('express')
const http = require('http')
const cors = require('cors')
const helmet = require('helmet')
const { Server } = require('socket.io')
const { Pool } = require('pg')
const { PrismaPg } = require('@prisma/adapter-pg')
const { PrismaClient } = require('@prisma/client')
const jwt = require('jsonwebtoken')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { randomUUID } = require('crypto')

require('dotenv').config()

const authRoutes = require('./routes/auth')
const meetingRoutes = require('./routes/meetings')
const { requireAuth } = require('./middleware/auth')

const app = express()
const server = http.createServer(app)

const PORT = Number(process.env.PORT) || 5000
const FRONTEND_URL =
  process.env.FRONTEND_URL || 'http://localhost:5173'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_MESSAGE_LENGTH = 2000

// --------------------------------------------------
// PostgreSQL and Prisma
// --------------------------------------------------

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
})

const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// --------------------------------------------------
// Upload directory
// --------------------------------------------------

const uploadDirectory = path.join(
  __dirname,
  'uploads',
  'meetings',
)

fs.mkdirSync(uploadDirectory, { recursive: true })

// --------------------------------------------------
// Express middleware
// --------------------------------------------------

app.use(helmet())

app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  }),
)

app.use(express.json({ limit: '1mb' }))

app.use((req, res, next) => {
  req.prisma = prisma
  next()
})

app.use('/api/auth', authRoutes)
app.use('/api/meetings', meetingRoutes)

// Shared files are private: every download requires authentication and active meeting membership.
app.get(
  '/api/meetings/:meetingId/files/:fileId',
  requireAuth,
  requireMeetingParticipant,
  async (req, res) => {
    try {
      const { meetingId, fileId } = req.params
      const safeId = path.basename(fileId)
      if (safeId !== fileId || !safeId.startsWith(`${meetingId}-`)) {
        return res.status(404).json({ success: false, message: 'File not found.' })
      }
      const record = await prisma.sharedFile.findFirst({
        where: { id: safeId, meetingId },
        select: { id: true, name: true },
      })
      if (!record) return res.status(404).json({ success: false, message: 'File not found.' })
      const filePath = path.join(uploadDirectory, safeId)
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return res.status(404).json({ success: false, message: 'File is no longer available.' })
      }
      res.setHeader('X-Content-Type-Options', 'nosniff')
      return res.download(filePath, path.basename(record.name))
    } catch (error) {
      console.error('Secure file download failed:', error)
      return res.status(500).json({ success: false, message: 'Unable to download this file.' })
    }
  },
)

// --------------------------------------------------
// Health checks
// --------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Viora backend is running',
  })
})

app.get('/api/health/db', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`

    res.json({
      success: true,
      message: 'Viora database connection is working',
    })
  } catch (error) {
    console.error('Database health check failed:', error.message)

    res.status(503).json({
      success: false,
      message: 'Database connection failed',
    })
  }
})

// --------------------------------------------------
// Meeting membership helpers
// --------------------------------------------------

async function isMeetingParticipant(meetingId, userId) {
  if (
    typeof meetingId !== 'string' ||
    typeof userId !== 'string'
  ) {
    return false
  }

  const participant = await prisma.meetingParticipant.findUnique({
    where: {
      userId_meetingId: {
        userId,
        meetingId,
      },
    },
  })

  if (!participant || participant.leftAt) {
    return false
  }

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { status: true },
  })

  return Boolean(meeting && meeting.status !== 'ENDED')
}

async function requireMeetingParticipant(req, res, next) {
  try {
    const meetingId = req.params.meetingId
    const allowed = await isMeetingParticipant(
      meetingId,
      req.userId,
    )

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: 'You must join this meeting before sharing files.',
      })
    }

    next()
  } catch (error) {
    console.error('Meeting membership check failed:', error)

    res.status(500).json({
      success: false,
      message: 'Unable to verify meeting membership.',
    })
  }
}

// --------------------------------------------------
// File upload endpoint
// POST /api/meetings/:meetingId/files
// --------------------------------------------------

const storage = multer.diskStorage({
  destination(req, file, callback) {
    callback(null, uploadDirectory)
  },

  filename(req, file, callback) {
    const meetingId = req.params.meetingId
    const extension = path.extname(file.originalname).slice(0, 15)

    // Prefix each generated filename with its meeting ID.
    callback(
      null,
      `${meetingId}-${randomUUID()}${extension}`,
    )
  },
})

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
})

app.post(
  '/api/meetings/:meetingId/files',
  requireAuth,
  requireMeetingParticipant,
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Please choose a file to upload.',
        })
      }

      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { id: true, name: true },
      })

      if (!user) {
        fs.unlink(req.file.path, () => {})

        return res.status(401).json({
          success: false,
          message: 'User account not found.',
        })
      }

      const file = {
        id: req.file.filename,
        name: req.file.originalname.slice(0, 255),
        size: req.file.size,
        url: `/api/meetings/${req.params.meetingId}/files/${encodeURIComponent(req.file.filename)}`,
        senderId: user.id,
        senderName: user.name,
        createdAt: new Date().toISOString(),
      }
      
      await prisma.sharedFile.create({
        data: {
        id: file.id,
        name: file.name,
        size: file.size,
        url: file.url,
        meetingId: req.params.meetingId,
        senderId: user.id,
        },
      })

      console.log(
        `File uploaded by ${user.name} to meeting ${req.params.meetingId}: ${file.name}`,
      )

      return res.status(201).json({
        success: true,
        message: 'File uploaded successfully.',
        file,
      })
    } catch (error) {
      console.error('File upload error:', error)

      if (req.file?.path) {
        fs.unlink(req.file.path, () => {})
      }

      return res.status(500).json({
        success: false,
        message: 'Unable to upload the file.',
      })
    }
  },
)

// --------------------------------------------------
// Get shared-file history
// GET /api/meetings/:meetingId/files
// --------------------------------------------------

app.get(
  '/api/meetings/:meetingId/files',
  requireAuth,
  requireMeetingParticipant,
  async (req, res) => {
    try {
      const files = await prisma.sharedFile.findMany({
        where: {
          meetingId: req.params.meetingId,
        },
        orderBy: {
          createdAt: 'asc',
        },
        include: {
          sender: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      })

      const existingFiles = files
        .filter((file) => {
          const fileName = path.basename(file.id)
          const filePath = path.join(uploadDirectory, fileName)

          return (
            fileName === file.id &&
            fileName.startsWith(`${req.params.meetingId}-`) &&
            fs.existsSync(filePath) &&
            fs.statSync(filePath).isFile()
          )
        })
        .map((file) => ({
          id: file.id,
          name: file.name,
          size: file.size,
          url: file.url,
          senderId: file.senderId,
          senderName: file.sender.name,
          createdAt: file.createdAt.toISOString(),
        }))

      return res.json({
        success: true,
        files: existingFiles,
      })
    } catch (error) {
      console.error('Load shared-file history error:', error)

      return res.status(500).json({
        success: false,
        message: 'Unable to load shared files.',
        files: [],
      })
    }
  },
)

// Handle Multer errors, including files exceeding 10 MB.
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    const message =
      error.code === 'LIMIT_FILE_SIZE'
        ? 'File size must not exceed 10 MB.'
        : 'The file could not be uploaded.'

    return res.status(400).json({
      success: false,
      message,
    })
  }

  next(error)
})

// --------------------------------------------------
// Socket.IO server and authentication
// --------------------------------------------------

const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
})

// Authenticate sockets using the same JWT as the frontend.
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token

    if (typeof token !== 'string' || !token) {
      return next(new Error('Authentication required'))
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET)

    if (
      typeof payload !== 'object' ||
      typeof payload.sub !== 'string'
    ) {
      return next(new Error('Invalid authentication token'))
    }

    socket.data.userId = payload.sub
    next()
  } catch {
    next(new Error('Invalid or expired authentication token'))
  }
})

// --------------------------------------------------
// Socket.IO events
// --------------------------------------------------

io.on('connection', (socket) => {
  console.log('Authenticated client connected:', socket.id)

  // Join an existing meeting after checking membership.
  socket.on('join-room', async (payload, callback) => {
    const reply =
      typeof callback === 'function' ? callback : () => {}

    try {
      const roomId = payload?.roomId

      if (
        typeof roomId !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,80}$/.test(roomId)
      ) {
        return reply({
          success: false,
          error: 'Invalid meeting ID.',
        })
      }

      const allowed = await isMeetingParticipant(
        roomId,
        socket.data.userId,
      )

      if (!allowed) {
        return reply({
          success: false,
          error: 'Join this meeting before connecting to its room.',
        })
      }

      const user = await prisma.user.findUnique({
        where: { id: socket.data.userId },
        select: { id: true, name: true },
      })

      if (!user) {
        return reply({
          success: false,
          error: 'User account not found.',
        })
      }

      // Leave any previous meeting room.
      for (const room of socket.rooms) {
        if (room !== socket.id) {
          socket.leave(room)
        }
      }

      const existingRoom = io.sockets.adapter.rooms.get(roomId)

      const participants = existingRoom
        ? [...existingRoom]
            .filter((id) => id !== socket.id)
            .map((id) => {
              const participantSocket = io.sockets.sockets.get(id)

              return {
                socketId: id,
                displayName:
                  participantSocket?.data.displayName ||
                  'Participant',
              }
            })
        : []

      socket.join(roomId)
      socket.data.roomId = roomId
      socket.data.displayName = user.name

      await prisma.meetingParticipant.update({
        where: { userId_meetingId: { userId: socket.data.userId, meetingId: roomId } },
        data: { leftAt: null },
      }).catch(() => {})

      socket.to(roomId).emit('participant-joined', {
        socketId: socket.id,
        userId: user.id,
        displayName: user.name,
      })

      reply({
        success: true,
        socketId: socket.id,
        participants,
      })

      console.log(`${user.name} joined meeting ${roomId}`)
    } catch (error) {
      console.error('Join socket room error:', error)

      reply({
        success: false,
        error: 'Unable to join the meeting room.',
      })
    }
  })

  // Relay WebRTC offers, answers, and ICE candidates.
  socket.on('webrtc-signal', (payload) => {
    if (!payload || typeof payload !== 'object') return

    const { targetId, signal } = payload
    const roomId = socket.data.roomId
    const targetSocket = io.sockets.sockets.get(targetId)

    if (
      typeof targetId !== 'string' ||
      !signal ||
      typeof signal !== 'object' ||
      !roomId ||
      !targetSocket ||
      targetSocket.data.roomId !== roomId
    ) {
      return
    }

    io.to(targetId).emit('webrtc-signal', {
      senderId: socket.id,
      signal,
    })
  })

  // Broadcast camera on/off status.
  socket.on('camera-status', (payload) => {
    const roomId = socket.data.roomId

    if (
      !roomId ||
      typeof payload?.cameraOn !== 'boolean'
    ) {
      return
    }

    socket.to(roomId).emit('camera-status', {
      socketId: socket.id,
      cameraOn: payload.cameraOn,
    })
  })

  // Broadcast screen-sharing start/stop status.
  socket.on('screen-share-status', (payload) => {
    const roomId = socket.data.roomId

    if (
      !roomId ||
      typeof payload?.isScreenSharing !== 'boolean'
    ) {
      return
    }

    socket.to(roomId).emit('screen-share-status', {
      socketId: socket.id,
      isScreenSharing: payload.isScreenSharing,
    })
  })

  // ----------------------------------------------
  // Real-time meeting chat
  // Event: meeting-chat-message
  // ----------------------------------------------

  
  // Send chat history to a participant after joining a meeting.
  socket.on('meeting-chat-history', async (payload, callback) => {
    const reply =
      typeof callback === 'function' ? callback : () => {}

    try {
      const roomId = socket.data.roomId
      const meetingId = payload?.meetingId

      if (!roomId || meetingId !== roomId) {
        return reply({
          success: false,
          message: 'You are not connected to this meeting.',
          messages: [],
        })
      }

      const allowed = await isMeetingParticipant(
        roomId,
        socket.data.userId,
      )

      if (!allowed) {
        return reply({
          success: false,
          message: 'You are not an active meeting participant.',
          messages: [],
        })
      }

      const messages = await prisma.chatMessage.findMany({
        where: { meetingId: roomId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          sender: {
            select: { id: true, name: true },
          },
        },
      })

      reply({
        success: true,
        messages: messages.reverse().map((message) => ({
          id: message.id,
          senderId: message.senderId,
          senderName: message.sender.name,
          text: message.text,
          createdAt: message.createdAt.toISOString(),
        })),
      })
    } catch (error) {
      console.error('Load chat history error:', error)

      reply({
        success: false,
        message: 'Unable to load chat history.',
        messages: [],
      })
    }
  })

  // Save chat messages before broadcasting them.
  socket.on('meeting-chat-message', async (payload) => {
    try {
      const roomId = socket.data.roomId
      const meetingId = payload?.meetingId
      const text =
        typeof payload?.text === 'string'
          ? payload.text.trim()
          : ''

      if (
        !roomId ||
        meetingId !== roomId ||
        !text ||
        text.length > 2000
      ) {
        socket.emit('meeting-chat-error', {
          message: 'Enter a message of up to 2000 characters.',
        })
        return
      }

      const allowed = await isMeetingParticipant(
        roomId,
        socket.data.userId,
      )

      if (!allowed) {
        socket.emit('meeting-chat-error', {
          message: 'You are not an active participant in this meeting.',
        })
        return
      }

      const savedMessage = await prisma.chatMessage.create({
        data: {
          text,
          senderId: socket.data.userId,
          meetingId: roomId,
        },
        include: {
          sender: {
            select: { id: true, name: true },
          },
        },
      })

      const message = {
        id: savedMessage.id,
        senderId: savedMessage.senderId,
        senderName: savedMessage.sender.name,
        text: savedMessage.text,
        createdAt: savedMessage.createdAt.toISOString(),
      }

      io.to(roomId).emit('meeting-chat-message', message)

      console.log(
        `Saved chat message from ${message.senderName} in meeting ${roomId}`,
      )
    } catch (error) {
      console.error('Save chat message error:', error)

      socket.emit('meeting-chat-error', {
        message: 'Unable to save or send this message.',
      })
    }
  })


  // ----------------------------------------------
  // Notify the room that a file was uploaded.
  // Event: meeting-file-shared
  // ----------------------------------------------

  
  socket.on('meeting-file-shared', async (payload) => {
    try {
      const roomId = socket.data.roomId
      const meetingId = payload?.meetingId
      const file = payload?.file

      if (
        !roomId ||
        meetingId !== roomId ||
        !file ||
        typeof file.name !== 'string' ||
        typeof file.url !== 'string' ||
        typeof file.id !== 'string'
      ) {
        return
      }

      const allowed = await isMeetingParticipant(
        roomId,
        socket.data.userId,
      )

      if (!allowed) return

      // Validate the generated filename and ensure it belongs
      // to the current meeting.
      const fileName = path.basename(file.id)
      const expectedPrefix = `${roomId}-`
      const expectedUrl =
        `/api/meetings/${roomId}/files/${encodeURIComponent(fileName)}`

      const filePath = path.join(uploadDirectory, fileName)

      if (
        fileName !== file.id ||
        !fileName.startsWith(expectedPrefix) ||
        file.url !== expectedUrl ||
        !fs.existsSync(filePath) ||
        !fs.statSync(filePath).isFile()
      ) {
        socket.emit('meeting-chat-error', {
          message: 'The shared file could not be verified.',
        })
        return
      }

      const user = await prisma.user.findUnique({
        where: { id: socket.data.userId },
        select: { id: true, name: true },
      })

      if (!user) return

      const sharedFile = {
        id: fileName,
        name: file.name.slice(0, 255),
        size: Number.isFinite(file.size) ? file.size : 0,
        url: expectedUrl,
        senderId: user.id,
        senderName: user.name,
        createdAt: new Date().toISOString(),
      }

      // Send the verified file information to other participants.
      socket.to(roomId).emit('meeting-file-shared', sharedFile)

      console.log(
        `File shared by ${user.name} in meeting ${roomId}: ${sharedFile.name}`,
      )
    } catch (error) {
      console.error('File sharing event error:', error)
    }
  })

  
  
  // ----------------------------------------------
  // Persistent collaborative whiteboard
  // ----------------------------------------------

  const MAX_WHITEBOARD_STROKES = 2000
  const MAX_WHITEBOARD_POINTS = 500
  const MAX_WHITEBOARD_WIDTH = 40

  // Load persisted drawings when a participant opens the whiteboard.
  socket.on('whiteboard-history', async (payload, callback) => {
    const reply =
      typeof callback === 'function' ? callback : () => {}

    try {
      const roomId = socket.data.roomId

      if (!roomId || payload?.meetingId !== roomId) {
        return reply({
          success: false,
          strokes: [],
          message: 'You are not connected to this meeting.',
        })
      }

      const allowed = await isMeetingParticipant(
        roomId,
        socket.data.userId,
      )

      if (!allowed) {
        return reply({
          success: false,
          strokes: [],
          message: 'You are not an active meeting participant.',
        })
      }

      const records = await prisma.whiteboardStroke.findMany({
        where: { meetingId: roomId },
        orderBy: { createdAt: 'asc' },
        take: MAX_WHITEBOARD_STROKES,
      })

      const strokes = records.map((record) => ({
        id: record.strokeId,
        color: record.color,
        width: record.width,
        points: record.points,
        senderId: record.senderId,
      }))

      reply({ success: true, strokes })
    } catch (error) {
      console.error('Whiteboard history error:', error)

      reply({
        success: false,
        strokes: [],
        message: 'Unable to load the whiteboard.',
      })
    }
  })

  // Create or update a stroke in PostgreSQL and broadcast it.
  socket.on('whiteboard-stroke', async (payload) => {
    try {
      const roomId = socket.data.roomId
      const stroke = payload?.stroke

      if (!roomId || payload?.meetingId !== roomId || !stroke) {
        return
      }

      const allowed = await isMeetingParticipant(
        roomId,
        socket.data.userId,
      )

      if (!allowed) return

      if (
        typeof stroke.id !== 'string' ||
        stroke.id.length < 1 ||
        stroke.id.length > 100 ||
        typeof stroke.color !== 'string' ||
        !/^#[0-9a-fA-F]{6}$/.test(stroke.color) ||
        typeof stroke.width !== 'number' ||
        !Number.isFinite(stroke.width) ||
        stroke.width < 1 ||
        stroke.width > MAX_WHITEBOARD_WIDTH ||
        !Array.isArray(stroke.points) ||
        stroke.points.length < 1 ||
        stroke.points.length > MAX_WHITEBOARD_POINTS
      ) {
        return
      }

      const points = []

      for (const point of stroke.points) {
        if (
          !Number.isFinite(point?.x) ||
          !Number.isFinite(point?.y) ||
          point.x < 0 ||
          point.x > 1 ||
          point.y < 0 ||
          point.y > 1
        ) {
          return
        }

        points.push({ x: point.x, y: point.y })
      }

      const strokeData = {
        color: stroke.color,
        width: stroke.width,
        points,
        senderId: socket.data.userId,
      }

      // Prevent another participant from overwriting a stroke
      // that already belongs to someone else.
      const existing = await prisma.whiteboardStroke.findUnique({
        where: {
          meetingId_strokeId: {
            meetingId: roomId,
            strokeId: stroke.id,
          },
        },
        select: { senderId: true },
      })

      if (existing && existing.senderId !== socket.data.userId) {
        return
      }

      await prisma.whiteboardStroke.upsert({
        where: {
          meetingId_strokeId: {
            meetingId: roomId,
            strokeId: stroke.id,
          },
        },
        create: {
          strokeId: stroke.id,
          meetingId: roomId,
          ...strokeData,
        },
        update: {
          color: stroke.color,
          width: stroke.width,
          points,
        },
      })

      // Broadcast only after the database write succeeds.
      io.to(roomId).emit('whiteboard-stroke', {
        meetingId: roomId,
        stroke: {
          id: stroke.id,
          ...strokeData,
        },
      })

      // Enforce the per-meeting stroke limit.
      const overflow = await prisma.whiteboardStroke.findMany({
        where: { meetingId: roomId },
        orderBy: { createdAt: 'desc' },
        skip: MAX_WHITEBOARD_STROKES,
        select: { id: true },
      })

      if (overflow.length > 0) {
        await prisma.whiteboardStroke.deleteMany({
          where: {
            id: { in: overflow.map((item) => item.id) },
          },
        })
      }
    } catch (error) {
      console.error('Whiteboard stroke error:', error)
    }
  })

  // Clear the persistent board for this meeting.
  socket.on('whiteboard-clear', async (payload) => {
    try {
      const roomId = socket.data.roomId

      if (!roomId || payload?.meetingId !== roomId) {
        return
      }

      const allowed = await isMeetingParticipant(
        roomId,
        socket.data.userId,
      )

      if (!allowed) return

      await prisma.whiteboardStroke.deleteMany({
        where: { meetingId: roomId },
      })

      io.to(roomId).emit('whiteboard-cleared', {
        meetingId: roomId,
        clearedBy: socket.data.userId,
      })

      console.log(`Whiteboard cleared in meeting ${roomId}`)
    } catch (error) {
      console.error('Whiteboard clear error:', error)
    }
  })


  // Leave only this participant's socket; the meeting remains active.
  socket.on('leave-meeting', async (payload, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {}
    const roomId = socket.data.roomId
    try {
      if (!roomId || payload?.meetingId !== roomId) {
        return reply({ success: false, message: 'You are not in this meeting.' })
      }
      await prisma.meetingParticipant.updateMany({
        where: { meetingId: roomId, userId: socket.data.userId, leftAt: null },
        data: { leftAt: new Date() },
      })
      socket.to(roomId).emit('participant-left', { socketId: socket.id, userId: socket.data.userId })
      await socket.leave(roomId)
      socket.data.roomId = null
      reply({ success: true })
    } catch (error) {
      console.error('Leave meeting error:', error)
      reply({ success: false, message: 'Unable to leave the meeting cleanly.' })
    }
  })

  // Only the meeting host may end the meeting for everyone.
  socket.on('end-meeting', async (payload, callback) => {
    const reply = typeof callback === 'function' ? callback : () => {}
    const roomId = socket.data.roomId
    try {
      if (!roomId || payload?.meetingId !== roomId) {
        return reply({ success: false, message: 'You are not in this meeting.' })
      }
      const meeting = await prisma.meeting.findUnique({
        where: { id: roomId },
        select: { hostId: true, status: true },
      })
      if (!meeting || meeting.hostId !== socket.data.userId) {
        return reply({ success: false, message: 'Only the meeting host can end this meeting.' })
      }
      if (meeting.status === 'ENDED') return reply({ success: true })
      await prisma.meeting.update({
        where: { id: roomId },
        data: { status: 'ENDED', endedAt: new Date() },
      })
      await prisma.meetingParticipant.updateMany({
        where: { meetingId: roomId, leftAt: null },
        data: { leftAt: new Date() },
      })
      io.to(roomId).emit('meeting-ended', { meetingId: roomId, message: 'The host ended this meeting.' })

      // Acknowledge as soon as the database state is saved and the end event
      // is broadcast. Room cleanup is best-effort and must not block the UI.
      reply({ success: true })
      void (async () => {
        try {
          const sockets = await io.in(roomId).fetchSockets()
          for (const participantSocket of sockets) {
            participantSocket.data.roomId = null
            await participantSocket.leave(roomId)
          }
        } catch (cleanupError) {
          console.error('Meeting room cleanup error:', cleanupError)
        }
      })()
    } catch (error) {
      console.error('End meeting error:', error)
      reply({ success: false, message: 'Unable to end the meeting.' })
    }
  })

  // Notify the other participants when a socket disconnects.
  socket.on('disconnect', () => {
    const roomId = socket.data.roomId

    if (roomId) {
      socket.to(roomId).emit('participant-left', {
        socketId: socket.id,
        userId: socket.data.userId,
      })
      void prisma.meetingParticipant.updateMany({
        where: { meetingId: roomId, userId: socket.data.userId, leftAt: null },
        data: { leftAt: new Date() },
      }).catch((error) => console.error('Participant leave update failed:', error))
    }

    console.log('Client disconnected:', socket.id)
  })
})

// --------------------------------------------------
// Graceful shutdown
// --------------------------------------------------

let isShuttingDown = false

async function shutdown(signal) {
  if (isShuttingDown) return
  isShuttingDown = true

  console.log(`${signal} received. Shutting down Viora...`)

  io.close()

  if (server.listening) {
    await new Promise((resolve) => server.close(resolve))
  }

  try {
    await prisma.$disconnect()
    await pool.end()
    console.log('Database connections closed.')
    process.exit(0)
  } catch (error) {
    console.error('Error during shutdown:', error)
    process.exit(1)
  }
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

// --------------------------------------------------
// Start the server after checking PostgreSQL
// --------------------------------------------------

async function startServer() {
  try {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is missing from backend/.env')
    }

    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is missing from backend/.env')
    }

    await prisma.$connect()
    await prisma.$queryRaw`SELECT 1`

    server.listen(PORT, () => {
      console.log(`Viora backend running at http://localhost:${PORT}`)
      console.log('PostgreSQL connection established.')
      console.log('Meeting chat and file-sharing endpoints are ready.')
    })
  } catch (error) {
    console.error('Unable to start Viora backend:', error.message)

    await prisma.$disconnect().catch(() => {})
    await pool.end().catch(() => {})
    process.exitCode = 1
  }
}

void startServer()
