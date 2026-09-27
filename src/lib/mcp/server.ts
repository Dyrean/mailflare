import { and, eq } from "drizzle-orm";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getDb } from "@/db";
import { agentDraftMetadata, agentSendApprovals, messages } from "@/db/schema";
import { getMailboxAccessLevel, listAccessibleMailboxes } from "@/lib/mailboxes/access";
import { runEmailTool, EMAIL_TOOL_NAMES, emailToolDescriptions, emailToolSchemas } from "@/lib/agent/tools";
import { requestAgentSend, getAgentSendRequest } from "@/lib/agent/approvals/utils";
import { buildSnippet } from "@/lib/email/parse";
import type { EmailToolName } from "@/lib/agent/types";
import type { McpPrincipal } from "./types";
import { registerAdminMcpTools } from "./admin-tools";

const scopeByTool: Record<EmailToolName, string> = {
	list_emails: "mcp:read", get_email: "mcp:read", get_thread: "mcp:read", search_emails: "mcp:read",
	draft_email: "mcp:draft", draft_reply: "mcp:draft", mark_email_read: "mcp:organize", move_email: "mcp:organize", discard_draft: "mcp:draft",
};

function output(value: unknown, isError = false) {
	return { content: [{ type: "text" as const, text: JSON.stringify(value) }], isError };
}

export function createMailflareMcpHandler(env: CloudflareEnv, principal: McpPrincipal, baseUrl: string, authorization: string) {
	return createMcpHandler(() => {
		const server = new McpServer({ name: "mailflare", version: "0.1.0" });
		if (principal.scopes.some((scope) => scope.startsWith("mcp:"))) {
		server.registerTool("list_mailboxes", { description: "List mailboxes allowed for this key", inputSchema: z.object({}) }, async () => {
			if (!principal.scopes.includes("mcp:read")) return output({ error: "Permission denied" }, true);
			const accessible = await listAccessibleMailboxes(getDb(env), principal.user);
			return output(accessible.filter((row) => principal.mailboxIds.includes(row.id)).map(({ id, localPart, hostname, displayName }) => ({ id, address: `${localPart}@${hostname}`, displayName })));
		});
		for (const name of EMAIL_TOOL_NAMES) {
			server.registerTool(name, { description: emailToolDescriptions[name], inputSchema: z.object({ mailboxId: z.string().min(1), ...emailToolSchemas[name].shape }) }, async (args) => {
				if (!principal.scopes.includes(scopeByTool[name]) || !principal.mailboxIds.includes(args.mailboxId)) return output({ error: "Permission denied" }, true);
				try { return output(await runEmailTool({ env, user: principal.user, mailboxId: args.mailboxId, origin: "mcp" }, name, args)); }
				catch (error) { return output({ error: error instanceof Error ? error.message : "Tool failed" }, true); }
			});
		}
		server.registerTool("update_draft", { description: "Update a caller-owned AI draft by revision", inputSchema: z.object({ mailboxId: z.string(), draftId: z.string(), expectedRevision: z.number().int().positive(), to: z.string().email().optional(), subject: z.string().min(1).max(500).optional(), body: z.string().min(1).max(40_000).optional() }) }, async ({ mailboxId, draftId, expectedRevision, to, subject, body }) => {
			if (!principal.scopes.includes("mcp:draft") || !principal.mailboxIds.includes(mailboxId)) return output({ error: "Permission denied" }, true);
			const db = getDb(env);
			const access = await getMailboxAccessLevel(db, principal.user, mailboxId);
			if (!access?.canSendOnBehalf) return output({ error: "Permission denied" }, true);
			const [draft] = await db.select().from(messages).where(and(eq(messages.id, draftId), eq(messages.mailboxId, mailboxId), eq(messages.userId, principal.user.id), eq(messages.status, "draft"))).limit(1);
			const [metadata] = await db.select().from(agentDraftMetadata).where(eq(agentDraftMetadata.draftId, draftId)).limit(1);
			if (!draft || !metadata || metadata.revision !== expectedRevision) return output({ error: "Draft changed or not found" }, true);
			const claimed = await db.update(agentDraftMetadata).set({ revision: expectedRevision + 1 }).where(and(eq(agentDraftMetadata.draftId, draftId), eq(agentDraftMetadata.revision, expectedRevision))).returning({ draftId: agentDraftMetadata.draftId });
			if (!claimed.length) return output({ error: "Draft changed" }, true);
			await db.update(messages).set({ toAddr: to ?? draft.toAddr, subject: subject ?? draft.subject, textBody: body ?? draft.textBody, htmlBody: body ? null : draft.htmlBody, snippet: body ? buildSnippet(body, null) : draft.snippet }).where(eq(messages.id, draftId));
			return output({ draftId, revision: expectedRevision + 1 });
		});
		server.registerTool("request_send", { description: "Request human review of a draft; this never sends", inputSchema: z.object({ mailboxId: z.string(), draftId: z.string(), expectedRevision: z.number().int().positive() }) }, async ({ mailboxId, draftId, expectedRevision }) => {
			if (!principal.scopes.includes("mcp:request-send") || !principal.mailboxIds.includes(mailboxId)) return output({ error: "Permission denied" }, true);
			const [draft] = await getDb(env).select({ mailboxId: messages.mailboxId }).from(messages).where(eq(messages.id, draftId)).limit(1);
			if (draft?.mailboxId !== mailboxId) return output({ error: "Draft not found" }, true);
			try {
				const result = await requestAgentSend(env, principal.user, draftId, expectedRevision, principal.keyId);
				return output({ ...result, reviewUrl: new URL(result.reviewUrl, env.APP_URL || baseUrl).toString() });
			}
			catch (error) { return output({ error: error instanceof Error ? error.message : "Request failed" }, true); }
		});
		server.registerTool("get_send_request", { description: "Read the status of this key's send review request", inputSchema: z.object({ approvalId: z.string() }) }, async ({ approvalId }) => {
			if (!principal.scopes.includes("mcp:request-send")) return output({ error: "Permission denied" }, true);
			const [row] = await getDb(env).select({ keyId: agentSendApprovals.requestKeyId }).from(agentSendApprovals).where(eq(agentSendApprovals.id, approvalId)).limit(1);
			if (row?.keyId !== principal.keyId) return output({ error: "Request not found" }, true);
			try { return output(await getAgentSendRequest(env, principal.user, approvalId)); }
			catch { return output({ error: "Request not found" }, true); }
		});
		}
		registerAdminMcpTools(server, principal, baseUrl, authorization);
		return server;
	}, { responseMode: "json" });
}
