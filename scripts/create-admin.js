// Create admin user script
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function createAdminUser() {
    try {
        console.log('🔍 Checking for existing users...')
        
        // Create Gareth user (primary admin)
        const garethExists = await prisma.user.findUnique({
            where: { email: 'garethm@abcotronics.co.za' }
        })

        if (!garethExists) {
            console.log('✨ Creating Gareth admin user...')
            const garethPasswordHash = await bcrypt.hash('admin123', 10)
            
            const gareth = await prisma.user.create({
                data: {
                    email: 'garethm@abcotronics.co.za',
                    name: 'Gareth Mauck',
                    passwordHash: garethPasswordHash,
                    role: 'admin',
                    status: 'active',
                    provider: 'local',
                    department: 'Management',
                    jobTitle: 'System Administrator'
                }
            })

            console.log('✅ Gareth admin user created successfully!')
            console.log('📧 Email: garethm@abcotronics.co.za')
            console.log('🔑 Password: admin123')
            console.log('👤 Name:', gareth.name)
        } else {
            console.log('✅ Gareth user already exists')
        }

        // Create generic admin user
        const existingAdmin = await prisma.user.findUnique({
            where: { email: 'admin@example.com' }
        })

        if (!existingAdmin) {
            console.log('✨ Creating generic admin user...')
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

            console.log('✅ Generic admin user created successfully!')
            console.log('📧 Email: admin@example.com')
            console.log('🔑 Password: admin123')
        } else {
            console.log('✅ Generic admin user already exists')
        }
        
    } catch (error) {
        console.error('❌ Error creating admin users:', error)
    } finally {
        await prisma.$disconnect()
    }
}

createAdminUser()
