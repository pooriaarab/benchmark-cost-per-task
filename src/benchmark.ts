import { getBenchmark } from "./tasks-path.js";

export type { CostTask, Workspace } from "./benchmark-definition.js";
export { getBenchmark, loadTasksFrom, parseTasksArgv } from "./tasks-path.js";
export const benchmark = getBenchmark();
