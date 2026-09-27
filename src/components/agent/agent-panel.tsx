"use client";

import "./style.scss"

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, FileText, ListChecks, Maximize2, Minimize2, PenLine, Plus, Send, Settings2, Sparkles, Square, X } from "lucide-react";
import { authFetch } from "@/lib/auth/client";
import { useSelectedMailbox } from "@/components/mailbox-provider";
import { useCompose } from "@/components/compose/compose-context";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { AgentTurnView } from "./agent-turn";
import { SendReview } from "./send-review";
import type { ReviewSnapshot } from "./send-review-types";
import { approveAgentAction, requestDraftReview } from "./client-actions";
import type { AgentConversation, AgentConversationsResponse, AgentErrorResponse, AgentEvent, AgentHistoryResponse, AgentJob, AgentJobsResponse, AgentMessage, AgentPanelProps, AgentPanelView, AgentSettings, AgentSettingsResponse } from "./types";
import { appendAgentReasoning, consumeAgentStream, groupAgentMessages, markAgentDraftSent, normalizeAgentHistory, readAgentConversationId, resizeAgentInput, saveAgentConversationId, shouldSubmitAgentInput } from "./utils";

export function AgentPanel({ open, fullSize, onClose, onToggleFullSize }: AgentPanelProps) {
	const { selectedMailbox } = useSelectedMailbox();
	const pathname = usePathname();
	const { openDraftComposer } = useCompose();
	const [view, setView] = useState<AgentPanelView>("chat");
	const [settings, setSettings] = useState<AgentSettings | null>(null);
	const [availableModels, setAvailableModels] = useState<string[]>([]);
	const [reviewers, setReviewers] = useState<{ id: string; name: string; email: string }[]>([]);
	const [canManage, setCanManage] = useState(false);
	const [providerConfigured, setProviderConfigured] = useState(false);
	const [autoReplyEnabled, setAutoReplyEnabled] = useState(false);
	const [conversationId, setConversationId] = useState<string | null>(null);
	const [conversations, setConversations] = useState<AgentConversation[]>([]);
	const [messages, setMessages] = useState<AgentMessage[]>([]);
	const [jobs, setJobs] = useState<AgentJob[]>([]);
	const [input, setInput] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [approvingId, setApprovingId] = useState<string | null>(null);
	const [draftReview, setDraftReview] = useState<{ approvalId: string; snapshot: ReviewSnapshot; draftId: string } | null>(null);
	const abort = useRef<AbortController | null>(null);
	const menuRef = useRef<HTMLDetailsElement | null>(null);
	const inputRef = useRef<HTMLTextAreaElement | null>(null);
	const selectedConversationRef = useRef<string | null>(null);
	const mailboxId = selectedMailbox?.id;
	const selectedMessageId = pathname.match(/^\/(?:inbox|sent|archived|spam|trash|starred|snoozed|folders\/[^/]+)\/([^/]+)/)?.[1] ?? null;
	const welcomePrompts = selectedMessageId ? [
		{ label: "Summarize this email", detail: "Get the key points", prompt: `Read the thread containing email ${selectedMessageId} and summarize its key points.`, icon: FileText },
		{ label: "Suggest a reply", detail: "Create a draft for review", prompt: `Read the thread containing email ${selectedMessageId} and draft a reply.`, icon: PenLine },
		{ label: "List action items", detail: "Find next steps in this email", prompt: `Read the thread containing email ${selectedMessageId} and list the action items.`, icon: ListChecks },
	] : [
		{ label: "Summarize recent mail", detail: "Catch up on your inbox", prompt: "Summarize my recent email in this mailbox.", icon: FileText },
		{ label: "Suggest a reply", detail: "Create a draft for review", prompt: "Read my latest email and draft a reply.", icon: PenLine },
		{ label: "Find action items", detail: "See what needs attention", prompt: "Find action items in my recent email.", icon: ListChecks },
	];

	const refresh = useCallback(async () => {
		if (!mailboxId) return;
		const [settingsResponse, conversationsResponse, jobsResponse] = await Promise.all([
			authFetch(`/api/agent/settings?mailboxId=${encodeURIComponent(mailboxId)}`),
			authFetch(`/api/agent/conversations?mailboxId=${encodeURIComponent(mailboxId)}`),
			authFetch(`/api/agent/jobs?mailboxId=${encodeURIComponent(mailboxId)}`),
		]);
		if (!settingsResponse.ok) {
			const data = await settingsResponse.json().catch(() => ({})) as AgentErrorResponse;
			setError(data.error || "Could not load assistant settings");
			return;
		}
		if (settingsResponse.ok) {
			const data = await settingsResponse.json() as AgentSettingsResponse;
			setSettings(data.settings);
			setAvailableModels(data.models ?? []);
			setCanManage(data.canManage);
			setProviderConfigured(data.providerConfigured);
			setAutoReplyEnabled(data.autoReplyEnabled);
			setReviewers(data.reviewers ?? []);
		}
		if (conversationsResponse.ok) setConversations(((await conversationsResponse.json()) as AgentConversationsResponse).conversations ?? []);
		if (jobsResponse.ok) setJobs(((await jobsResponse.json()) as AgentJobsResponse).jobs ?? []);
	}, [mailboxId]);

	useEffect(() => {
		abort.current?.abort();
		if (!open || !mailboxId) return;
		let cancelled = false;
		setConversationId(null);
		setMessages([]);
		setSettings(null);
		setView("chat");
		if (menuRef.current) menuRef.current.open = false;
		setError(null);
		void refresh().catch(() => { if (!cancelled) setError("Could not load assistant settings"); });
		const savedId = readAgentConversationId(mailboxId);
		selectedConversationRef.current = savedId;
		if (savedId) void authFetch(`/api/agent/conversations/${encodeURIComponent(savedId)}?mailboxId=${encodeURIComponent(mailboxId)}`).then(async (response) => {
			if (cancelled || selectedConversationRef.current !== savedId) return;
			if (!response.ok) { saveAgentConversationId(mailboxId, null); selectedConversationRef.current = null; return; }
			const history = await response.json() as AgentHistoryResponse;
			if (cancelled || selectedConversationRef.current !== savedId) return;
			setConversationId(savedId);
			setMessages(normalizeAgentHistory(history.messages ?? []));
		}).catch(() => undefined);
		return () => { cancelled = true; abort.current?.abort(); };
	}, [mailboxId, open, refresh]);

	useEffect(() => {
		const closeMenu = (event: PointerEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) menuRef.current.open = false;
		};
		const closeOnEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape" && menuRef.current?.open) menuRef.current.open = false;
		};
		document.addEventListener("pointerdown", closeMenu);
		document.addEventListener("keydown", closeOnEscape);
		return () => {
			document.removeEventListener("pointerdown", closeMenu);
			document.removeEventListener("keydown", closeOnEscape);
		};
	}, []);

	useEffect(() => { resizeAgentInput(inputRef.current); }, [input, view]);

	useEffect(() => {
		function onDraft(event: Event) {
			const data = (event as CustomEvent<{ mailboxId: string }>).detail;
			if (open && data.mailboxId === mailboxId) void refresh();
		}
		window.addEventListener("mailflare:agent-draft", onDraft);
		return () => window.removeEventListener("mailflare:agent-draft", onDraft);
	}, [mailboxId, open, refresh]);

	useEffect(() => {
		if (!open) return;
		const timer = window.setInterval(() => void refresh(), 30_000);
		return () => window.clearInterval(timer);
	}, [open, refresh]);

	async function selectConversation(id: string) {
		if (!mailboxId) return;
		abort.current?.abort();
		selectedConversationRef.current = id;
		saveAgentConversationId(mailboxId, id);
		setConversationId(id);
		setView("chat");
		if (menuRef.current) menuRef.current.open = false;
		const response = await authFetch(`/api/agent/conversations/${id}?mailboxId=${encodeURIComponent(mailboxId)}`);
		if (response.ok) setMessages(normalizeAgentHistory(((await response.json()) as AgentHistoryResponse).messages ?? []));
	}

	async function deleteConversation() {
		if (!conversationId) return;
		const response = await authFetch(`/api/agent/conversations/${conversationId}`, { method: "DELETE" });
		if (response.ok) { selectedConversationRef.current = null; if (mailboxId) saveAgentConversationId(mailboxId, null); setConversationId(null); setMessages([]); await refresh(); }
		if (menuRef.current) menuRef.current.open = false;
	}

	async function send(text: string) {
		if (!mailboxId || !text.trim() || busy) return;
		const controller = new AbortController();
		const userMessageId = crypto.randomUUID();
		const assistantMessageId = crypto.randomUUID();
		const startedAt = Date.now();
		let accepted = false;
		abort.current = controller;
		setBusy(true);
		setError(null);
		setInput("");
		setMessages((current) => [...current, { id: userMessageId, role: "user", content: text, createdAt: new Date(startedAt).toISOString() }, { id: assistantMessageId, role: "assistant", content: "", pending: true }]);
		try {
			const response = await authFetch("/api/agent/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mailboxId, ...(conversationId ? { conversationId } : {}), text }), signal: controller.signal });
			if (!response.ok) throw new Error(((await response.json()) as AgentErrorResponse).error || "Assistant unavailable");
			accepted = true;
			await consumeAgentStream(response, (event: AgentEvent) => {
				if (event.type === "conversation") { selectedConversationRef.current = event.conversationId; saveAgentConversationId(mailboxId, event.conversationId); setConversationId(event.conversationId); }
				if (event.type === "text") setMessages((current) => current.map((item) => item.id === assistantMessageId ? { ...item, content: item.content + event.text } : item));
				if (event.type === "reasoning") setMessages((current) => appendAgentReasoning(current, assistantMessageId, event.text));
				if (event.type === "reclassify") setMessages((current) => appendAgentReasoning(current, assistantMessageId, event.text, true));
				if (event.type === "tool") {
					const toolId = `${assistantMessageId}:tool:${event.id}`;
					const content = event.state === "running" ? "" : typeof event.result === "string" ? event.result : JSON.stringify(event.result) ?? "";
					const toolState = event.state === "running" ? "running" : event.state === "failed" ? "failed" : "used";
					setMessages((current) => current.some((item) => item.id === toolId) ? current.map((item) => item.id === toolId ? { ...item, toolState, content, recordId: event.recordId } : item) : [...current, { id: toolId, role: "tool", toolName: event.name, toolState, content, recordId: event.recordId }]);
				}
				if (event.type === "error") setError(event.message);
			});
			setMessages((current) => current.map((item) => item.id === assistantMessageId ? { ...item, pending: false, durationMs: Date.now() - startedAt, createdAt: new Date().toISOString() } : item));
			void refresh();
		} catch (cause) {
			if (!accepted) {
				setMessages((current) => current.filter((item) => item.id !== userMessageId && item.id !== assistantMessageId));
				if (!controller.signal.aborted) setInput(text);
			} else setMessages((current) => current.map((item) => item.id === assistantMessageId ? { ...item, pending: false, durationMs: Date.now() - startedAt, createdAt: new Date().toISOString() } : item));
			if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Assistant failed");
		} finally { setBusy(false); }
	}

	async function saveSettings() {
		if (!settings) return;
		setBusy(true);
		setError(null);
		try {
			const response = await authFetch("/api/agent/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
			if (!response.ok) throw new Error(((await response.json()) as AgentErrorResponse).error || "Could not save settings");
			await refresh();
		} catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save settings"); }
		finally { setBusy(false); }
	}

	async function retryJob(id: string) {
		const response = await authFetch(`/api/agent/jobs/${id}/retry`, { method: "POST" });
		if (response.ok) await refresh();
		else setError(((await response.json()) as AgentErrorResponse).error || "Could not retry draft");
	}

	async function discardJobDraft(draftId: string) {
		const response = await authFetch(`/api/drafts/${encodeURIComponent(draftId)}`, { method: "DELETE" });
		if (response.ok) await refresh();
		else setError(((await response.json()) as AgentErrorResponse).error || "Could not discard draft");
	}

	async function startDraftReview(draftId: string, revision: number) {
		setApprovingId(draftId);
		setError(null);
		try { setDraftReview({ ...await requestDraftReview(draftId, revision), draftId }); }
		catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open draft review"); }
		finally { setApprovingId(null); }
	}

	async function confirmAction(item: AgentMessage) {
		if (!item.recordId) return;
		setApprovingId(item.id);
		setError(null);
		try {
			const result = await approveAgentAction(item.recordId);
			setMessages((current) => current.map((message) => message.id === item.id ? { ...message, content: JSON.stringify(result) } : message));
			window.dispatchEvent(new Event("mailflare:messages-changed"));
		} catch (cause) { setError(cause instanceof Error ? cause.message : "Could not approve action"); }
		finally { setApprovingId(null); }
	}

	return <section id="email-assistant-panel" className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-3xl border border-neutral-200/70 bg-white text-neutral-900 shadow-xl shadow-neutral-300/30" aria-label="Email assistant">
		<header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-neutral-100 pl-4 pr-2">
			<div className="flex min-w-0 items-center gap-2.5">{view === "settings" ? <button type="button" className="-ml-2 rounded-full p-2 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900" onClick={() => setView("chat")} aria-label="Back to assistant" title="Back to assistant"><ArrowLeft size={18} /></button> : <Sparkles className="h-5 w-5 shrink-0 fill-blue-400/20 text-blue-600/70" aria-hidden="true" />}<div className="min-w-0"><strong className="block truncate text-sm font-semibold">{view === "settings" ? "Settings" : "Assistant"}</strong></div></div>
			<div className="flex shrink-0 items-center gap-0.5"><details ref={menuRef} className="relative"><summary className={`list-none cursor-pointer rounded-full p-2 hover:bg-neutral-100 [&::-webkit-details-marker]:hidden ${view === "settings" ? "text-blue-700" : "text-neutral-600 hover:text-neutral-900"}`} aria-label="Assistant conversations and settings"><Settings2 size={18} /></summary><div className="absolute -right-16 top-full z-30 mt-2 flex w-72 flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white py-2 text-sm shadow-xl"><button type="button" className="flex items-center gap-2 px-4 py-2 text-left text-neutral-800 hover:bg-neutral-50" onClick={() => { abort.current?.abort(); selectedConversationRef.current = null; if (mailboxId) saveAgentConversationId(mailboxId, null); setConversationId(null); setMessages([]); setInput(""); setView("chat"); menuRef.current!.open = false; }}><Plus size={16} /> New chat</button><div className="mx-3 my-2 border-t border-neutral-100" /><p className="px-4 pb-1 text-xs font-medium text-neutral-500">Previous chats</p><div className="max-h-64 overflow-y-auto">{conversations.length ? conversations.map((item) => <button key={item.id} type="button" className={`block w-full truncate px-4 py-2 text-left hover:bg-neutral-50 ${conversationId === item.id ? "bg-blue-50 text-blue-700" : "text-neutral-700"}`} onClick={() => void selectConversation(item.id)}>{item.title}</button>) : <p className="px-4 py-3 text-neutral-500">No previous chats</p>}</div>{conversationId && <button type="button" className="px-4 py-2 text-left text-red-600 hover:bg-red-50" onClick={() => void deleteConversation()}>Delete current chat</button>}<div className="mx-3 my-2 border-t border-neutral-100" /><button type="button" className="flex items-center gap-2 px-4 py-2 text-left text-neutral-800 hover:bg-neutral-50" onClick={() => { setView((current) => current === "settings" ? "chat" : "settings"); menuRef.current!.open = false; }}><Settings2 size={16} /> {view === "settings" ? "Back to chat" : "Settings"}</button></div></details><button type="button" className="rounded-full p-2 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900" onClick={onToggleFullSize} aria-label={fullSize ? "Exit full size assistant" : "Expand assistant to full size"} aria-pressed={fullSize} title={fullSize ? "Exit full size" : "Full size"}>{fullSize ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button><button type="button" className="rounded-full p-2 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900" onClick={onClose} aria-label="Close assistant"><X size={18} /></button></div>
		</header>
		{error && <p role="alert" className="mx-4 mt-3 break-words rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
		{view === "chat" && <>
			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 text-sm sm:px-5">
				<div className="mx-auto max-w-3xl space-y-5">
					{settings && !providerConfigured && <p className="rounded-2xl border border-amber-100 bg-amber-50 p-3 text-amber-800">Configure an AI provider to use chat and auto-drafts.</p>}
					{messages.length === 0 && settings && <div className="pt-3"><label className="mt-1 font-medium leading-tight text-neutral-800">How can I help you today?</label><div className="mt-7 space-y-2">{welcomePrompts.map((item) => { const Icon = item.icon; return <button key={item.label} type="button" className="flex w-full items-center gap-3 rounded-2xl bg-[#f0f3f9] px-3 py-3 text-left transition-colors hover:bg-[#e6ecf6] disabled:cursor-not-allowed disabled:opacity-50" disabled={!providerConfigured || busy} onClick={() => void send(item.prompt)}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-neutral-800"><Icon size={18} /></span><span className="min-w-0"><span className="block font-medium text-neutral-800">{item.label}</span><span className="block text-xs text-neutral-500">{item.detail}</span></span></button>; })}</div></div>}
					{groupAgentMessages(messages).map((turn) => <AgentTurnView key={turn.id} turn={turn} onOpenDraft={openDraftComposer} onApproveDraft={(draftId, revision) => void startDraftReview(draftId, revision)} onApproveAction={(item) => void confirmAction(item)} approvingId={approvingId} />)}
					{jobs.filter((job) => job.status === "completed" && job.draftId).slice(0, 5).map((job) => <div key={job.id} className="rounded-2xl border border-neutral-200 bg-white p-3"><p>Auto-draft ready</p><div className="mt-2 flex gap-3 text-blue-700"><button type="button" onClick={() => openDraftComposer(job.draftId!)}>Open draft</button><button type="button" disabled={busy} onClick={() => void send(`Read the thread containing email ${job.sourceMessageId} and draft another reply. Preserve the existing draft.`)}>Regenerate</button><button type="button" className="text-red-600" onClick={() => void discardJobDraft(job.draftId!)}>Discard</button></div></div>)}
				</div>
			</div>
			<form className="relative mx-auto w-full max-w-3xl pb-2 px-3" onSubmit={(event) => { event.preventDefault(); void send(input); }}><textarea ref={inputRef} rows={1} className="w-full resize-none rounded-4xl bg-blue-100/40 px-4 py-3 pr-12 text-sm leading-5 outline-none focus:border-blue-300 disabled:opacity-50" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (!shouldSubmitAgentInput(event)) return; event.preventDefault(); if (input.trim() && settings && providerConfigured && !busy) event.currentTarget.form?.requestSubmit(); }} placeholder="Enter a prompt here" name="message" disabled={!settings || !providerConfigured || busy} />
				<div className="absolute bottom-5 right-4 flex justify-end gap-2">
					{busy && <Button type="button" variant="outline" size="sm" onClick={() => abort.current?.abort()}><Square className="h-3 w-3" /> Stop</Button>}
					<Button type="submit" variant="ghost" size="sm" disabled={!input.trim() || !settings || !providerConfigured || busy}><Send size={18} /></Button>
				</div>
			</form>
		</>}
		{view === "settings" && <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4 text-sm">
			{!canManage && <p>Mailbox management permission is required to change these settings.</p>}
			{settings && <>
				<label className="block">Draft reviewer<select className="mt-2 w-full rounded-xl border border-neutral-200 bg-white p-2 outline-none focus:border-blue-400" value={settings.reviewerUserId ?? ""} disabled={!canManage} onChange={(event) => setSettings({ ...settings, reviewerUserId: event.target.value })}>{reviewers.map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.name} ({reviewer.email})</option>)}</select></label>
				<label className="block">Model<select className="mt-2 w-full rounded-xl border border-neutral-200 bg-white p-2 outline-none focus:border-blue-400" value={settings.modelId ?? ""} disabled={!canManage || !availableModels.length} onChange={(event) => setSettings({ ...settings, modelId: event.target.value })}>{!availableModels.length && <option value="">No models configured</option>}{availableModels.map((model) => <option key={model} value={model}>{model}</option>)}</select></label>
				<div className="flex items-center justify-between gap-3"><span>Automatically draft replies</span><Switch checked={settings.autoDraftEnabled} disabled={!canManage || autoReplyEnabled} onCheckedChange={(checked) => setSettings({ ...settings, autoDraftEnabled: checked })} aria-label="Automatically draft replies" /></div>
				{autoReplyEnabled && <p className="text-amber-700">Disable out-of-office auto-replies to enable AI drafts.</p>}
				<label className="block">Writing instructions<textarea className="mt-2 min-h-32 w-full rounded-xl border border-neutral-200 p-2 outline-none focus:border-blue-400" value={settings.instructions} disabled={!canManage} onChange={(event) => setSettings({ ...settings, instructions: event.target.value })} /></label>
				<label className="block">Daily auto-draft limit<input className="mt-2 w-full rounded-xl border border-neutral-200 p-2 outline-none focus:border-blue-400" type="number" min="1" max="100" value={settings.dailyLimit} disabled={!canManage} onChange={(event) => setSettings({ ...settings, dailyLimit: Number(event.target.value) })} /></label>
				<Button type="button" size="sm" disabled={!canManage || busy} onClick={() => void saveSettings()}>Save settings</Button>
			</>}
			<p className="text-xs text-neutral-500">Selected email and thread content is sent to the configured AI provider when you use chat or auto-drafts. Drafts always need your confirmation before sending.</p>
			{jobs.filter((job) => job.status === "failed" || job.status === "skipped").slice(0, 5).map((job) => <p key={job.id} className="text-xs">{job.status}: {job.reason}{job.status === "failed" && <button type="button" className="ml-2 text-blue-700 underline" onClick={() => void retryJob(job.id)}>Retry</button>}</p>)}
		</div>}
	{draftReview && <SendReview approvalId={draftReview.approvalId} snapshot={draftReview.snapshot} onClose={() => setDraftReview(null)} onSent={() => { setMessages((current) => markAgentDraftSent(current, draftReview.draftId)); setDraftReview(null); void refresh(); }} />}
	</section>;
}
