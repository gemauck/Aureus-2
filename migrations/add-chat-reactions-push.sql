-- Chat reactions + push device tokens (run: npm run migrate:chat-messaging-v2)

CREATE TABLE IF NOT EXISTS "ChatMessageReaction" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChatMessageReaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PushDeviceToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "platform" TEXT NOT NULL DEFAULT 'expo',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PushDeviceToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChatMessageReaction_messageId_userId_emoji_key"
  ON "ChatMessageReaction"("messageId", "userId", "emoji");
CREATE INDEX IF NOT EXISTS "ChatMessageReaction_messageId_idx" ON "ChatMessageReaction"("messageId");
CREATE UNIQUE INDEX IF NOT EXISTS "PushDeviceToken_token_key" ON "PushDeviceToken"("token");
CREATE INDEX IF NOT EXISTS "PushDeviceToken_userId_idx" ON "PushDeviceToken"("userId");

DO $$ BEGIN
  ALTER TABLE "ChatMessageReaction" ADD CONSTRAINT "ChatMessageReaction_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ChatMessageReaction" ADD CONSTRAINT "ChatMessageReaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PushDeviceToken" ADD CONSTRAINT "PushDeviceToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
