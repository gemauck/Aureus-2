import { prisma } from './_lib/prisma.js'
import bcrypt from 'bcryptjs'
import { badRequest, ok, serverError } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'
import { withLogging } from './_lib/logger.js'

async function handler(req, res) {
  if (req.method !== 'POST') return badRequest(res, 'Invalid method')
  
  try {
    console.log('🔍 Creating admin user...')
    
    // Check if admin user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: 'admin@abcotronics.com' }
    })
    
    if (existingUser) {
      console.log('✅ Admin user already exists')
      return ok(res, { 
        message: 'Admin user already exists',
        user: {
          email: existingUser.email,
          name: existingUser.name,
          role: existingUser.role
        }
      })
    }
    
    // Create admin user
    const passwordHash = await bcrypt.hash('admin123', 10)
    
    const user = await prisma.user.create({
      data: {
        email: 'admin@abcotronics.com',
        name: 'Admin User',
        passwordHash,
        role: 'ADMIN'
      }
    })
    
    console.log('✅ Admin user created successfully!')
    
    return ok(res, { 
      message: 'Admin user created successfully',
      credentials: {
        email: 'admin@abcotronics.com',
        password: 'admin123'
      },
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    })
    
  } catch (error) {
    console.error('❌ Error creating admin user:', error)
    return serverError(res, 'Failed to create admin user', error.message)
  }
}

export default withHttp(withLogging(handler))
