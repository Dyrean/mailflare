"use client";

import { ChevronDown, ChevronLeft, Eye, Wrench } from "lucide-react";
import Link from "next/link";
import type { AgentEmailReference, AgentMessage, AgentTurnProps } from "./types";
import { agentActionProposal, agentEmailHref, agentToolLabel, draftFromToolContent, parseAgentToolContent } from "./utils";
import { Button } from "../ui/button";

type Props = Pick<AgentTurnProps, "onOpenDraft" | "onApproveDraft" | "onApproveAction" | "approvingId"> & { item: AgentMessage };

function emailReferences(value: Record<string, unknown>): AgentEmailReference[] {
	if (Array.isArray(value.emails)) return value.emails.filter((item): item is AgentEmailReference => !!item && typeof item === "object" && typeof item.id === "string");
	if (typeof value.id === "string" && typeof value.subject === "string") return [value as AgentEmailReference];
	return [];
}

export function AgentToolActivity({ item, onOpenDraft, onApproveDraft, onApproveAction, approvingId }: Props) {
	const display = agentToolLabel(item.toolName, item.toolState, item.content);
	const draft = draftFromToolContent(item.content);
	const result = parseAgentToolContent(item.content);
	const proposal = agentActionProposal(item.content);
	const emails = result ? emailReferences(result) : [];
	return <details key={`${item.id}-${item.toolState}`} className="group/tool text-xs text-neutral-600" defaultOpen={item.toolState === "running"}>
		<summary className="flex w-full max-w-full cursor-pointer list-none items-center gap-1.5 text-sm text-neutral-500 [&::-webkit-details-marker]:hidden">
			<Wrench size={13} className="shrink-0 text-neutral-400" aria-hidden="true" />
			<span className="truncate flex-1 min-w-0">{display.label}</span>
			<ChevronLeft size={13} className="shrink-0 text-neutral-400 transition-transform group-open/tool:-rotate-90" aria-hidden="true" />
		</summary>
		<div className="mt-1.5 space-y-2 pl-[18px] text-neutral-600">
			<p>{display.description}</p>
			{emails.length > 0 && <ul className="space-y-1.5">{emails.map((email) => <li key={email.id} className="break-words"><Link className="font-medium text-blue-700 hover:underline" href={agentEmailHref(email)}>{email.subject || "(No subject)"}</Link>{email.from && <span className="text-neutral-500"> · {email.from}</span>}{email.snippet && <p className="line-clamp-2 text-neutral-500">{email.snippet}</p>}</li>)}</ul>}
			{result && Object.entries(result).filter(([key, value]) => !["emails", "text", "attachments", "result", "id", "subject", "from", "snippet", "url", "action", "status"].includes(key) && value !== null && typeof value !== "object").map(([key, value]) => <p key={key} className="break-words"><span className="text-neutral-400">{key.replace(/([A-Z])/g, " $1")}: </span>{String(value)}</p>)}
			{typeof result?.text === "string" && <p className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words">{result.text}</p>}
			{Array.isArray(result?.attachments) && result.attachments.length > 0 && <p>Attachments: {result.attachments.map((file: { filename?: string }) => file.filename || "attachment").join(", ")}</p>}
			{!result && item.content && <p className="whitespace-pre-wrap break-words">{item.content}</p>}
		</div>
		{(draft || proposal) && <div className="mt-4 mb-6 flex flex-wrap items-center justify-end gap-3">
			{draft && <>
			{/* <Link className="text-blue-700 hover:underline" href={`/drafts/${encodeURIComponent(draft.draftId)}`}>View draft</Link> */}
			<Button variant="ghost" type="button" size="sm" className="text-blue-700" onClick={() => onOpenDraft(draft.draftId)}>Edit draft</Button><Button size="sm" type="button" className="rounded-lg bg-blue-600 px-4 font-medium text-white disabled:opacity-50" disabled={approvingId === draft.draftId} onClick={() => onApproveDraft(draft.draftId, draft.revision)}>Approve to send</Button></>}
			{proposal && <>{proposal.status === "pending_approval" ? <button type="button" className="rounded-lg bg-blue-600 px-2.5 py-1.5 font-medium text-white disabled:opacity-50" disabled={!item.recordId || approvingId === item.id} onClick={() => onApproveAction(item)}>{approvingId === item.id ? "Approving…" : proposal.action === "discard_draft" ? "Approve discard" : proposal.action === "mark_email_read" ? "Approve status change" : `Approve move to ${proposal.destination}`}</button> : <span className="text-neutral-500">{proposal.status === "approved" ? "Approved" : "Processing…"}</span>}</>}
		</div>}
	</details>;
}

export function AgentPendingActions({ item, onOpenDraft, onApproveDraft, onApproveAction, approvingId }: Props) {
	const draft = draftFromToolContent(item.content);
	const proposal = agentActionProposal(item.content);
	if (!draft && proposal?.status !== "pending_approval") return null;
	return <div className="space-y-2 text-xs">
		{proposal?.status === "pending_approval" && proposal.emails && <ul className="space-y-1">{proposal.emails.map((email) => <li key={email.id}><Link className="text-blue-700 hover:underline" href={agentEmailHref(email)}>{email.subject || "(No subject)"}</Link></li>)}</ul>}
		<div className="flex flex-wrap items-center justify-end gap-3">
			{draft && <><button type="button" onClick={() => onOpenDraft(draft.draftId)} className="text-blue-700 hover:underline">Edit draft</button><button type="button" className="rounded-lg bg-blue-600 px-3 py-2 font-medium text-white disabled:opacity-50" disabled={approvingId === draft.draftId} onClick={() => onApproveDraft(draft.draftId, draft.revision)}>Approve to send</button></>}
			{proposal?.status === "pending_approval" && <button type="button" className="rounded-lg bg-blue-600 px-3 py-2 font-medium text-white disabled:opacity-50" disabled={!item.recordId || approvingId === item.id} onClick={() => onApproveAction(item)}>{approvingId === item.id ? "Approving…" : proposal.action === "discard_draft" ? "Approve discard" : proposal.action === "mark_email_read" ? "Approve status change" : `Approve move to ${proposal.destination}`}</button>}
		</div>
	</div>;
}
