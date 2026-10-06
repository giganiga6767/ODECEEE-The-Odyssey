ALTER TABLE "Team"
  ADD COLUMN "codeHint" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "leaderName" TEXT,
  ADD COLUMN "deviceId" TEXT,
  ADD COLUMN "claimedAt" TIMESTAMP(3),
  ADD COLUMN "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN "userAgent" TEXT;

CREATE INDEX "Team_codeHint_idx" ON "Team"("codeHint");
