import fs from "fs/promises"
import path from "path"

import { ensureOrchestrationTodo, getAllActiveIntents, getRequirementIdForIntent } from "./activeIntentService"

type MutationClass = "AST_REFACTOR" | "INTENT_EVOLUTION"

type UpdateIntentMapParams = {
	workspaceRoot: string
	intentId: string
	relativePath: string
	mutationClass: MutationClass
	newContent: string
	previousContent?: string
	taskContext?: string
}

type IntentMapRow = {
	task: string
	story: string
	targetFiles: string[]
	astNodes: string[]
}

type ParsedIntentMap = {
	rows: IntentMapRow[]
}

const TABLE_HEADERS = ["Task", "Story", "Target file(s)", "Primary AST node(s)"]
const PHASE_SETUP_TITLE = "Phase 1 — Setup"
const PHASE_FOUNDATION_TITLE = "Phase 2 — Foundational"
const PHASE_OTHER_TITLE = "Phase 3 — Implementation"

function normalizePath(value: string): string {
	return value.replace(/\\/g, "/")
}

function splitCellList(value: string): string[] {
	if (!value.trim()) {
		return []
	}

	return value
		.split(/[;,\n]/)
		.map((item) => item.trim())
		.filter((item) => item.length > 0)
}

function toCellList(values: string[]): string {
	return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))).join("; ")
}

function parseTableRow(row: string): string[] {
	return row
		.split("|")
		.slice(1, -1)
		.map((cell) => cell.trim())
}

function isSeparatorRow(row: string): boolean {
	return /^\|[\s:\-\|]+\|$/.test(row.trim())
}

function parseIntentMap(content: string): ParsedIntentMap | undefined {
	const lines = content.split(/\r?\n/)
	const rows: IntentMapRow[] = []

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index].trim()
		if (!line.startsWith("|") || !line.includes("Task") || !line.includes("Story")) {
			continue
		}

		if (index + 1 >= lines.length || !isSeparatorRow(lines[index + 1])) {
			return undefined
		}

		const headers = parseTableRow(lines[index])
		const taskIndex = headers.indexOf("Task")
		const storyIndex = headers.indexOf("Story")
		const targetsIndex = headers.indexOf("Target file(s)")
		const astIndex = headers.indexOf("Primary AST node(s)")

		if (taskIndex < 0 || storyIndex < 0 || targetsIndex < 0 || astIndex < 0) {
			return undefined
		}

		for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex++) {
			const rowLine = lines[rowIndex]
			if (!rowLine.trim().startsWith("|")) {
				index = rowIndex - 1
				break
			}

			const parsedRow = parseTableRow(rowLine)
			if (parsedRow.length !== headers.length) {
				return undefined
			}

			rows.push({
				task: parsedRow[taskIndex],
				story: parsedRow[storyIndex],
				targetFiles: splitCellList(parsedRow[targetsIndex]),
				astNodes: splitCellList(parsedRow[astIndex]),
			})
		}
	}

	return rows.length > 0 ? { rows } : undefined
}

function inferStoryLabel(taskContext?: string): string {
	if (!taskContext) {
		return "Foundation"
	}

	const normalized = taskContext.toLowerCase()
	if (normalized.includes("setup")) {
		return "Setup"
	}

	if (normalized.includes("foundation") || normalized.includes("foundational")) {
		return "Foundation"
	}

	return "Foundation"
}

function phaseTitleForStory(story: string): string {
	const normalized = story.toLowerCase()
	if (normalized.includes("setup")) {
		return PHASE_SETUP_TITLE
	}
	if (normalized.includes("foundation") || normalized.includes("foundational")) {
		return PHASE_FOUNDATION_TITLE
	}
	return PHASE_OTHER_TITLE
}

function renderIntentMap(parsed: ParsedIntentMap): string {
	const grouped = new Map<string, IntentMapRow[]>()

	for (const row of parsed.rows) {
		const phaseTitle = phaseTitleForStory(row.story)
		const current = grouped.get(phaseTitle) ?? []
		current.push(row)
		grouped.set(phaseTitle, current)
	}

	const orderedPhases = [PHASE_SETUP_TITLE, PHASE_FOUNDATION_TITLE, PHASE_OTHER_TITLE].filter((title) =>
		grouped.has(title),
	)

	const output: string[] = ["# Intent Map", ""]

	for (const phaseTitle of orderedPhases) {
		const rows = grouped.get(phaseTitle) ?? []
		output.push(`## ${phaseTitle}`)
		output.push("")
		output.push(`| ${TABLE_HEADERS.join(" | ")} |`)
		output.push(`| ${TABLE_HEADERS.map(() => "---").join(" | ")} |`)
		for (const row of rows) {
			output.push(
				`| ${row.task} | ${row.story} | ${toCellList(row.targetFiles) || "N/A"} | ${toCellList(row.astNodes) || "N/A"} |`,
			)
		}
		output.push("")
	}

	if (orderedPhases.length === 0) {
		output.push(`## ${PHASE_SETUP_TITLE}`)
		output.push("")
		output.push(`| ${TABLE_HEADERS.join(" | ")} |`)
		output.push(`| ${TABLE_HEADERS.map(() => "---").join(" | ")} |`)
		output.push("")
	}

	return `${output.join("\n").trimEnd()}\n`
}

function extractTaskContextFromTasks(
	tasksContent: string,
	intentId: string,
	requirementId?: string,
): string | undefined {
	const lines = tasksContent.split(/\r?\n/)
	for (const rawLine of lines) {
		const line = rawLine.trim()
		if (!line) {
			continue
		}

		const hasIntent = line.toUpperCase().includes(intentId.toUpperCase())
		const hasRequirement = requirementId ? line.toUpperCase().includes(requirementId.toUpperCase()) : false
		if (!hasIntent && !hasRequirement) {
			continue
		}

		return line
			.replace(/^[-*]\s*/, "")
			.replace(/^\[[ xX\-~]\]\s*/, "")
			.trim()
	}

	return undefined
}

async function readTasksContext(workspaceRoot: string): Promise<string | undefined> {
	const candidates = [
		path.join(workspaceRoot, "Tasks.md"),
		path.join(workspaceRoot, "tasks.md"),
		path.join(workspaceRoot, ".orchestration", "TODO.md"),
	]

	for (const filePath of candidates) {
		try {
			return await fs.readFile(filePath, "utf-8")
		} catch {
			continue
		}
	}

	const { content } = await ensureOrchestrationTodo(workspaceRoot)
	return content
}

function extractDeclarationMap(content: string): Map<string, string> {
	const declarations = new Map<string, string>()
	const lines = content.split(/\r?\n/)

	const patterns: RegExp[] = [
		/(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)/,
		/(?:export\s+)?interface\s+([A-Za-z_][A-Za-z0-9_]*)/,
		/(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
		/(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/,
		/(?:public|private|protected|static|async|readonly|\s)*([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{/,
		/(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\b/,
	]

	for (const rawLine of lines) {
		const line = rawLine.trim()
		if (!line) {
			continue
		}

		for (const pattern of patterns) {
			const match = line.match(pattern)
			if (!match?.[1]) {
				continue
			}

			const name = match[1]
			if (name === "constructor") {
				continue
			}

			declarations.set(name, line)
			break
		}
	}

	return declarations
}

function identifyPrimaryAstNodes(newContent: string, previousContent?: string): string[] {
	const nextDeclarations = extractDeclarationMap(newContent)
	if (!previousContent) {
		return Array.from(nextDeclarations.keys())
	}

	const previousDeclarations = extractDeclarationMap(previousContent)
	const nodes: string[] = []

	for (const [name, declaration] of nextDeclarations.entries()) {
		const prior = previousDeclarations.get(name)
		if (prior === undefined || prior !== declaration) {
			nodes.push(name)
		}
	}

	return nodes
}

async function buildReconstructedIntentMap(workspaceRoot: string): Promise<ParsedIntentMap> {
	const intents = await getAllActiveIntents(workspaceRoot)
	const tasksContent = await readTasksContext(workspaceRoot)

	const rows: IntentMapRow[] = intents.map((intent) => {
		const requirementId = intent.requirement_id ?? getRequirementIdForIntent(intent.id) ?? ""
		const taskContext =
			intent.task ?? extractTaskContextFromTasks(tasksContent ?? "", intent.id, requirementId || undefined) ?? ""
		const story = inferStoryLabel(taskContext)

		return {
			task: requirementId || intent.id,
			story,
			targetFiles: Array.from(new Set((intent.owned_scope ?? []).map((item) => normalizePath(item)))),
			astNodes: [],
		}
	})

	return { rows }
}

async function loadOrReconstructIntentMap(workspaceRoot: string, intentMapPath: string): Promise<ParsedIntentMap> {
	let parsed: ParsedIntentMap | undefined

	try {
		const existing = await fs.readFile(intentMapPath, "utf-8")
		parsed = parseIntentMap(existing)
	} catch {
		parsed = undefined
	}

	if (parsed) {
		return parsed
	}

	return buildReconstructedIntentMap(workspaceRoot)
}

export async function updateIntentMapForWrite(
	params: UpdateIntentMapParams,
): Promise<{ message?: string; nodes: string[] }> {
	if (params.mutationClass !== "INTENT_EVOLUTION") {
		return { nodes: [] }
	}

	const orchestrationDirPath = path.join(params.workspaceRoot, ".orchestration")
	const intentMapPath = path.join(orchestrationDirPath, "intent_map.md")
	await fs.mkdir(orchestrationDirPath, { recursive: true })

	const parsed = await loadOrReconstructIntentMap(params.workspaceRoot, intentMapPath)
	const requirementId = getRequirementIdForIntent(params.intentId) ?? params.intentId
	const nodes = identifyPrimaryAstNodes(params.newContent, params.previousContent)
	const story = inferStoryLabel(params.taskContext)
	const taskKey = requirementId

	let row = parsed.rows.find((entry) => entry.task.toUpperCase() === taskKey.toUpperCase())
	if (!row) {
		row = {
			task: taskKey,
			story,
			targetFiles: [],
			astNodes: [],
		}
		parsed.rows.push(row)
	}

	if (!row.story) {
		row.story = story
	}

	row.targetFiles = Array.from(new Set([...row.targetFiles, normalizePath(params.relativePath)]))
	row.astNodes = Array.from(new Set([...row.astNodes, ...nodes]))

	await fs.writeFile(intentMapPath, renderIntentMap(parsed), "utf-8")

	const nodesLabel = nodes.length > 0 ? nodes.join(", ") : "none"
	return {
		nodes,
		message: `Intent Map updated: Added [${nodesLabel}] to ${params.intentId} mapping.`,
	}
}
