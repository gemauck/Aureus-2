#!/bin/bash

# Quick Database Fix for Railway Production
echo "🔧 Quick database fix for Railway production..."

# Create a temporary SQLite database for immediate testing
echo "📊 Setting up SQLite fallback database..."

# Update Prisma schema to use SQLite temporarily
cat > prisma/schema-sqlite.prisma << 'EOF'
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:./dev.db"
}

model User {
  id            String       @id @default(cuid())
  email         String       @unique
  name          String?
  passwordHash  String?
  provider      String       @default("local")
  role          String       @default("member")
  status        String       @default("active")
  invitedBy     String?
  lastLoginAt   DateTime?
  memberships   Membership[]
  ownedClients  Client[]     @relation("ClientOwner")
  ownedProjects Project[]    @relation("ProjectOwner")
  tasks         Task[]       @relation("TaskAssignee")
  auditLogs     AuditLog[]   @relation("AuditActor")
  feedback      Feedback[]   @relation("UserFeedback")
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt
}

model Team {
  id          String       @id @default(cuid())
  name        String
  memberships Membership[]
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
}

model Membership {
  userId String
  teamId String
  role   String @default("member")
  user   User   @relation(fields: [userId], references: [id])
  team   Team   @relation(fields: [teamId], references: [id])

  @@id([userId, teamId])
}

model Client {
  id            String        @id @default(cuid())
  name          String
  type          String // "client" or "lead"
  industry      String        @default("Other")
  status        String        @default("active")
  revenue       Float         @default(0)
  value         Float         @default(0)
  probability   Int           @default(0)
  lastContact   DateTime      @default(now())
  address       String        @default("")
  website       String        @default("")
  notes         String        @default("")
  contacts      Json          @default("[]")
  followUps     Json          @default("[]")
  projectIds    Json          @default("[]")
  comments      Json          @default("[]")
  sites         Json          @default("[]")
  contracts     Json          @default("[]")
  activityLog   Json          @default("[]")
  billingTerms  Json          @default("{\"paymentTerms\":\"Net 30\",\"billingFrequency\":\"Monthly\",\"currency\":\"ZAR\",\"retainerAmount\":0,\"taxExempt\":false,\"notes\":\"\"}")
  ownerId       String?
  owner         User?         @relation("ClientOwner", fields: [ownerId], references: [id])
  projects      Project[]
  invoices      Invoice[]
  opportunities Opportunity[]
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
}

model Project {
  id          String      @id @default(cuid())
  clientId    String?
  name        String
  description String      @default("")
  clientName  String      @default("")
  status      String      @default("Planning")
  startDate   DateTime    @default(now())
  dueDate     DateTime?
  budget      Float       @default(0)
  priority    String      @default("Medium")
  tasksList   Json        @default("[]")
  team        Json        @default("[]")
  notes       String      @default("")
  ownerId     String?
  owner       User?       @relation("ProjectOwner", fields: [ownerId], references: [id])
  client      Client?     @relation(fields: [clientId], references: [id])
  tasks       Task[]
  invoices    Invoice[]
  timeEntries TimeEntry[]
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
}

model Opportunity {
  id        String   @id @default(cuid())
  clientId  String
  title     String
  stage     String   @default("prospect")
  value     Float    @default(0)
  ownerId   String?
  client    Client   @relation(fields: [clientId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Invoice {
  id            String    @id @default(cuid())
  clientId      String?
  projectId     String?
  invoiceNumber String    @unique
  clientName    String    @default("")
  issueDate     DateTime  @default(now())
  dueDate       DateTime?
  status        String    @default("Draft")
  subtotal      Float     @default(0)
  tax           Float     @default(0)
  total         Float     @default(0)
  balance       Float     @default(0)
  items         Json      @default("[]")
  notes         String    @default("")
  ownerId       String?
  client        Client?   @relation(fields: [clientId], references: [id])
  project       Project?  @relation(fields: [projectId], references: [id])
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
}

model Task {
  id           String    @id @default(cuid())
  projectId    String
  parentTaskId String?
  title        String
  status       String    @default("todo")
  assigneeId   String?
  dueDate      DateTime?
  project      Project   @relation(fields: [projectId], references: [id])
  assignee     User?     @relation("TaskAssignee", fields: [assigneeId], references: [id])
  parentTask   Task?     @relation("Subtasks", fields: [parentTaskId], references: [id])
  subtasks     Task[]    @relation("Subtasks")
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}

model TimeEntry {
  id          String   @id @default(cuid())
  projectId   String?
  date        DateTime @default(now())
  hours       Float
  projectName String   @default("")
  task        String   @default("")
  description String   @default("")
  employee    String   @default("")
  billable    Boolean  @default(true)
  rate        Float    @default(0)
  ownerId     String?
  project     Project? @relation(fields: [projectId], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model AuditLog {
  id        String   @id @default(cuid())
  actorId   String
  action    String
  entity    String
  entityId  String
  diff      Json?
  actor     User     @relation("AuditActor", fields: [actorId], references: [id])
  createdAt DateTime @default(now())
}

model Invitation {
  id         String    @id @default(cuid())
  email      String    @unique
  name       String
  role       String    @default("user")
  token      String    @unique
  status     String    @default("pending") // pending, accepted, expired, cancelled
  invitedBy  String?
  expiresAt  DateTime
  acceptedAt DateTime?
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt
}

// User feedback on pages/sections for product/dev
model Feedback {
  id        String   @id @default(cuid())
  userId    String?
  pageUrl   String
  section   String   @default("")
  message   String
  type      String   @default("feedback") // feedback | bug | idea
  severity  String   @default("medium") // low | medium | high
  meta      Json?
  user      User?    @relation("UserFeedback", fields: [userId], references: [id])
  createdAt DateTime @default(now())
}
EOF

# Backup original schema
cp prisma/schema.prisma prisma/schema-postgres.prisma

# Use SQLite schema temporarily
cp prisma/schema-sqlite.prisma prisma/schema.prisma

# Set up environment variables for SQLite
cat > .env << EOF
DATABASE_URL="file:./dev.db"
JWT_SECRET="your-super-secret-jwt-key-change-this-in-production-$(date +%s)"
NODE_ENV="development"
PORT=3000
APP_URL="http://localhost:3000"
EOF

echo "✅ Environment variables configured for SQLite"

# Push database schema
echo "📋 Pushing SQLite database schema..."
npx prisma db push

# Generate Prisma client
echo "🔨 Generating Prisma client..."
npx prisma generate

# Create admin user
echo "👤 Creating admin user..."
node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

async function createAdmin() {
  const prisma = new PrismaClient();
  try {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const admin = await prisma.user.upsert({
      where: { email: 'admin@abcotronics.com' },
      update: { passwordHash: hashedPassword },
      create: {
        email: 'admin@abcotronics.com',
        name: 'Admin User',
        passwordHash: hashedPassword,
        role: 'admin',
        provider: 'local'
      }
    });
    console.log('✅ Admin user created/updated:', admin.email);
  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
  } finally {
    await prisma.\$disconnect();
  }
}

createAdmin();
"

echo ""
echo "🎉 Quick database fix complete!"
echo ""
echo "📝 Login credentials:"
echo "   Email: admin@abcotronics.com"
echo "   Password: admin123"
echo ""
echo "🚀 Start the server with: npm run dev"
echo "🌐 Access the application at: http://localhost:3000"
echo ""
echo "⚠️  Note: This uses SQLite for immediate testing."
echo "   For production, restore PostgreSQL with: ./restore-postgres.sh"
