const express = require('express')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { z } = require('zod')
const { rateLimit } = require('express-rate-limit')
const { requireAuth } = require('../middleware/auth')

const router = express.Router()

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Try again later.',
  },
})

const registerSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(72),
})

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(72),
})

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    role: user.role,
    createdAt: user.createdAt,
  }
}

function createToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured')
  }

  return jwt.sign(
    {},
    process.env.JWT_SECRET,
    {
      subject: user.id,
      expiresIn: '1h',
      issuer: 'viora-api',
      audience: 'viora-client',
    }
  )
}

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body)

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Please check your registration details.',
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }

    const name = parsed.data.name
    const email = parsed.data.email.toLowerCase()
    const password = parsed.data.password

    const existingUser = await req.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    })

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists.',
      })
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const user = await req.prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
      },
    })

    const token = createToken(user)

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      token,
      user: publicUser(user),
    })
  } catch (error) {
    // Handles concurrent registration attempts for the same email.
    if (error.code === 'P2002') {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists.',
      })
    }

    next(error)
  }
})

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body)

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email and password.',
      })
    }

    const email = parsed.data.email.toLowerCase()
    const password = parsed.data.password

    const user = await req.prisma.user.findUnique({
      where: { email },
    })

    // Use the same response for unknown email and wrong password.
    if (
      !user ||
      !(await bcrypt.compare(password, user.passwordHash))
    ) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      })
    }

    const token = createToken(user)

    return res.json({
      success: true,
      message: 'Login successful.',
      token,
      user: publicUser(user),
    })
  } catch (error) {
    next(error)
  }
})

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await req.prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        name: true,
        email: true,
        avatarUrl: true,
        role: true,
        createdAt: true,
      },
    })

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User account not found.',
      })
    }

    return res.json({
      success: true,
      user,
    })
  } catch (error) {
    next(error)
  }
})

module.exports = router
