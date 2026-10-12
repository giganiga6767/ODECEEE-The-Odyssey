CREATE TYPE "TeamFlowState" AS ENUM (
  'EN_ROUTE',
  'AWAITING_ANSWER',
  'DETOUR_EN_ROUTE',
  'AWAITING_DETOUR_CODE',
  'AWAITING_FINAL_CODE'
);

CREATE TYPE "CompletionVerificationMethod" AS ENUM (
  'GPS',
  'VOLUNTEER',
  'ADMIN_CODE'
);

ALTER TABLE "Team"
  ADD COLUMN "flowState" "TeamFlowState" NOT NULL DEFAULT 'EN_ROUTE',
  ADD COLUMN "checkpointArrivedAt" TIMESTAMP(3),
  ADD COLUMN "detourSourceCheckpointId" TEXT,
  ADD COLUMN "lastAnswerCorrect" BOOLEAN;

ALTER TABLE "Checkpoint"
  ADD COLUMN "isDetour" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "questionText" TEXT;

ALTER TABLE "Completion"
  ADD COLUMN "verificationMethod" "CompletionVerificationMethod" NOT NULL DEFAULT 'GPS';

ALTER TABLE "EventState"
  ADD COLUMN "detourEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "detourCheckpointId" TEXT,
  ADD COLUMN "detourTriggerCheckpointId" TEXT,
  ADD COLUMN "finalUnlockCodeHash" TEXT,
  ADD COLUMN "detourUnlockCodeHash" TEXT;

ALTER TABLE "EventState"
  ADD CONSTRAINT "EventState_detourCheckpointId_fkey"
  FOREIGN KEY ("detourCheckpointId") REFERENCES "Checkpoint"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "EventState_detourTriggerCheckpointId_fkey"
  FOREIGN KEY ("detourTriggerCheckpointId") REFERENCES "Checkpoint"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
