import { Router, type IRouter } from "express";
import healthRouter from "./health";
import textToBpmnRouter from "./text-to-bpmn";

const router: IRouter = Router();

router.use(healthRouter);
router.use(textToBpmnRouter);

export default router;
