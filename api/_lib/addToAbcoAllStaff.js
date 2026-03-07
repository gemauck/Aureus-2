// Ensure non-guest users are always members of the "Abco All Staff" team.
// Call after user create (or on login) so new and existing users get the membership.

const ABCO_ALL_STAFF_TEAM_ID = 'abco-all-staff'

const GUEST_ROLE = 'guest'

function isGuest(role) {
  if (role == null) return false
  return String(role).trim().toLowerCase() === GUEST_ROLE
}

/**
 * Add a user to the Abco All Staff team if they are not a guest.
 * Idempotent: safe to call multiple times for the same user.
 * @param {object} prisma - Prisma client instance
 * @param {string} userId - User id
 * @param {string} [userRole] - User role (e.g. 'user', 'admin', 'guest'). Guests are skipped.
 * @returns {Promise<boolean>} - true if membership was ensured, false if skipped (guest or error)
 */
export async function addUserToAbcoAllStaff(prisma, userId, userRole) {
  if (!userId) return false
  if (isGuest(userRole)) return false

  try {
    const team = await prisma.team.findUnique({
      where: { id: ABCO_ALL_STAFF_TEAM_ID }
    })
    if (!team) return false

    await prisma.membership.upsert({
      where: {
        userId_teamId: {
          userId: String(userId),
          teamId: ABCO_ALL_STAFF_TEAM_ID
        }
      },
      update: {},
      create: {
        userId: String(userId),
        teamId: ABCO_ALL_STAFF_TEAM_ID,
        role: 'user'
      }
    })
    return true
  } catch (err) {
    console.error('addUserToAbcoAllStaff failed:', err.message)
    return false
  }
}
