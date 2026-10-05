import { Router, type IRouter } from "express";
import adminRouter from "./admin";
import authRouter from "./auth";
import gameRouter from "./game";
import healthRouter from "./health";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(gameRouter);
router.use(adminRouter);

export default router;
