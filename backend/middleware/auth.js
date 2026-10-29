const jwt = require('jsonwebtoken')

function requireAuth(req, res, next) {
  const authorization = req.headers.authorization

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
    })
  }

  const token = authorization.slice(7)

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)

    if (
      typeof payload !== 'object' ||
      typeof payload.sub !== 'string'
    ) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token',
      })
    }

    req.userId = payload.sub
    next()
  } catch {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    })
  }
}

module.exports = { requireAuth }
