import { PrismaClient } from '@prisma/client'

// Deletes all users except the designated admin.
// Admin email can be overridden with ADMIN_EMAIL env var; defaults to admin@abcotronics.com
(async () => {
	const prisma = new PrismaClient()
	const adminEmail = process.env.ADMIN_EMAIL || 'admin@abcotronics.com'

	try {
		console.log(`🔍 Preserving admin user with email: ${adminEmail}`)

		// Ensure admin exists (optional safeguard)
		const admin = await prisma.user.findUnique({ where: { email: adminEmail } })
		if (!admin) {
			console.warn('⚠️  Admin user not found; no deletions will be performed to avoid lockout.')
			process.exit(1)
		}

		// Delete all non-admin users (by email inequality)
		const result = await prisma.user.deleteMany({
			where: { email: { not: adminEmail } }
		})

		console.log(`🧹 Deleted ${result.count} user(s) that are not admin.`)
		console.log('✅ Cleanup complete')
	} catch (error) {
		console.error('❌ Error cleaning up users:', error)
		process.exit(1)
	} finally {
		await prisma.$disconnect()
	}
})()


