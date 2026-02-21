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

	const intentId = input.activeIntent?.id ?? "UNSPECIFIED"
	const action =
		input.toolName === "write_to_file"
			? "write_to_file"
			: input.toolName === "apply_diff"
				? "apply_diff"
				: input.toolName

	const selection = await vscode.window.showWarningMessage(
		`Intent ${intentId} is requesting to ${action} on ${target.displayTarget}. Approve?`,
		{ modal: true },
		APPROVE_LABEL,
		REJECT_LABEL,
	)

	if (selection !== APPROVE_LABEL) {
		throw new Error(buildRejectionPayload())
	}
}
