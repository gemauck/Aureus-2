/**
 * Daily Leave Notification Service
 * Sends daily emails to notify who is on leave today
 * 
 * This should be run as a cron job daily (e.g., at 8:00 AM)
 * Example cron: 0 8 * * * node api/leave-platform/daily-email-notification.js
 */

import { prisma } from '../_lib/prisma.js'
import { sendEmail } from '../_lib/email.js'

async function sendDailyLeaveNotifications() {
  try {

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    // Get all approved leave applications that include today
    const leaveApplications = await prisma.leaveApplication.findMany({
      where: {
        status: 'approved',
        startDate: {
          lte: tomorrow
        },
        endDate: {
          gte: today
        }
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            department: true
          }
        }
      }
    })

    if (leaveApplications.length === 0) {
      return
    }

    // Get all active users who should receive notifications
    const allUsers = await prisma.user.findMany({
      where: {
        status: 'active'
      },
      select: {
        id: true,
        name: true,
        email: true,
        department: true
      }
    })

    // Group leave applications by department
    const leaveByDepartment = {}
    leaveApplications.forEach(app => {
      const dept = app.user.department || 'General'
      if (!leaveByDepartment[dept]) {
        leaveByDepartment[dept] = []
      }
      leaveByDepartment[dept].push(app)
    })

    // Create email content
    let emailContent = `
      <h2>Daily Leave Notification</h2>
      <p>Good morning! Here's who is on leave today (${today.toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}):</p>
      <br/>
    `

    // Add leave by department
    Object.keys(leaveByDepartment).forEach(dept => {
      emailContent += `<h3>${dept}</h3><ul>`
      leaveByDepartment[dept].forEach(app => {
        const startDate = new Date(app.startDate).toLocaleDateString('en-ZA')
        const endDate = new Date(app.endDate).toLocaleDateString('en-ZA')
        const dateRange = startDate === endDate ? startDate : `${startDate} - ${endDate}`
        emailContent += `<li><strong>${app.user.name}</strong> - ${app.leaveType} (${dateRange}) - ${app.days} day(s)</li>`
      })
      emailContent += `</ul><br/>`
    })

    emailContent += `
      <p>Total employees on leave: ${leaveApplications.length}</p>
      <br/>
      <p>You can view the full leave calendar in the <a href="${process.env.APP_URL || 'https://erp.abcotronics.co.za'}/leave-platform">Leave Platform</a>.</p>
      <br/>
      <p>Have a great day!</p>
    `

    // Send email to all active users
    const emailPromises = allUsers.map(user => {
      return sendEmail({
        to: user.email,
        subject: `Daily Leave Notification - ${leaveApplications.length} employee(s) on leave today`,
        html: emailContent,
        text: emailContent.replace(/<[^>]*>/g, '') // Strip HTML for plain text version
      }).catch(error => {
        console.error(`❌ Failed to send email to ${user.email}:`, error)
        return null
      })
    })

    await Promise.all(emailPromises)

  } catch (error) {
    console.error('❌ Error sending daily leave notifications:', error)
    throw error
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  sendDailyLeaveNotifications()
    .then(() => {
      process.exit(0)
    })
    .catch(error => {
      console.error('❌ Daily leave notification process failed:', error)
      process.exit(1)
    })
}

export { sendDailyLeaveNotifications }

