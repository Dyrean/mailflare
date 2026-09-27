export interface NewMessageNotification {
	from: string;
	fromName: string | null;
	mailboxId: string;
	messageId: string;
	subject: string | null;
	type: "new_message";
}

export interface AgentDraftNotification {
	mailboxId: string;
	draftId: string;
	type: "agent_draft";
}

export interface RealtimeNotificationRequest {
	userIds: string[];
	payload: NewMessageNotification | AgentDraftNotification;
}
