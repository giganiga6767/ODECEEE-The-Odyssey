CREATE SCHEMA IF NOT EXISTS "public";

CREATE TYPE "TeamStatus" AS ENUM ('NOT_STARTED', 'ACTIVE', 'FINISHED');
CREATE TYPE "EventStatus" AS ENUM ('NOT_STARTED', 'ACTIVE', 'PAUSED', 'ENDED');

CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passcodeHash" TEXT NOT NULL,
    "members" TEXT,
    "status" "TeamStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "lastLat" DOUBLE PRECISION,
    "lastLng" DOUBLE PRECISION,
    "lastAccuracy" DOUBLE PRECISION,
    "lastSeenAt" TIMESTAMP(3),
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "suspicious" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Checkpoint" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "radiusM" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "hint" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Checkpoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamRoute" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "checkpointId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    CONSTRAINT "TeamRoute_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Completion" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "checkpointId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "distanceAtCaptureM" DOUBLE PRECISION NOT NULL,
    "accuracyM" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "Completion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GameSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "defaultRadiusM" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "accuracySlackM" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "maxAccuracyM" DOUBLE PRECISION NOT NULL DEFAULT 200,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GameSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventState" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "status" "EventStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Admin_username_key" ON "Admin"("username");
CREATE UNIQUE INDEX "Team_name_key" ON "Team"("name");
CREATE INDEX "TeamRoute_checkpointId_idx" ON "TeamRoute"("checkpointId");
CREATE UNIQUE INDEX "TeamRoute_teamId_orderIndex_key" ON "TeamRoute"("teamId", "orderIndex");
CREATE UNIQUE INDEX "TeamRoute_teamId_checkpointId_key" ON "TeamRoute"("teamId", "checkpointId");
CREATE INDEX "Completion_completedAt_idx" ON "Completion"("completedAt");
CREATE UNIQUE INDEX "Completion_teamId_checkpointId_key" ON "Completion"("teamId", "checkpointId");

ALTER TABLE "TeamRoute" ADD CONSTRAINT "TeamRoute_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamRoute" ADD CONSTRAINT "TeamRoute_checkpointId_fkey"
    FOREIGN KEY ("checkpointId") REFERENCES "Checkpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Completion" ADD CONSTRAINT "Completion_teamId_fkey"
    FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Completion" ADD CONSTRAINT "Completion_checkpointId_fkey"
    FOREIGN KEY ("checkpointId") REFERENCES "Checkpoint"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
