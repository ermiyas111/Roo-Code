import * as path from "path"
import fs from "fs/promises"
import * as vscode from "vscode"
import ignore from "ignore"

import type { Task } from "../core/task/Task"
import { isDestructiveTool } from "../core/ToolClassifier"
import type { ToolParamName } from "../shared/tools"
import type { ActiveIntent } from "./orchestration/activeIntentService"

type GovernanceInput = {
	task: Task
	toolName: string
	toolParams?: Partial<Record<ToolParamName, string>>
	activeIntent?: ActiveIntent
}

const APPROVE_LABEL = "Approve"
const REJECT_LABEL = "Reject"
const AST_REFACTOR = "AST_REFACTOR"
const INTENT_EVOLUTION = "INTENT_EVOLUTION"

type SemanticMutationClass = typeof AST_REFACTOR | typeof INTENT_EVOLUTION

function isValidMutationClass(value: string): value is SemanticMutationClass {
	return value === AST_REFACTOR || value === INTENT_EVOLUTION
}

function normalizePosixPath(filePath: string): string {
	return filePath.replace(/\\/g, "/").replace(/^\.\//, "")
}

function hasGlobSyntax(value: string): boolean {
	return /[*?[\]{}()]/.test(value)
}

function globToRegExp(globPattern: string): RegExp {
	const escaped = globPattern
		.replace(/[.+^${}()|[\]\\]/g, "\\$&")
		.replace(/\*\*/g, "::DOUBLE_STAR::")
		.replace(/\*/g, "[^/]*")
		.replace(/::DOUBLE_STAR::/g, ".*")
		.replace(/\?/g, "[^/]")

	return new RegExp(`^${escaped}$`)
}

function pathWithinScope(targetPath: string, scopePattern: string): boolean {
	const normalizedTarget = normalizePosixPath(targetPath)
	const normalizedScope = normalizePosixPath(scopePattern)

	if (hasGlobSyntax(normalizedScope)) {
		return globToRegExp(normalizedScope).test(normalizedTarget)
	}

	if (normalizedScope.endsWith("/")) {
		return normalizedTarget.startsWith(normalizedScope)
	}

	if (normalizedTarget === normalizedScope) {
		return true
	}

	return normalizedTarget.startsWith(`${normalizedScope}/`)
}

function resolveTargetFromTool(
	toolName: string,
	toolParams?: Partial<Record<ToolParamName, string>>,
): { displayTarget: string; filePath?: string } {
	if (toolName === "execute_command") {
		const command = (toolParams?.command || "").trim()
		return { displayTarget: command || "command" }
	}

	const pathCandidate =
		toolParams?.path ||
		toolParams?.file_path ||
		(toolParams?.args && toolName === "insert_content" ? toolParams.args : undefined)

	if (!pathCandidate) {
		return { displayTarget: "target" }
	}

	return { displayTarget: pathCandidate, filePath: pathCandidate }
}

function getTargetLabel(targetPath: string): string {
	const normalized = normalizePosixPath(targetPath)
	const parts = normalized.split("/")
	return parts[parts.length - 1] || normalized
}

function extractExportLines(content: string): string[] {
	return content
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => /^export\b/.test(line))
}

function extractClassNames(content: string): Set<string> {
	const classNamePattern = /(?:^|\s)(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)/gm
	const names = new Set<string>()
	for (const match of content.matchAll(classNamePattern)) {
		if (match[1]) {
			names.add(match[1])
		}
	}
	return names
}

function extractFunctionSignatures(content: string): Map<string, string> {
	const signatures = new Map<string, string>()
	const patterns = [
		/(?:^|\s)(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/gm,
		/(?:^|\s)(?:export\s+)?const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/gm,
	]

	for (const pattern of patterns) {
		for (const match of content.matchAll(pattern)) {
			const name = match[1]
			const params = (match[2] || "").replace(/\s+/g, " ").trim()
			if (name) {
				signatures.set(name, `${name}(${params})`)
			}
		}
	}

	return signatures
}

function hasSemanticMismatchForAstRefactor(originalContent: string, newContent: string): boolean {
	const oldExportLines = new Set(extractExportLines(originalContent))
	const newExportLines = extractExportLines(newContent)
	const hasNewExport = newExportLines.some((line) => !oldExportLines.has(line))

	const oldClasses = extractClassNames(originalContent)
	const newClasses = extractClassNames(newContent)
	const hasNewClass = Array.from(newClasses).some((className) => !oldClasses.has(className))

	const oldSigs = extractFunctionSignatures(originalContent)
	const newSigs = extractFunctionSignatures(newContent)
	const hasChangedSignature = Array.from(oldSigs.entries()).some(([name, oldSig]) => {
		const newSig = newSigs.get(name)
		return newSig !== undefined && newSig !== oldSig
	})

	return hasNewExport || hasNewClass || hasChangedSignature
}

async function runSemanticClassificationSanityCheck(input: GovernanceInput, targetFilePath?: string): Promise<void> {
	if (input.toolName !== "write_to_file" || !targetFilePath) {
		return
	}

	const mutationClass = input.toolParams?.mutation_class as SemanticMutationClass | undefined
	if (mutationClass !== AST_REFACTOR) {
		return
	}

	const proposedContent = input.toolParams?.content
	if (typeof proposedContent !== "string") {
		return
	}

	const absoluteTargetPath = path.resolve(input.task.cwd, targetFilePath)
	let originalContent = ""

	try {
		originalContent = await fs.readFile(absoluteTargetPath, "utf-8")
	} catch {
		originalContent = ""
	}

	if (!hasSemanticMismatchForAstRefactor(originalContent, proposedContent)) {
		return
	}

	const warning =
		"Semantic Classification Warning: mutation_class=AST_REFACTOR appears inconsistent with diff signals (new export/new class/function signature change). Verify whether this should be INTENT_EVOLUTION."
	console.warn(`[GovernanceService] ${warning}`)
	throw new Error(warning)
}

async function readIntentIgnorePatterns(workspaceRoot: string): Promise<ReturnType<typeof ignore>> {
	const ig = ignore()
	const intentIgnorePath = path.join(workspaceRoot, ".intentignore")

	try {
		const fileContent = await fs.readFile(intentIgnorePath, "utf-8")
		ig.add(fileContent)
	} catch {
		return ig
	}

	return ig
}

function buildRejectionPayload(): string {
	return JSON.stringify({
		status: "rejected",
		message: "User denied this action. Please find an alternative approach or stay within scope.",
	})
}

export async function enforceGovernanceForTool(input: GovernanceInput): Promise<void> {
	if (!isDestructiveTool(input.toolName)) {
		return
	}

	if (input.toolName === "write_to_file") {
		const proposedMutationClass = (input.toolParams?.mutation_class || "").trim()
		if (!isValidMutationClass(proposedMutationClass)) {
			throw new Error(
				"Invalid mutation_class. You must classify this change as AST_REFACTOR or INTENT_EVOLUTION.",
			)
		}

		if (!input.toolParams?.intent_id?.trim()) {
			throw new Error("Missing intent_id for write_to_file governance approval.")
		}

		if (!input.toolParams?.path?.trim()) {
			throw new Error("Missing path for write_to_file governance approval.")
		}
	}

	const workspaceRoot = input.task.cwd
	const target = resolveTargetFromTool(input.toolName, input.toolParams)
	const normalizedTargetFilePath = target.filePath ? normalizePosixPath(target.filePath) : undefined

	if ((input.toolName === "write_to_file" || input.toolName === "apply_diff") && normalizedTargetFilePath) {
		const ownedScope = input.activeIntent?.owned_scope ?? []
		const allowed = ownedScope.some((scope) => pathWithinScope(normalizedTargetFilePath, scope))

		if (!allowed) {
			throw new Error(
				`Scope Violation: The current active intent is not authorized to edit ${normalizedTargetFilePath}. Please call select_active_intent for the correct task or request a scope expansion.`,
			)
		}
	}

	if (normalizedTargetFilePath) {
		const ig = await readIntentIgnorePatterns(workspaceRoot)
		if (ig.ignores(normalizedTargetFilePath)) {
			throw new Error(
				`Intent Ignore Violation: ${normalizedTargetFilePath} is blocked by .intentignore and cannot be modified.`,
			)
		}
	}

	await runSemanticClassificationSanityCheck(input, normalizedTargetFilePath)

	if (input.toolName === "write_to_file") {
		const params = {
			intent_id: input.toolParams?.intent_id || "",
			mutation_class: input.toolParams?.mutation_class || "",
			path: input.toolParams?.path || "",
		}

		const selection = await vscode.window.showWarningMessage(
			`[GOVERNANCE] ${params.intent_id} requested an ${params.mutation_class} on ${params.path}. Approve?`,
			{ modal: true },
			APPROVE_LABEL,
			REJECT_LABEL,
		)

		if (selection !== APPROVE_LABEL) {
			throw new Error(buildRejectionPayload())
		}

		return
	}

	const intentId = input.activeIntent?.requirement_id ?? input.activeIntent?.id ?? "UNSPECIFIED"
	const targetLabel = target.filePath ? getTargetLabel(target.filePath) : target.displayTarget

	const selection = await vscode.window.showWarningMessage(
		`[GOVERNANCE] ${intentId} requested an action on ${targetLabel}. Approve?`,
		{ modal: true },
		APPROVE_LABEL,
		REJECT_LABEL,
	)

	if (selection !== APPROVE_LABEL) {
		throw new Error(buildRejectionPayload())
	}
}
