// Create admin user script
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function createAdminUser() {
    try {
        console.log('🔍 Checking for existing admin user...')
        
        const existingAdmin = await prisma.user.findUnique({
            where: { email: 'admin@example.com' }
        })

        if (existingAdmin) {
            console.log('✅ Admin user already exists')
            console.log('📧 Email:', existingAdmin.email)
            console.log('👤 Name:', existingAdmin.name)
            console.log('🔐 Role:', existingAdmin.role)
            return
        }

        console.log('✨ Creating admin user...')
        
        const passwordHash = await bcrypt.hash('admin123', 10)
        
        const admin = await prisma.user.create({
            data: {
                email: 'admin@example.com',
                name: 'Admin User',
                passwordHash,
                role: 'admin',
                status: 'active',
                provider: 'local',
                department: 'Management',
                jobTitle: 'System Administrator'
            }
        })

        console.log('✅ Admin user created successfully!')
        console.log('📧 Email: admin@example.com')
        console.log('🔑 Password: admin123')
        console.log('👤 Name:', admin.name)
        console.log('🔐 Role:', admin.role)
        
    } catch (error) {
        console.error('❌ Error creating admin user:', error)
    } finally {
        await prisma.$disconnect()
    }
}

createAdminUser()
