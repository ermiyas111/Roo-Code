import * as path from "path"
import * as yaml from "yaml"
import fs from "fs/promises"

import type { Task } from "../core/task/Task"

type RequirementEntry = {
	id: string
	description: string
}

type RunPreHookInput = {
	toolName: string
	toolCallId?: string
	isPartial?: boolean
}

type ActiveIntent = {
	id: string
	name: string
	status: string
	owned_scope: string[]
	constraints: string[]
	acceptance_criteria: string[]
	requirement_id?: string | null
	task_id?: string
	task?: string
	tool_name?: string
	tool_call_id?: string | null
	updated_at?: string
}

const REQUIREMENT_ID_REGEX = /\bT\d{3,}\b/gi

function tokenize(value: string): string[] {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, " ")
		.split(/\s+/)
		.filter((token) => token.length > 2)
}

function overlapScore(source: string, target: string): number {
	const sourceTokens = new Set(tokenize(source))
	const targetTokens = new Set(tokenize(target))

	if (sourceTokens.size === 0 || targetTokens.size === 0) {
		return 0
	}

	let overlap = 0
	for (const token of sourceTokens) {
		if (targetTokens.has(token)) {
			overlap++
		}
	}

	return overlap
}

function parseRequirementEntries(tasksMarkdown: string): RequirementEntry[] {
	const entries: RequirementEntry[] = []
	const seen = new Set<string>()
	const lines = tasksMarkdown.split(/\r?\n/)

	for (const rawLine of lines) {
		const line = rawLine.trim()
		if (!line) {
			continue
		}

		const idMatch = line.match(REQUIREMENT_ID_REGEX)
		if (!idMatch) {
			continue
		}

		const id = idMatch[0].toUpperCase()
		if (seen.has(id)) {
			continue
		}

		const description = line
			.replace(REQUIREMENT_ID_REGEX, "")
			.replace(/^[-*#\[\]().:x\s]+/i, "")
			.trim()

		entries.push({
			id,
			description,
		})
		seen.add(id)
	}

	return entries
}

function findMatchingRequirementId(currentTaskText: string, tasksMarkdown: string): string | undefined {
	const normalizedTask = currentTaskText.trim()
	if (!normalizedTask) {
		return undefined
	}

	const explicitId = normalizedTask.match(REQUIREMENT_ID_REGEX)?.[0]?.toUpperCase()
	if (explicitId) {
		return explicitId
	}

	const entries = parseRequirementEntries(tasksMarkdown)
	if (entries.length === 0) {
		return undefined
	}

	let best: { id: string; score: number } | undefined

	for (const entry of entries) {
		const score = overlapScore(normalizedTask, `${entry.id} ${entry.description}`)
		if (!best || score > best.score) {
			best = { id: entry.id, score }
		}
	}

	if (!best || best.score <= 0) {
		return undefined
	}

	return best.id
}

async function readTasksMarkdown(tasksFilePath: string): Promise<string | undefined> {
	try {
		return await fs.readFile(tasksFilePath, "utf-8")
	} catch {
		return undefined
	}
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath)
		return true
	} catch {
		return false
	}
}

async function resolveCurrentBranchName(workspaceRoot: string): Promise<string | undefined> {
	try {
		const headPath = path.join(workspaceRoot, ".git", "HEAD")
		const headContent = (await fs.readFile(headPath, "utf-8")).trim()
		const refPrefix = "ref: refs/heads/"
		if (!headContent.startsWith(refPrefix)) {
			return undefined
		}

		return headContent.slice(refPrefix.length).trim() || undefined
	} catch {
		return undefined
	}
}

async function ensureOrchestrationTodo(
	workspaceRoot: string,
	orchestrationDirPath: string,
): Promise<string | undefined> {
	const orchestrationTodoPath = path.join(orchestrationDirPath, "TODO.md")
	if (await fileExists(orchestrationTodoPath)) {
		return await readTasksMarkdown(orchestrationTodoPath)
	}

	const branchName = await resolveCurrentBranchName(workspaceRoot)
	if (!branchName) {
		return undefined
	}

	const sourceTasksPath = path.join(workspaceRoot, "specs", branchName, "tasks.md")
	const sourceTasksContent = await readTasksMarkdown(sourceTasksPath)
	if (!sourceTasksContent) {
		return undefined
	}

	await fs.writeFile(orchestrationTodoPath, sourceTasksContent, "utf-8")
	return sourceTasksContent
}

async function readYamlFile(filePath: string): Promise<Record<string, any>> {
	try {
		const raw = await fs.readFile(filePath, "utf-8")
		const parsed = yaml.parse(raw)
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as Record<string, any>
		}
		return {}
	} catch {
		return {}
	}
}

function markRequirementLineCompleted(line: string, requirementId: string): string {
	if (!line.toUpperCase().includes(requirementId.toUpperCase())) {
		return line
	}

	let updated = line
	updated = updated.replace(/\[\s\]/g, "[x]")
	updated = updated.replace(/\bTODO\b/gi, "COMPLETED")
	updated = updated.replace(/\bIN_PROGRESS\b/gi, "COMPLETED")

	return updated
}

async function updateTodoOnCompletion(todoPath: string, requirementId: string): Promise<void> {
	const content = await readTasksMarkdown(todoPath)
	if (!content) {
		return
	}

	const lines = content.split(/\r?\n/)
	let found = false
	const updatedLines = lines.map((line) => {
		if (!line.toUpperCase().includes(requirementId.toUpperCase())) {
			return line
		}
		found = true
		return markRequirementLineCompleted(line, requirementId)
	})

	if (!found) {
		updatedLines.push(`- [x] ${requirementId} COMPLETED`)
	}

	await fs.writeFile(todoPath, updatedLines.join("\n"), "utf-8")
}

function deriveIntentId(requirementId: string | undefined, intents: ActiveIntent[]): string {
	if (requirementId) {
		const numeric = requirementId.match(/\d+/)?.[0]
		if (numeric) {
			return `INT-${numeric.padStart(3, "0")}`
		}
	}

	const inProgress = intents.find((intent) => intent.status === "IN_PROGRESS")
	if (inProgress?.id) {
		return inProgress.id
	}

	return "INT-001"
}

function getExistingActiveIntents(existing: Record<string, any>): ActiveIntent[] {
	if (!Array.isArray(existing.active_intents)) {
		return []
	}

	return existing.active_intents.filter(
		(item): item is ActiveIntent => item && typeof item === "object" && typeof item.id === "string",
	)
}

export async function runPreHook(cline: Task, input: RunPreHookInput): Promise<void> {
	if (input.isPartial) {
		return
	}

	const workspaceRoot = cline.cwd
	const orchestrationDirPath = path.join(workspaceRoot, ".orchestration")
	const activeIntentsPath = path.join(orchestrationDirPath, "active_intents.yaml")
	const orchestrationTodoPath = path.join(orchestrationDirPath, "TODO.md")

	await fs.mkdir(orchestrationDirPath, { recursive: true })

	const currentTaskText = cline.metadata.task?.trim() || ""
	const tasksMarkdown =
		(await readTasksMarkdown(orchestrationTodoPath)) ??
		(await ensureOrchestrationTodo(workspaceRoot, orchestrationDirPath))
	const requirementId = tasksMarkdown ? findMatchingRequirementId(currentTaskText, tasksMarkdown) : undefined

	if (input.toolName === "attempt_completion" && requirementId) {
		await updateTodoOnCompletion(orchestrationTodoPath, requirementId)
	}

	const existing = await readYamlFile(activeIntentsPath)
	const existingIntents = getExistingActiveIntents(existing)
	const intentId = deriveIntentId(requirementId, existingIntents)
	const existingIntent =
		existingIntents.find((intent) => intent.id === intentId) ??
		existingIntents.find((intent) => intent.status === "IN_PROGRESS")

	const updatedIntent: ActiveIntent = {
		id: intentId,
		name: existingIntent?.name || currentTaskText || "Current Task",
		status: "IN_PROGRESS",
		owned_scope: Array.isArray(existingIntent?.owned_scope) ? existingIntent.owned_scope : [],
		constraints: Array.isArray(existingIntent?.constraints) ? existingIntent.constraints : [],
		acceptance_criteria: Array.isArray(existingIntent?.acceptance_criteria)
			? existingIntent.acceptance_criteria
			: [],
		requirement_id: requirementId ?? null,
		task_id: cline.taskId,
		task: currentTaskText,
		tool_name: input.toolName,
		tool_call_id: input.toolCallId ?? null,
		updated_at: new Date().toISOString(),
	}

	const remainingIntents = existingIntents.filter((intent) => intent.id !== updatedIntent.id)
	const next = {
		...existing,
		active_intents: [updatedIntent, ...remainingIntents],
	}

	await fs.writeFile(activeIntentsPath, yaml.stringify(next, { lineWidth: 0 }), "utf-8")
}
