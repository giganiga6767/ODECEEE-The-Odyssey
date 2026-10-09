ALTER TABLE "Team"
  ADD COLUMN "qualifiedForRoundTwo" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "TeamRound" (
  "id" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "round" INTEGER NOT NULL DEFAULT 1,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "TeamRound_pkey" PRIMARY KEY ("id")
);

INSERT INTO "TeamRound" ("id", "teamId", "round", "startedAt", "finishedAt")
SELECT 'round-' || "id" || '-1', "id", 1, "startedAt", "finishedAt"
FROM "Team";

CREATE UNIQUE INDEX "TeamRound_teamId_round_key"
  ON "TeamRound"("teamId", "round");
CREATE INDEX "TeamRound_round_idx"
  ON "TeamRound"("round");
ALTER TABLE "TeamRound"
  ADD CONSTRAINT "TeamRound_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Checkpoint"
  ADD COLUMN "isFinalStop" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "TeamRoute"
  ADD COLUMN "round" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "Completion"
  ADD COLUMN "round" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "EventState"
  ADD COLUMN "currentRound" INTEGER NOT NULL DEFAULT 1;

DROP INDEX "TeamRoute_teamId_orderIndex_key";
DROP INDEX "TeamRoute_teamId_checkpointId_key";
CREATE UNIQUE INDEX "TeamRoute_teamId_round_orderIndex_key"
  ON "TeamRoute"("teamId", "round", "orderIndex");
CREATE UNIQUE INDEX "TeamRoute_teamId_round_checkpointId_key"
  ON "TeamRoute"("teamId", "round", "checkpointId");

DROP INDEX "Completion_teamId_checkpointId_key";
CREATE UNIQUE INDEX "Completion_teamId_round_checkpointId_key"
  ON "Completion"("teamId", "round", "checkpointId");
