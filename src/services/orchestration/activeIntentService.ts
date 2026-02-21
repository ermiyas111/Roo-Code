import * as path from "path"
import fs from "fs/promises"
import type { Dirent } from "fs"
import * as yaml from "js-yaml"

const SPEC_PLACEHOLDER = "None defined"

export interface ActiveIntent {
	id: string
	name: string
	status: "IN_PROGRESS" | "COMPLETED" | "PENDING"
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

export interface SpecIntentDetails {
	name: string
	owned_scope: string[]
	constraints: string[]
	acceptance_criteria: string[]
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath)
		return true
	} catch {
		return false
	}
}

async function readTextFile(filePath: string): Promise<string | undefined> {
	try {
		return await fs.readFile(filePath, "utf-8")
	} catch {
		return undefined
	}
}

function normalizeList(values: string[]): string[] {
	const cleaned = values.map((value) => value.trim()).filter((value) => value.length > 0)
	return cleaned.length > 0 ? cleaned : [SPEC_PLACEHOLDER]
}

function deriveRequirementIdFromIntentId(intentId: string): string | undefined {
	const numeric = intentId.match(/\d+/)?.[0]
	if (!numeric) {
		return undefined
	}
	return `T${numeric.padStart(3, "0")}`
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

async function resolveSourceTasksContent(workspaceRoot: string): Promise<string | undefined> {
	const branchName = await resolveCurrentBranchName(workspaceRoot)

	const candidates: string[] = []
	if (branchName) {
		candidates.push(path.join(workspaceRoot, ".specify", branchName, "tasks.md"))
		candidates.push(path.join(workspaceRoot, "specs", branchName, "tasks.md"))
	}

	candidates.push(path.join(workspaceRoot, ".specify", "tasks.md"))
	candidates.push(path.join(workspaceRoot, "specs", "tasks.md"))

	for (const tasksPath of candidates) {
		const content = await readTextFile(tasksPath)
		if (content !== undefined) {
			return content
		}
	}

	return undefined
}

export async function ensureOrchestrationTodo(workspaceRoot: string): Promise<{ todoPath: string; content?: string }> {
	const orchestrationDirPath = path.join(workspaceRoot, ".orchestration")
	const todoPath = path.join(orchestrationDirPath, "TODO.md")
	await fs.mkdir(orchestrationDirPath, { recursive: true })

	const existing = await readTextFile(todoPath)
	if (existing !== undefined) {
		return { todoPath, content: existing }
	}

	const sourceTasks = await resolveSourceTasksContent(workspaceRoot)
	if (sourceTasks === undefined) {
		return { todoPath }
	}

	await fs.writeFile(todoPath, sourceTasks, "utf-8")
	return { todoPath, content: sourceTasks }
}

async function collectFilesRecursively(rootPath: string): Promise<string[]> {
	const results: string[] = []

	async function walk(currentPath: string): Promise<void> {
		let entries: Dirent[]
		try {
			entries = await fs.readdir(currentPath, { withFileTypes: true })
		} catch {
			return
		}

		for (const entry of entries) {
			const fullPath = path.join(currentPath, entry.name)
			if (entry.isDirectory()) {
				await walk(fullPath)
				continue
			}

			if (entry.isFile() && /\.(md|markdown|ya?ml|txt)$/i.test(entry.name)) {
				results.push(fullPath)
			}
		}
	}

	if (await fileExists(rootPath)) {
		await walk(rootPath)
	}
	return results
}

function extractListFromYamlBlock(content: string, keys: string[]): string[] {
	for (const key of keys) {
		const keyPattern = new RegExp(`^\\s*${key}\\s*:\\s*$`, "im")
		const keyMatch = keyPattern.exec(content)
		if (!keyMatch) {
			continue
		}

		const tail = content.slice(keyMatch.index + keyMatch[0].length)
		const lines = tail.split(/\r?\n/)
		const values: string[] = []
		for (const line of lines) {
			if (/^\s*[A-Za-z_][A-Za-z0-9_\-]*\s*:\s*/.test(line)) {
				break
			}
			const itemMatch = line.match(/^\s*-\s+(.*)$/)
			if (itemMatch) {
				values.push(itemMatch[1].trim())
			}
		}

		return values
	}

	return []
}

function extractListFromMarkdownSection(content: string, headers: string[]): string[] {
	const lines = content.split(/\r?\n/)
	let inSection = false
	const values: string[] = []

	for (const rawLine of lines) {
		const line = rawLine.trim()
		const headerMatch = line.match(/^#{1,6}\s+(.+)$/)
		if (headerMatch) {
			const normalizedHeader = headerMatch[1]
				.toLowerCase()
				.replace(/[^a-z_\s]/g, "")
				.trim()
			const isTarget = headers.some((header) => normalizedHeader === header || normalizedHeader.includes(header))
			if (isTarget) {
				inSection = true
				continue
			}

			if (inSection) {
				break
			}
		}

		if (!inSection) {
			continue
		}

		const bulletMatch = line.match(/^[-*]\s+(.*)$/)
		if (bulletMatch) {
			values.push(bulletMatch[1].trim())
		}
	}

	return values
}

function getIndentLevel(rawLine: string): number {
	const normalized = rawLine.replace(/\t/g, "    ")
	const match = normalized.match(/^\s*/)
	return match ? match[0].length : 0
}

function extractAcceptanceCriteriaFromStoryFormat(content: string): string[] {
	const lines = content.split(/\r?\n/)
	const values: string[] = []

	let collecting = false
	let criteriaIndent = -1

	for (const rawLine of lines) {
		const line = rawLine.trim()

		if (!collecting) {
			const isCriteriaMarker =
				/^-\s*\*\*Acceptance\s*Criteria\*\*\s*:?\s*$/i.test(line) ||
				/^\*\*Acceptance\s*Criteria\*\*\s*:?\s*$/i.test(line)

			if (isCriteriaMarker) {
				collecting = true
				criteriaIndent = getIndentLevel(rawLine)
			}
			continue
		}

		if (!line) {
			continue
		}

		const indent = getIndentLevel(rawLine)
		const bulletMatch = line.match(/^[-*]\s+(.*)$/)

		if (bulletMatch && indent > criteriaIndent) {
			values.push(bulletMatch[1].trim())
			continue
		}

		if (indent <= criteriaIndent) {
			break
		}
	}

	return values
}

function extractName(content: string, intentId: string, requirementId?: string): string {
	const lines = content.split(/\r?\n/)
	for (const rawLine of lines) {
		const line = rawLine.trim()
		if (!line) {
			continue
		}
		const hasId = line.toUpperCase().includes(intentId.toUpperCase())
		const hasReq = requirementId ? line.toUpperCase().includes(requirementId.toUpperCase()) : false
		if (hasId || hasReq) {
			return (
				line
					.replace(new RegExp(intentId, "ig"), "")
					.replace(new RegExp(requirementId ?? "", "ig"), "")
					.replace(/^[-*#\[\]().:x\s]+/i, "")
					.trim() || `Intent ${intentId}`
			)
		}
	}
	return `Intent ${intentId}`
}

function extractTaskStringFromTodo(
	todoContent: string | undefined,
	intentId: string,
	requirementId?: string,
): string | undefined {
	if (!todoContent) {
		return undefined
	}

	const lines = todoContent.split(/\r?\n/)
	for (const rawLine of lines) {
		const line = rawLine.trim()
		if (!line) {
			continue
		}

		const hasIntentId = line.toUpperCase().includes(intentId.toUpperCase())
		const hasRequirementId = requirementId ? line.toUpperCase().includes(requirementId.toUpperCase()) : false
		if (!hasIntentId && !hasRequirementId) {
			continue
		}

		return line
			.replace(/^[-*]\s*/g, "")
			.replace(/^\[[ xX\-~]\]\s*/g, "")
			.replace(new RegExp(intentId, "ig"), "")
			.replace(new RegExp(requirementId ?? "", "ig"), "")
			.replace(/^[-*#\[\]().:x\s]+/i, "")
			.trim()
	}

	return undefined
}

function extractOwnedScopeFromTaskString(taskString: string | undefined): string[] {
	if (!taskString) {
		return [SPEC_PLACEHOLDER]
	}

	const pathTokenPattern = /([A-Za-z0-9._-]+(?:[\\/][A-Za-z0-9._-]+)+(?:[\\/])?)/g
	const extractedPaths: string[] = []

	for (const match of taskString.matchAll(pathTokenPattern)) {
		const rawPath = match[1]
		if (!rawPath) {
			continue
		}

		const normalizedPath = rawPath.replace(/\\/g, "/").replace(/[),.;:]+$/g, "")
		if (normalizedPath.length === 0) {
			continue
		}

		extractedPaths.push(normalizedPath)
	}

	if (extractedPaths.length > 0) {
		const uniquePaths = Array.from(new Set(extractedPaths))
		return normalizeList(uniquePaths)
	}

	return normalizeList([taskString])
}

async function readBranchScopedSpecFile(workspaceRoot: string, fileName: string): Promise<string | undefined> {
	const branchName = await resolveCurrentBranchName(workspaceRoot)

	const candidates: string[] = []
	if (branchName) {
		candidates.push(path.join(workspaceRoot, ".specify", branchName, fileName))
		candidates.push(path.join(workspaceRoot, "specs", branchName, fileName))
	}

	candidates.push(path.join(workspaceRoot, ".specify", fileName))
	candidates.push(path.join(workspaceRoot, "specs", fileName))

	for (const filePath of candidates) {
		const content = await readTextFile(filePath)
		if (content !== undefined) {
			return content
		}
	}

	return undefined
}

function parseSpecIntentDetails(content: string, intentId: string, requirementId?: string): SpecIntentDetails {
	const ownedScope = normalizeList([
		...extractListFromYamlBlock(content, ["owned_scope", "scope"]),
		...extractListFromMarkdownSection(content, ["owned scope", "scope"]),
	])

	const constraints = normalizeList([
		...extractListFromYamlBlock(content, ["constraints"]),
		...extractListFromMarkdownSection(content, ["constraints"]),
	])

	const acceptanceCriteria = normalizeList([
		...extractListFromYamlBlock(content, ["acceptance_criteria"]),
		...extractListFromMarkdownSection(content, ["acceptance criteria", "acceptance_criteria"]),
	])

	return {
		name: extractName(content, intentId, requirementId),
		owned_scope: ownedScope,
		constraints,
		acceptance_criteria: acceptanceCriteria,
	}
}

export async function readSpecIntentDetails(workspaceRoot: string, intentId: string): Promise<SpecIntentDetails> {
	const requirementId = deriveRequirementIdFromIntentId(intentId)

	const { content: todoContent } = await ensureOrchestrationTodo(workspaceRoot)
	const taskString = extractTaskStringFromTodo(todoContent, intentId, requirementId)

	const metaContent = await readBranchScopedSpecFile(workspaceRoot, "_meta.md")
	const functionalContent = await readBranchScopedSpecFile(workspaceRoot, "functional.md")

	const constraints = metaContent
		? normalizeList([
				...extractListFromYamlBlock(metaContent, ["constraints"]),
				...extractListFromMarkdownSection(metaContent, ["constraints"]),
			])
		: [SPEC_PLACEHOLDER]

	const acceptanceCriteria = functionalContent
		? normalizeList([
				...extractListFromYamlBlock(functionalContent, ["acceptance_criteria"]),
				...extractAcceptanceCriteriaFromStoryFormat(functionalContent),
				...extractListFromMarkdownSection(functionalContent, ["acceptance criteria", "acceptance_criteria"]),
			])
		: [SPEC_PLACEHOLDER]

	const ownedScope = extractOwnedScopeFromTaskString(taskString)
	const name = taskString || `Intent ${intentId}`

	return {
		name,
		owned_scope: ownedScope,
		constraints,
		acceptance_criteria: acceptanceCriteria,
	}
}

function parseTodoContainsIntent(todoContent: string, intentId: string): boolean {
	const requirementId = deriveRequirementIdFromIntentId(intentId)
	const normalized = todoContent.toUpperCase()
	return normalized.includes(intentId.toUpperCase()) || (requirementId ? normalized.includes(requirementId) : false)
}

export async function verifyIntentExistsInTodo(
	workspaceRoot: string,
	intentId: string,
): Promise<{ todoPath: string; exists: boolean }> {
	const { todoPath, content } = await ensureOrchestrationTodo(workspaceRoot)
	if (!content) {
		return { todoPath, exists: false }
	}
	return { todoPath, exists: parseTodoContainsIntent(content, intentId) }
}

async function readActiveIntentsYaml(
	filePath: string,
): Promise<{ root: Record<string, any>; intents: ActiveIntent[] }> {
	try {
		const raw = await fs.readFile(filePath, "utf-8")
		const parsed = yaml.load(raw)
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			const parsedRecord = parsed as Record<string, any>
			const intents = Array.isArray(parsedRecord.active_intents)
				? parsedRecord.active_intents.filter((item: any) => item && typeof item?.id === "string")
				: []
			return { root: parsedRecord, intents }
		}
		return { root: {}, intents: [] }
	} catch {
		return { root: {}, intents: [] }
	}
}

export async function upsertActiveIntent(
	workspaceRoot: string,
	intent: ActiveIntent,
): Promise<{ path: string; intent: ActiveIntent }> {
	const orchestrationDirPath = path.join(workspaceRoot, ".orchestration")
	const activeIntentsPath = path.join(orchestrationDirPath, "active_intents.yaml")
	await fs.mkdir(orchestrationDirPath, { recursive: true })

	const { root, intents } = await readActiveIntentsYaml(activeIntentsPath)
	const remaining = intents.filter((entry) => entry.id !== intent.id)
	const next = {
		...root,
		active_intents: [intent, ...remaining],
	}

	await fs.writeFile(activeIntentsPath, yaml.dump(next, { lineWidth: 0 }), "utf-8")
	return { path: activeIntentsPath, intent }
}

export async function removeActiveIntent(
	workspaceRoot: string,
	intentId: string,
): Promise<{ path: string; removed: boolean }> {
	const orchestrationDirPath = path.join(workspaceRoot, ".orchestration")
	const activeIntentsPath = path.join(orchestrationDirPath, "active_intents.yaml")
	await fs.mkdir(orchestrationDirPath, { recursive: true })

	const { root, intents } = await readActiveIntentsYaml(activeIntentsPath)
	const remaining = intents.filter((entry) => entry.id !== intentId)
	const removed = remaining.length !== intents.length

	const next = {
		...root,
		active_intents: remaining,
	}

	await fs.writeFile(activeIntentsPath, yaml.dump(next, { lineWidth: 0 }), "utf-8")
	return { path: activeIntentsPath, removed }
}

export async function getCurrentActiveIntent(workspaceRoot: string): Promise<ActiveIntent | undefined> {
	const activeIntentsPath = path.join(workspaceRoot, ".orchestration", "active_intents.yaml")
	const { intents } = await readActiveIntentsYaml(activeIntentsPath)
	return intents.find((intent) => intent.status === "IN_PROGRESS") ?? intents[0]
}

export async function getAllActiveIntents(workspaceRoot: string): Promise<ActiveIntent[]> {
	const activeIntentsPath = path.join(workspaceRoot, ".orchestration", "active_intents.yaml")
	const { intents } = await readActiveIntentsYaml(activeIntentsPath)
	return intents
}

export async function getActiveIntentById(workspaceRoot: string, intentId: string): Promise<ActiveIntent | undefined> {
	const activeIntentsPath = path.join(workspaceRoot, ".orchestration", "active_intents.yaml")
	const { intents } = await readActiveIntentsYaml(activeIntentsPath)
	return intents.find((intent) => intent.id === intentId)
}

export async function markRequirementCompletedInTodo(workspaceRoot: string, intentId: string): Promise<void> {
	const { todoPath, content } = await ensureOrchestrationTodo(workspaceRoot)
	if (!content) {
		return
	}

	const requirementId = deriveRequirementIdFromIntentId(intentId)
	if (!requirementId) {
		return
	}

	const lines = content.split(/\r?\n/)
	let found = false
	const updated = lines.map((line) => {
		if (!line.toUpperCase().includes(requirementId.toUpperCase())) {
			return line
		}
		found = true
		return line
			.replace(/\[\s\]/g, "[x]")
			.replace(/\bTODO\b/gi, "COMPLETED")
			.replace(/\bIN_PROGRESS\b/gi, "COMPLETED")
	})

	if (!found) {
		updated.push(`- [x] ${requirementId} COMPLETED`)
	}

	await fs.writeFile(todoPath, updated.join("\n"), "utf-8")
}

export function normalizeIntentId(intentIdRaw: string): string {
	const trimmed = intentIdRaw.trim().toUpperCase()
	if (/^INT-\d{1,}$/.test(trimmed)) {
		const numeric = trimmed.match(/\d+/)?.[0] ?? "1"
		return `INT-${numeric.padStart(3, "0")}`
	}
	return trimmed
}

export function getRequirementIdForIntent(intentId: string): string | undefined {
	return deriveRequirementIdFromIntentId(intentId)
}
