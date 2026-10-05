import { Router, type IRouter } from "express";
import { GetGameStateResponse, StartVoyageResponse } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../lib/auth";
import { getTeamGameState, startTeamVoyage } from "../lib/game-service";
import { publishTeamTarget, publishTeamUpdate } from "../lib/realtime";

const router: IRouter = Router();

router.post(
  "/game/start",
  requireAuth,
  requireRole("TEAM"),
  async (req, res): Promise<void> => {
    const teamId = req.authUser?.teamId;
    if (!teamId) {
      res.status(401).json({ error: "Team session not found." });
      return;
    }

    try {
      await startTeamVoyage(teamId);
    } catch (error) {
      req.log.warn({ err: error }, "Unable to start team voyage");
      res.status(409).json({ error: "The Oracle needs at least one active checkpoint." });
      return;
    }

    const state = await getTeamGameState(teamId);
    if (!state) {
      res.status(404).json({ error: "Team not found." });
      return;
    }
    await Promise.all([publishTeamUpdate(teamId), publishTeamTarget(teamId)]);
    res.json(StartVoyageResponse.parse(state));
  },
);

router.get(
  "/game/state",
  requireAuth,
  requireRole("TEAM"),
  async (req, res): Promise<void> => {
    const teamId = req.authUser?.teamId;
    if (!teamId) {
      res.status(401).json({ error: "Team session not found." });
      return;
    }
    const state = await getTeamGameState(teamId);
    if (!state) {
      res.status(404).json({ error: "Team not found." });
      return;
    }
    res.json(GetGameStateResponse.parse(state));
  },
);

export default router;
