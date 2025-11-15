#!/usr/bin/env node
/**
 * Reset passwords for all locally managed admin users.
 *
 * - Generates a strong random password per admin
 * - Hashes password with bcrypt
 * - Marks account to require password change on next login
 * - Prints the temporary credentials to stdout
 *
 * Usage:
 *   node scripts/reset-local-admin-passwords.js
 *
 * Notes:
 * - Requires DATABASE_URL in environment (.env is loaded automatically)
 * - KEEP THE OUTPUT SECURE. Share only with authorised users.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import 'dotenv/config';

const prisma = new PrismaClient();

function generatePassword() {
  // Base length excludes the forced complexity suffix
  const baseLength = Number.parseInt(process.env.RESET_PASSWORD_LENGTH ?? '16', 10);
  const minLength = Math.max(baseLength, 12);

  // Generate alphanumeric characters from base64 until we have enough length
  let candidate = '';
  while (candidate.length < minLength) {
    candidate += crypto.randomBytes(16).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
  }
  candidate = candidate.slice(0, minLength - 3); // leave room for suffix to guarantee complexity

  // Append characters to ensure at least one lower, upper and digit
  const suffix = [
    crypto.randomInt(0, 26).toString(36), // lower
    String.fromCharCode(65 + crypto.randomInt(0, 26)), // upper
    String(crypto.randomInt(0, 10)), // digit
    ['!', '@', '#', '$', '%', '&', '*'][crypto.randomInt(0, 7)], // symbol
  ].join('');

  return candidate + suffix;
}

async function resetAdminPasswords() {
  const admins = await prisma.user.findMany({
    where: {
      role: { in: ['admin', 'super-admin'] },
      provider: 'local',
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
  });

  if (admins.length === 0) {
    console.log('ℹ️  No local admin accounts found to reset.');
    return [];
  }

  const results = [];

  for (const admin of admins) {
    const password = generatePassword();
    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: admin.id },
      data: {
        passwordHash,
        mustChangePassword: true,
        updatedAt: new Date(),
      },
    });

    results.push({
      email: admin.email,
      name: admin.name ?? '(no name)',
      temporaryPassword: password,
    });
  }

  return results;
}

async function main() {
  console.log('🔐 Resetting local admin passwords...');

  try {
    const results = await resetAdminPasswords();
    if (results.length === 0) {
      return;
    }

    console.log('\n✅ Password reset complete. New temporary credentials:');
    console.table(
      results.map(({ email, name, temporaryPassword }) => ({
        Email: email,
        Name: name,
        'Temporary Password': temporaryPassword,
      })),
    );

    console.log(
      '\n⚠️  Share each temporary password securely and ensure the user changes it immediately after logging in.',
    );
  } catch (error) {
    console.error('❌ Failed to reset admin passwords:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();




