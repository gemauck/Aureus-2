// Create initial admin user endpoint
import { prisma } from './_lib/prisma.js'
import bcrypt from 'bcryptjs'
import { ok, serverError, badRequest } from './_lib/response.js'
import { withHttp } from './_lib/withHttp.js'

async function handler(req, res) {
  try {
    
    // Check if admin user already exists
    const existingAdmin = await prisma.user.findUnique({ 
      where: { email: 'admin@example.com' } 
    })
    
    if (existingAdmin) {
      return ok(res, { 
        message: 'Admin user already exists',
        user: { email: existingAdmin.email, role: existingAdmin.role }
      })
    }
    
    // Create admin user
    const passwordHash = await bcrypt.hash('password123', 10)
    
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin@example.com',
        name: 'Admin User',
        passwordHash: passwordHash,
        role: 'admin',
        status: 'active',
        provider: 'local'
      }
    })
    
    
    return ok(res, { 
      message: 'Admin user created successfully',
      user: { 
        email: adminUser.email, 
        name: adminUser.name, 
        role: adminUser.role 
      },
      credentials: {
        email: 'admin@example.com',
        password: 'password123'
      }
    })
  } catch (e) {
    console.error('❌ Failed to create admin user:', e)
    return serverError(res, 'Failed to create admin user', e.message)
  }
}

export default withHttp(handler)