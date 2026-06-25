// Create admin user script — set BOOTSTRAP_ADMIN_PASSWORD in the environment (never commit passwords).
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function createAdminUser() {
    const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD
    if (!bootstrapPassword || bootstrapPassword.length < 12) {
        console.error('❌ Set BOOTSTRAP_ADMIN_PASSWORD (min 12 chars) before running this script.')
        process.exit(1)
    }

    try {
        console.log('🔍 Checking for existing users...')
        
        const garethExists = await prisma.user.findUnique({
            where: { email: 'garethm@abcotronics.co.za' }
        })

        if (!garethExists) {
            console.log('✨ Creating Gareth admin user...')
            const garethPasswordHash = await bcrypt.hash(bootstrapPassword, 10)
            
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
            console.log('👤 Name:', gareth.name)
        } else {
            console.log('✅ Gareth user already exists')
        }

        const existingAdmin = await prisma.user.findUnique({
            where: { email: 'admin@example.com' }
        })

        if (!existingAdmin) {
            console.log('✨ Creating generic admin user...')
            const passwordHash = await bcrypt.hash(bootstrapPassword, 10)
            
            await prisma.user.create({
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
        } else {
            console.log('✅ Generic admin user already exists')
        }
        
    } catch (error) {
        console.error('❌ Error creating admin users:', error)
        process.exit(1)
    } finally {
        await prisma.$disconnect()
    }
}

createAdminUser()
