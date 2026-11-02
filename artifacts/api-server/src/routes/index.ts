import { Router, type IRouter } from "express";
import healthRouter from "./health";
import textToBpmnRouter from "./text-to-bpmn";
import authRouter from "./auth";
import bpmnRouter from "./bpmn";
import adminRouter from "./admin";
import paymentRouter from "./payment";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(bpmnRouter);
router.use(textToBpmnRouter);
router.use(paymentRouter);
router.use("/admin", adminRouter);

export default router;
