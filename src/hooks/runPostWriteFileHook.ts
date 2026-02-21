import type { Task } from "../core/task/Task"
import { appendAgentTraceForWrite } from "../services/TraceService"

type RunPostWriteFileHookInput = {
	relativePath: string
}

export async function runPostWriteFileHook(task: Task, input: RunPostWriteFileHookInput): Promise<void> {
	await appendAgentTraceForWrite({
		workspaceRoot: task.cwd,
		relativePath: input.relativePath,
		taskId: task.taskId,
		modelIdentifier: task.api.getModel().id,
	})
}
