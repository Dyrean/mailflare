"use client";

import ReactMarkdown from "react-markdown";
import Link from "next/link";
import remarkGfm from "remark-gfm";
import { ChevronDown, Clock3 } from "lucide-react";
import type { AgentTurnProps } from "./types";
import { formatAgentDuration } from "./utils";
import { AgentPendingActions, AgentToolActivity } from "./tool-activity";

export function AgentTurnView({ turn, onOpenDraft, onApproveDraft, onApproveAction, approvingId }: AgentTurnProps) {
	return <div className="space-y-3 py-2">
		{turn.user && <div className="ml-auto w-fit max-w-[90%] whitespace-pre-wrap break-words rounded-2xl bg-blue-100/65 px-4 py-3 text-sm leading-relaxed text-black">{turn.user.content}</div>}
		{(turn.assistant || turn.activity.length > 0) && <div className="space-y-3">
			<details key={`${turn.id}-${turn.running ? "running" : "complete"}`} defaultOpen={turn.running} className="group/process text-neutral-500">
				<summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 py-1 [&::-webkit-details-marker]:hidden"><Clock3 size={13} className="text-neutral-400" aria-hidden="true" /><span>{turn.running ? "Working..." : turn.durationMs !== null ? `Worked for ${formatAgentDuration(turn.durationMs)}` : "Work details"}</span><ChevronDown size={13} className="transition-transform group-open/process:rotate-180" aria-hidden="true" /></summary>
				<div className="mt-2 space-y-2 text-xs">
					{turn.activity.length ? turn.activity.map((item) => item.role === "reasoning" ? <p key={item.id} className="whitespace-pre-wrap break-words text-xs text-neutral-600 pl-4">{item.content}</p> : <AgentToolActivity key={item.id} item={item} onOpenDraft={onOpenDraft} onApproveDraft={onApproveDraft} onApproveAction={onApproveAction} approvingId={approvingId} />) : <p className="text-neutral-400">{turn.running ? "Waiting for the model..." : "No tool details were provided."}</p>}
				</div>
			</details>
			{turn.assistant?.content && <div className="break-words text-sm leading-relaxed text-neutral-900 [&_a]:text-blue-700 [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-3 message-content"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ img: () => null, a: ({ href, children }) => href?.startsWith("/") && !href.startsWith("//") ? <Link href={href}>{children}</Link> : <a href={href}>{children}</a> }}>{turn.assistant.content}</ReactMarkdown></div>}
			{turn.activity.filter((item) => item.role === "tool").map((item) => <AgentPendingActions key={`${item.id}:actions`} item={item} onOpenDraft={onOpenDraft} onApproveDraft={onApproveDraft} onApproveAction={onApproveAction} approvingId={approvingId} />)}
		</div>}
	</div>;
}
