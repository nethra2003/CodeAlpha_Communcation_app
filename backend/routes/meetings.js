const express = require('express')
const { randomBytes, randomUUID } = require('crypto')
const { z } = require('zod')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_CHAT_LENGTH = 2000

const uploadDirectory = path.join(
  __dirname,
  '..',
  'uploads',
  'meetings',
)

fs.mkdirSync(uploadDirectory, { recursive: true })

const storage = multer.diskStorage({
  destination(req, file, callback) {
    callback(null, uploadDirectory)
  },
  filename(req, file, callback) {
    const extension = path.extname(file.originalname).slice(0, 15)
    callback(
      null,
      `${req.params.meetingId}-${randomUUID()}${extension}`,
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

const createMeetingSchema = z.object({
  title: z.string().trim().min(1).max(100).default('Instant Meeting'),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
  durationHours: z.number().int().min(1).max(24).default(2),
})

function publicMeeting(meeting) {
  return {
    id: meeting.id,
    title: meeting.title,
    roomCode: meeting.roomCode,
    status: meeting.status,
    isPrivate: meeting.isPrivate,
    scheduledAt: meeting.scheduledAt,
    durationHours: meeting.durationHours ?? 2,
    expiresAt: meeting.expiresAt ?? null,
    startedAt: meeting.startedAt,
    createdAt: meeting.createdAt,
    host: {
      id: meeting.host.id,
      name: meeting.host.name,
    },
  }
}

async function requireMeetingParticipant(req, res, next) {
  try {
    const meetingId = req.params.meetingId

    const participant = await req.prisma.meetingParticipant.findUnique({
      where: {
        userId_meetingId: {
          userId: req.userId,
          meetingId,
        },
      },
    })

    const meeting = await req.prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { status: true },
    })

    if (
      !participant ||
      participant.leftAt ||
      !meeting ||
      meeting.status === 'ENDED'
    ) {
      return res.status(403).json({
        success: false,
        message: 'You must be an active participant in this meeting.',
      })
    }

    next()
  } catch (error) {
    console.error('Meeting membership check error:', error)
    res.status(500).json({
      success: false,
      message: 'Unable to verify meeting membership.',
    })
  }
}

// Create a meeting
router.post('/', requireAuth, async (req, res) => {
  try {
    const parsed = createMeetingSchema.safeParse(req.body || {})

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid meeting title.',
      })
    }

    const scheduledAt = parsed.data.scheduledAt ? new Date(parsed.data.scheduledAt) : null
    if (scheduledAt && scheduledAt.getTime() <= Date.now()) {
      return res.status(400).json({ success: false, message: 'Choose a future date and time for a scheduled meeting.' })
    }

    const meeting = await req.prisma.meeting.create({
      data: {
        title: parsed.data.title,
        roomCode: randomBytes(6).toString('hex').toUpperCase(),
        status: scheduledAt ? 'SCHEDULED' : 'ACTIVE',
        scheduledAt,
        durationHours: parsed.data.durationHours,
        expiresAt: new Date((scheduledAt ? scheduledAt.getTime() : Date.now()) + parsed.data.durationHours * 60 * 60 * 1000),
        startedAt: scheduledAt ? null : new Date(),
        hostId: req.userId,
        participants: {
          create: { userId: req.userId },
        },
      },
      include: {
        host: {
          select: { id: true, name: true },
        },
      },
    })

    res.status(201).json({
      success: true,
      message: scheduledAt ? 'Meeting scheduled successfully.' : 'Instant meeting created successfully.',
      meeting: publicMeeting(meeting),
    })
  } catch (error) {
    console.error('Create meeting error:', error)

    res.status(500).json({
      success: false,
      message: 'Unable to create meeting.',
    })
  }
})

// Join a meeting using its room code
router.post('/join', requireAuth, async (req, res) => {
  try {
    const roomCode =
      typeof req.body?.roomCode === 'string'
        ? req.body.roomCode.trim().toUpperCase()
        : ''

    if (!/^[A-F0-9]{12}$/.test(roomCode)) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid 12-character meeting code.',
      })
    }

    const meeting = await req.prisma.meeting.findUnique({
      where: { roomCode },
    })

    if (!meeting || meeting.status === 'ENDED') {
      return res.status(410).json({ success: false, message: 'Meeting completed. Unable to join this meeting.' })
    }
    const now = new Date()
    if (meeting.scheduledAt && meeting.scheduledAt > now && meeting.status === 'SCHEDULED') {
      return res.status(403).json({ success: false, message: `This meeting is scheduled for ${meeting.scheduledAt.toLocaleString()}. You can join at its start time.` })
    }
    if (meeting.expiresAt && meeting.expiresAt <= now) {
      await req.prisma.meeting.update({ where: { id: meeting.id }, data: { status: 'ENDED', endedAt: now } })
      return res.status(410).json({ success: false, message: 'Meeting completed. Its meeting link has expired and you cannot join.' })
    }

    const participant = await req.prisma.meetingParticipant.findUnique({
      where: {
        userId_meetingId: {
          userId: req.userId,
          meetingId: meeting.id,
        },
      },
    })

    if (!participant) {
      await req.prisma.meetingParticipant.create({
        data: {
          userId: req.userId,
          meetingId: meeting.id,
        },
      })
    } else if (participant.leftAt) {
      await req.prisma.meetingParticipant.update({
        where: { id: participant.id },
        data: { leftAt: null, joinedAt: new Date() },
      })
    }

    const updatedMeeting = await req.prisma.meeting.findUnique({
      where: { id: meeting.id },
      include: {
        host: {
          select: { id: true, name: true },
        },
      },
    })

    res.json({
      success: true,
      message: 'You joined the meeting successfully.',
      meeting: publicMeeting(updatedMeeting),
    })
  } catch (error) {
    console.error('Join meeting error:', error)

    res.status(500).json({
      success: false,
      message: 'Unable to join the meeting.',
    })
  }
})

// List meetings hosted by or joined by the logged-in user
router.get('/', requireAuth, async (req, res) => {
  try {
    const now = new Date()
    await req.prisma.meeting.updateMany({
      where: { status: { not: 'ENDED' }, expiresAt: { lte: now } },
      data: { status: 'ENDED', endedAt: now },
    })
    const meetings = await req.prisma.meeting.findMany({
      where: {
        OR: [
          { hostId: req.userId },
          { participants: { some: { userId: req.userId } } },
        ],
      },
      orderBy: [{ scheduledAt: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      include: {
        host: {
          select: { id: true, name: true },
        },
      },
    })

    res.json({
      success: true,
      meetings: meetings.map(publicMeeting),
    })
  } catch (error) {
    console.error('List meetings error:', error)

    res.status(500).json({
      success: false,
      message: 'Unable to retrieve meetings.',
    })
  }
})

// Retrieve persistent chat history for an active participant
router.get(
  '/:meetingId/messages',
  requireAuth,
  requireMeetingParticipant,
  async (req, res) => {
    try {
      const messages = await req.prisma.chatMessage.findMany({
        where: { meetingId: req.params.meetingId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          sender: {
            select: { id: true, name: true },
          },
        },
      })

      res.json({
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
      console.error('Get chat history error:', error)

      res.status(500).json({
        success: false,
        message: 'Unable to load chat history.',
      })
    }
  },
)

// Upload a file for an active meeting participant
router.post(
  '/:meetingId/files',
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

      const user = await req.prisma.user.findUnique({
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
        name: req.file.originalname,
        size: req.file.size,
        url: `/api/meetings/${req.params.meetingId}/files/${encodeURIComponent(req.file.filename)}`,
        senderId: user.id,
        senderName: user.name,
        createdAt: new Date().toISOString(),
      }

      res.status(201).json({
        success: true,
        message: 'File uploaded successfully.',
        file,
      })
    } catch (error) {
      console.error('File upload error:', error)

      if (req.file?.path) {
        fs.unlink(req.file.path, () => {})
      }

      res.status(500).json({
        success: false,
        message: 'Unable to upload the file.',
      })
    }
  },
)

// List files uploaded for a meeting
router.get(
  '/:meetingId/files',
  requireAuth,
  requireMeetingParticipant,
  async (req, res) => {
    try {
      const prefix = `${req.params.meetingId}-`
      const names = fs.readdirSync(uploadDirectory)
        .filter((name) => name.startsWith(prefix))
        .filter((name) => {
          try {
            return fs.statSync(path.join(uploadDirectory, name)).isFile()
          } catch {
            return false
          }
        })

      res.json({
        success: true,
        files: names.map((name) => {
          const stats = fs.statSync(path.join(uploadDirectory, name))

          return {
            id: name,
            name: name.slice(prefix.length).replace(/^[0-9a-f-]+-/i, ''),
            size: stats.size,
            url: `/api/meetings/${req.params.meetingId}/files/${encodeURIComponent(name)}`,
          }
        }),
      })
    } catch (error) {
      console.error('List meeting files error:', error)

      res.status(500).json({
        success: false,
        message: 'Unable to list meeting files.',
      })
    }
  },
)

// Download a file only if the requester is an active participant
router.get(
  '/:meetingId/files/:filename',
  requireAuth,
  requireMeetingParticipant,
  (req, res) => {
    const filename = path.basename(req.params.filename)
    const expectedPrefix = `${req.params.meetingId}-`

    if (!filename.startsWith(expectedPrefix)) {
      return res.status(404).json({
        success: false,
        message: 'File not found.',
      })
    }

    const filePath = path.join(uploadDirectory, filename)

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found.',
      })
    }

    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Disposition', 'attachment')

    res.download(filePath, (error) => {
      if (error && !res.headersSent) {
        console.error('Download error:', error)
        res.status(500).json({
          success: false,
          message: 'Unable to download the file.',
        })
      }
    })
  },
)

// Handle upload-size errors for routes in this router.
router.use((error, req, res, next) => {
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

module.exports = router
