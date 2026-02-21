import crypto from "crypto"
import fs from "fs/promises"
import path from "path"

import { getCurrentActiveIntent, getRequirementIdForIntent } from "./orchestration/activeIntentService"

type RecordWriteTraceParams = {
	workspaceRoot: string
	relativePath: string
	taskId: string
	modelIdentifier: string
}

type AgentTraceRecord = {
	id: string
	trace_id: string
	intent_id: string
	timestamp: string
	vcs: {
		revision_id: string
	}
	files: Array<{
		relative_path: string
		conversations: Array<{
			url: string
			contributor: {
				entity_type: "AI"
				model_identifier: string
			}
			ranges: Array<{
				start_line: number
				end_line: number
				content_hash: string
			}>
			related: Array<{
				type: "specification"
				value: string
			}>
		}>
	}>
}

const UNKNOWN_REVISION = "unknown"
const UNKNOWN_INTENT = "UNSPECIFIED"
const UNKNOWN_REQUIREMENT = "UNSPECIFIED"

function formatAgentTraceJsonLine(record: AgentTraceRecord): string {
	const formatted = JSON.stringify(record)
	return `${formatted}\n`
}

function normalizeRelativePath(filePath: string): string {
	return filePath.replace(/\\/g, "/")
}

function buildTraceId(): string {
	return `TRC-${crypto.randomBytes(4).toString("hex").toUpperCase()}`
}

async function resolveRevisionId(workspaceRoot: string): Promise<string> {
	try {
		const gitDirPath = path.join(workspaceRoot, ".git")
		const headPath = path.join(gitDirPath, "HEAD")
		const headContent = (await fs.readFile(headPath, "utf-8")).trim()

		if (!headContent.startsWith("ref:")) {
			return headContent || UNKNOWN_REVISION
		}

		const refPath = headContent.replace(/^ref:\s*/, "").trim()
		const fullRefPath = path.join(gitDirPath, refPath)

		try {
			return (await fs.readFile(fullRefPath, "utf-8")).trim() || UNKNOWN_REVISION
		} catch {
			const packedRefsPath = path.join(gitDirPath, "packed-refs")
			const packedRefs = await fs.readFile(packedRefsPath, "utf-8")
			const match = packedRefs
				.split(/\r?\n/)
				.find((line) => line && !line.startsWith("#") && !line.startsWith("^") && line.endsWith(` ${refPath}`))
			if (!match) {
				return UNKNOWN_REVISION
			}
			return match.split(" ")[0] || UNKNOWN_REVISION
		}
	} catch {
		return UNKNOWN_REVISION
	}
}

function toLineRange(content: string): { startLine: number; endLine: number } {
	const totalLines = content.length === 0 ? 1 : content.split(/\r?\n/).length
	return { startLine: 1, endLine: Math.max(1, totalLines) }
}

export async function appendAgentTraceForWrite(params: RecordWriteTraceParams): Promise<void> {
	const absolutePath = path.resolve(params.workspaceRoot, params.relativePath)
	const content = await fs.readFile(absolutePath, "utf-8")
	const contentHash = `sha256:${crypto.createHash("sha256").update(content).digest("hex")}`
	const { startLine, endLine } = toLineRange(content)

	const activeIntent = await getCurrentActiveIntent(params.workspaceRoot)
	const intentId = activeIntent?.id ?? UNKNOWN_INTENT
	const requirementId = activeIntent?.requirement_id ?? getRequirementIdForIntent(intentId) ?? UNKNOWN_REQUIREMENT
	const revisionId = await resolveRevisionId(params.workspaceRoot)

	const traceRecord: AgentTraceRecord = {
		id: crypto.randomUUID(),
		trace_id: buildTraceId(),
		intent_id: intentId,
		timestamp: new Date().toISOString(),
		vcs: { revision_id: revisionId },
		files: [
			{
				relative_path: normalizeRelativePath(params.relativePath),
				conversations: [
					{
						url: params.taskId,
						contributor: {
							entity_type: "AI",
							model_identifier: params.modelIdentifier,
						},
						ranges: [
							{
								start_line: startLine,
								end_line: endLine,
								content_hash: contentHash,
							},
						],
						related: [
							{
								type: "specification",
								value: requirementId,
							},
						],
					},
				],
			},
		],
	}

	const orchestrationDirPath = path.join(params.workspaceRoot, ".orchestration")
	const traceLogPath = path.join(orchestrationDirPath, "agent_trace.jsonl")
	const traceJsonLine = formatAgentTraceJsonLine(traceRecord)
	await fs.mkdir(orchestrationDirPath, { recursive: true })
	await fs.appendFile(traceLogPath, traceJsonLine, "utf-8")
}
