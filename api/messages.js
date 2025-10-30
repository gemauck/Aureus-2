// Messages API endpoint for employee chat
import { authRequired } from './_lib/authRequired.js'
import { prisma } from './_lib/prisma.js'
import { badRequest, ok, serverError, unauthorized } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
    // GET - Get all messages (all employees can view all messages)
    if (req.method === 'GET') {
        try {
            // Check if user is authenticated
            if (!req.user) {
                console.error('❌ Messages endpoint: req.user is missing')
                return unauthorized(res, 'Authentication required')
            }

            // Get query params for pagination
            const limit = parseInt(req.query?.limit) || 50;
            const skip = parseInt(req.query?.skip) || 0;

            // Get all messages with sender info, ordered by newest first
            const messages = await prisma.message.findMany({
                include: {
                    sender: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            avatar: true,
                            role: true
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                },
                take: limit,
                skip: skip
            });

            console.log(`✅ Messages endpoint: Retrieved ${messages.length} messages`)
            return ok(res, { messages: messages.reverse() }) // Reverse to show oldest first
        } catch (error) {
            console.error('❌ Failed to get messages:', error)
            return serverError(res, 'Failed to get messages', error.message)
        }
    }

    // POST - Create a new message (all employees can send messages)
    if (req.method === 'POST') {
        try {
            // Check if user is authenticated
            if (!req.user) {
                console.error('❌ Messages endpoint: req.user is missing')
                return unauthorized(res, 'Authentication required')
            }

            const { content } = req.body

            // Validate input
            if (!content || !content.trim()) {
                return badRequest(res, 'Message content is required')
            }

            if (content.length > 5000) {
                return badRequest(res, 'Message content cannot exceed 5000 characters')
            }

            // Create message
            const message = await prisma.message.create({
                data: {
                    senderId: req.user.sub,
                    content: content.trim()
                },
                include: {
                    sender: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            avatar: true,
                            role: true
                        }
                    }
                }
            })

            console.log(`✅ Messages endpoint: Message created by ${req.user.sub}`)
            return ok(res, { message }, 201)
        } catch (error) {
            console.error('❌ Failed to create message:', error)
            return serverError(res, 'Failed to create message', error.message)
        }
    }

    // Unsupported method
    return badRequest(res, 'Method not allowed')
}

export default withHttp(withLogging(authRequired(handler)))

