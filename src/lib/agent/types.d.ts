import type { SessionUser } from "@/lib/auth/types";

export type EmailToolName = "list_emails" | "get_email" | "get_thread" | "search_emails" | "draft_email" | "draft_reply" | "mark_email_read" | "move_email" | "move_emails" | "discard_draft";

export type AgentToolContext = {
	env: CloudflareEnv;
	user: SessionUser;
	mailboxId: string;
	origin: "chat" | "auto" | "mcp";
};
