import { Router, type IRouter } from "express";
import {
  BulkCreateTeamsBody,
  BulkCreateTeamsResponse,
  CreateCheckpointBody,
  CreateCheckpointResponse,
  CreateTeamBody,
  CreateTeamResponse,
  DeactivateCheckpointParams,
  DeactivateCheckpointResponse,
  DeleteTeamParams,
  DeleteTeamResponse,
  EndEventResponse,
  ExportResultsResponse,
  GetAdminOverviewResponse,
  GetCheckpointsResponse,
  GetGameSettingsResponse,
  GetTeamsResponse,
  PauseEventResponse,
  ResetTeamParams,
  ResetTeamResponse,
  ReleaseTeamLoginParams,
  ReleaseTeamLoginResponse,
  StartEventResponse,
  UpdateCheckpointBody,
  UpdateCheckpointParams,
  UpdateCheckpointResponse,
  UpdateGameSettingsBody,
  UpdateGameSettingsResponse,
  UpdateTeamBody,
  UpdateTeamParams,
  UpdateTeamResponse,
} from "@workspace/api-zod";
import { Prisma } from "@prisma/client";
import { requireAuth, requireRole } from "../lib/auth";
import { GAME } from "../lib/constants";
import {
  createPasscodeHash,
  createProvisioningPasscode,
  getEventStatus,
  getSettings,
  loadAdminOverview,
  loadAdminTeam,
  loadAdminTeams,
  advancePastInactiveCheckpoints,
} from "../lib/game-service";
import { prisma } from "../lib/prisma";
import {
  emitToAdmins,
  disconnectTeamSessions,
  publishEventStatus,
  publishTeamTarget,
  publishTeamUpdate,
} from "../lib/realtime";

const router: IRouter = Router();
router.use("/admin", requireAuth, requireRole("ADMIN"));

function isUniqueConstraint(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

function csvCell(value: string | number | null | undefined): string {
  const text = String(value ?? "");
  const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

router.get("/admin/checkpoints", async (_req, res): Promise<void> => {
  const checkpoints = await prisma.checkpoint.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
  });
  res.json(GetCheckpointsResponse.parse(checkpoints));
});

router.post("/admin/checkpoints", async (req, res): Promise<void> => {
  const parsed = CreateCheckpointBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const checkpoint = await prisma.checkpoint.create({
      data: { ...parsed.data, hint: parsed.data.hint ?? null },
    });
    const response = CreateCheckpointResponse.parse(checkpoint);
    emitToAdmins("admin:snapshot", { overview: await loadAdminOverview() });
    res.status(201).json(response);
  } catch (error) {
    req.log.error({ err: error }, "Unable to create checkpoint");
    res.status(500).json({ error: "Could not create checkpoint." });
  }
});

router.patch("/admin/checkpoints/:id", async (req, res): Promise<void> => {
  const params = UpdateCheckpointParams.safeParse(req.params);
  const parsed = UpdateCheckpointBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const checkpoint = await prisma.checkpoint.update({
      where: { id: params.data.id },
      data: { ...parsed.data, hint: parsed.data.hint ?? null },
    });
    const response = UpdateCheckpointResponse.parse(checkpoint);
    emitToAdmins("admin:snapshot", { overview: await loadAdminOverview() });
    res.json(response);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ error: "Checkpoint not found." });
      return;
    }
    req.log.error({ err: error }, "Unable to update checkpoint");
    res.status(500).json({ error: "Could not update checkpoint." });
  }
});

router.delete("/admin/checkpoints/:id", async (req, res): Promise<void> => {
  const params = DeactivateCheckpointParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const checkpoint = await prisma.checkpoint.updateMany({
    where: { id: params.data.id, isActive: true },
    data: { isActive: false },
  });
  if (!checkpoint.count) {
    const exists = await prisma.checkpoint.findUnique({ where: { id: params.data.id } });
    if (!exists) {
      res.status(404).json({ error: "Checkpoint not found." });
      return;
    }
  }

  const teams = await prisma.team.findMany({
    where: { status: "ACTIVE" },
    include: { routes: { where: { checkpointId: params.data.id } } },
  });
  for (const team of teams) {
    if (team.routes.some((route) => route.orderIndex === team.currentIndex)) {
      await advancePastInactiveCheckpoints(team.id);
      await Promise.all([publishTeamTarget(team.id), publishTeamUpdate(team.id)]);
    }
  }
  emitToAdmins("admin:snapshot", { overview: await loadAdminOverview() });
  res.json(DeactivateCheckpointResponse.parse({ ok: true }));
});

router.get("/admin/teams", async (_req, res): Promise<void> => {
  res.json(GetTeamsResponse.parse(await loadAdminTeams()));
});

router.post("/admin/teams", async (req, res): Promise<void> => {
  const parsed = CreateTeamBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const name = parsed.data.name.trim();
  const duplicate = await prisma.team.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });
  if (duplicate) {
    res.status(409).json({ error: "A team with that name already exists." });
    return;
  }

  const passcode = await createProvisioningPasscode();
  try {
    const team = await prisma.team.create({
      data: {
        name,
        members: parsed.data.members ?? null,
        passcodeHash: await createPasscodeHash(passcode),
        codeHint: passcode.replaceAll("-", "").slice(0, 2),
      },
    });
    const detail = await loadAdminTeam(team.id);
    if (!detail) {
      res.status(500).json({ error: "Could not load the created team." });
      return;
    }
    const response = CreateTeamResponse.parse({ team: detail, passcode });
    await publishTeamUpdate(team.id);
    res.status(201).json(response);
  } catch (error) {
    if (isUniqueConstraint(error)) {
      res.status(409).json({ error: "A team with that name already exists." });
      return;
    }
    req.log.error({ err: error }, "Unable to create team");
    res.status(500).json({ error: "Could not create team." });
  }
});

router.post("/admin/teams/bulk", async (req, res): Promise<void> => {
  const parsed = BulkCreateTeamsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const names = [...new Set(parsed.data.names.split(/\r?\n/).map((name) => name.trim()).filter(Boolean))];
  if (!names.length || names.length > 100) {
    res.status(400).json({ error: "Paste between 1 and 100 team names." });
    return;
  }
  const existing = await prisma.team.findMany({ select: { name: true } });
  const used = new Set(existing.map((team) => team.name.toLocaleLowerCase()));
  const repeated = names.filter((name) => used.has(name.toLocaleLowerCase()));
  if (repeated.length) {
    res.status(409).json({ error: `These team names already exist: ${repeated.join(", ")}` });
    return;
  }

  const provisioned = await Promise.all(
    names.map(async (name) => ({
      name,
      passcode: await createProvisioningPasscode(),
      members: null as string | null,
    })),
  );
  const hashed = await Promise.all(
    provisioned.map(async (item) => ({
      ...item,
      passcodeHash: await createPasscodeHash(item.passcode),
      codeHint: item.passcode.replaceAll("-", "").slice(0, 2),
    })),
  );
  try {
    const created = await prisma.$transaction(
      hashed.map(({ name, members, passcodeHash, codeHint }) =>
        prisma.team.create({ data: { name, members, passcodeHash, codeHint }, select: { id: true } }),
      ),
    );
    const results = await Promise.all(
      created.map(async ({ id }, index) => ({
        team: await loadAdminTeam(id),
        passcode: provisioned[index]!.passcode,
      })),
    );
    const response = BulkCreateTeamsResponse.parse(results);
    emitToAdmins("admin:snapshot", { overview: await loadAdminOverview() });
    res.status(201).json(response);
  } catch (error) {
    if (isUniqueConstraint(error)) {
      res.status(409).json({ error: "A team with one of those names already exists." });
      return;
    }
    req.log.error({ err: error }, "Unable to bulk-create teams");
    res.status(500).json({ error: "Could not create teams." });
  }
});

router.patch("/admin/teams/:id", async (req, res): Promise<void> => {
  const params = UpdateTeamParams.safeParse(req.params);
  const parsed = UpdateTeamBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data: { name?: string; members?: string | null } = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
  if (Object.hasOwn(parsed.data, "members")) data.members = parsed.data.members ?? null;
  try {
    const team = await prisma.team.update({
      where: { id: params.data.id },
      data,
    });
    const detail = await loadAdminTeam(team.id);
    if (!detail) {
      res.status(404).json({ error: "Team not found." });
      return;
    }
    const response = UpdateTeamResponse.parse(detail);
    await publishTeamUpdate(team.id);
    res.json(response);
  } catch (error) {
    if (isUniqueConstraint(error)) {
      res.status(409).json({ error: "A team with that name already exists." });
      return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ error: "Team not found." });
      return;
    }
    req.log.error({ err: error }, "Unable to update team");
    res.status(500).json({ error: "Could not update team." });
  }
});

router.delete("/admin/teams/:id", async (req, res): Promise<void> => {
  const params = DeleteTeamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    await prisma.team.delete({ where: { id: params.data.id } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ error: "Team not found." });
      return;
    }
    throw error;
  }
  disconnectTeamSessions(params.data.id);
  emitToAdmins("admin:team:update", { id: params.data.id, deleted: true });
  res.json(DeleteTeamResponse.parse({ ok: true }));
});

router.post("/admin/teams/:id/reset", async (req, res): Promise<void> => {
  const params = ResetTeamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const existing = await prisma.team.findUnique({ where: { id: params.data.id } });
  if (!existing) {
    res.status(404).json({ error: "Team not found." });
    return;
  }
  const passcode = await createProvisioningPasscode();
  await prisma.$transaction([
    prisma.teamRoute.deleteMany({ where: { teamId: existing.id } }),
    prisma.completion.deleteMany({ where: { teamId: existing.id } }),
    prisma.team.update({
      where: { id: existing.id },
      data: {
        passcodeHash: await createPasscodeHash(passcode),
        codeHint: passcode.replaceAll("-", "").slice(0, 2),
        deviceId: null,
        leaderName: null,
        claimedAt: null,
        lastLoginAt: null,
        userAgent: null,
        status: "NOT_STARTED",
        sessionVersion: { increment: 1 },
        startedAt: null,
        finishedAt: null,
        currentIndex: 0,
        lastLat: null,
        lastLng: null,
        lastAccuracy: null,
        lastSeenAt: null,
        suspicious: false,
      },
    }),
  ]);
  const detail = await loadAdminTeam(existing.id);
  if (!detail) {
    res.status(500).json({ error: "Could not reload the reset team." });
    return;
  }
  disconnectTeamSessions(existing.id);
  const response = ResetTeamResponse.parse({ team: detail, passcode });
  await publishTeamUpdate(existing.id);
  res.json(response);
});

router.post("/admin/teams/:id/release-login", async (req, res): Promise<void> => {
  const params = ReleaseTeamLoginParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  try {
    await prisma.team.update({
      where: { id: params.data.id },
      data: {
        deviceId: null,
        leaderName: null,
        claimedAt: null,
        lastLoginAt: null,
        userAgent: null,
        sessionVersion: { increment: 1 },
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ error: "Team not found." });
      return;
    }
    throw error;
  }
  disconnectTeamSessions(params.data.id);
  await publishTeamUpdate(params.data.id);
  res.json(ReleaseTeamLoginResponse.parse({ ok: true }));
});

router.post("/admin/teams/:id/regenerate-code", async (req, res): Promise<void> => {
  const params = ResetTeamParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const passcode = await createProvisioningPasscode();
  let team;
  try {
    team = await prisma.team.update({
      where: { id: params.data.id },
      data: {
        passcodeHash: await createPasscodeHash(passcode),
        codeHint: passcode.replaceAll("-", "").slice(0, 2),
        deviceId: null,
        leaderName: null,
        claimedAt: null,
        lastLoginAt: null,
        userAgent: null,
        sessionVersion: { increment: 1 },
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ error: "Team not found." });
      return;
    }
    throw error;
  }
  disconnectTeamSessions(team.id);
  const detail = await loadAdminTeam(team.id);
  if (!detail) {
    res.status(500).json({ error: "Could not reload the team." });
    return;
  }
  await publishTeamUpdate(team.id);
  res.json(ResetTeamResponse.parse({ team: detail, passcode }));
});

router.get("/admin/overview", async (_req, res): Promise<void> => {
  res.json(GetAdminOverviewResponse.parse(await loadAdminOverview()));
});

router.get("/admin/settings", async (_req, res): Promise<void> => {
  res.json(GetGameSettingsResponse.parse(await getSettings()));
});

router.patch("/admin/settings", async (req, res): Promise<void> => {
  const parsed = UpdateGameSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const settings = await prisma.gameSettings.upsert({
    where: { id: "global" },
    create: {
      id: "global",
      defaultRadiusM: parsed.data.defaultRadiusM ?? GAME.defaultRadiusM,
      accuracySlackM: parsed.data.accuracySlackM ?? GAME.defaultAccuracySlackM,
      maxAccuracyM: parsed.data.maxAccuracyM ?? GAME.defaultMaxAccuracyM,
    },
    update: parsed.data,
  });
  const response = UpdateGameSettingsResponse.parse(settings);
  emitToAdmins("admin:snapshot", { overview: await loadAdminOverview() });
  res.json(response);
});

async function setEventStatus(
  status: "ACTIVE" | "PAUSED" | "ENDED",
): Promise<"NOT_STARTED" | "ACTIVE" | "PAUSED" | "ENDED"> {
  const current = await getEventStatus();
  if (current === "ENDED" && status !== "ENDED") return current;
  const data =
    status === "ACTIVE"
      ? { status, startedAt: new Date(), endedAt: null }
      : status === "ENDED"
        ? { status, endedAt: new Date() }
        : { status };
  const result = await prisma.eventState.upsert({
    where: { id: "global" },
    create: { id: "global", ...data },
    update: data,
  });
  return result.status;
}

router.post("/admin/event/start", async (_req, res): Promise<void> => {
  const status = await setEventStatus("ACTIVE");
  await publishEventStatus();
  res.json(StartEventResponse.parse({ status }));
});

router.post("/admin/event/pause", async (_req, res): Promise<void> => {
  const status = await setEventStatus("PAUSED");
  await publishEventStatus();
  res.json(PauseEventResponse.parse({ status }));
});

router.post("/admin/event/end", async (_req, res): Promise<void> => {
  const status = await setEventStatus("ENDED");
  await publishEventStatus();
  res.json(EndEventResponse.parse({ status }));
});

router.get("/admin/export.csv", async (_req, res): Promise<void> => {
  const teams = await prisma.team.findMany({
    orderBy: [{ currentIndex: "desc" }, { finishedAt: "asc" }],
    include: {
      routes: { include: { checkpoint: true }, orderBy: { orderIndex: "asc" } },
      completions: { include: { checkpoint: true }, orderBy: { completedAt: "asc" } },
    },
  });
  const lines = [
    ["Team", "Members", "Status", "Progress", "Started at", "Finished at", "Current checkpoint", "Completion log", "Suspicious"].map(csvCell).join(","),
    ...teams.map((team) => {
      const current = team.routes.find((route) => route.orderIndex === team.currentIndex);
      const completionLog = team.completions
        .map((item) => `${item.checkpoint.name} @ ${item.completedAt.toISOString()}`)
        .join("; ");
      return [
        team.name,
        team.members,
        team.status,
        `${team.currentIndex}/${team.routes.length}`,
        team.startedAt?.toISOString() ?? "",
        team.finishedAt?.toISOString() ?? "",
        current?.checkpoint.name ?? "",
        completionLog,
        team.suspicious ? "YES" : "NO",
      ].map(csvCell).join(",");
    }),
  ];
  const csv = lines.join("\r\n");
  const response = ExportResultsResponse.parse(csv);
  res
    .type("text/csv")
    .setHeader("Content-Disposition", 'attachment; filename="odeceee-results.csv"')
    .send(response);
});

export default router;
