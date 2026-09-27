"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { authFetch } from "@/lib/auth/client";
import { readInitialAssistantPanelState, saveAssistantPanelState } from "./dashboard-state-utils";

const emailPath = /^\/(?:inbox|sent|archived|spam|trash|starred|snoozed|drafts)\/[^/]+$|^\/folders\/[^/]+\/[^/]+$/;

export function useDashboardState() {
	const pathname = usePathname();
	const router = useRouter();
	const [assistantOpen, setAssistantOpen] = useState(false);
	const [assistantFullSize, setAssistantFullSize] = useState(false);
	const [panelRestored, setPanelRestored] = useState(false);
	const [storagePrefix, setStoragePrefix] = useState<string | null>(null);

	useLayoutEffect(() => {
		const saved = readInitialAssistantPanelState();
		setAssistantOpen(saved.open);
		setAssistantFullSize(saved.fullSize);
		setPanelRestored(true);
	}, []);

	useEffect(() => {
		let cancelled = false;
		void authFetch("/api/auth/me", { redirectOnUnauthorized: false }).then(async (response) => {
			if (!response.ok) return;
			const data = await response.json() as { user?: { id?: string } };
			if (cancelled || !data.user?.id) return;
			const prefix = `mailflare-dashboard:${data.user.id}`;
			try {
				const savedOpen = localStorage.getItem(`${prefix}:assistant-open`);
				const savedFullSize = localStorage.getItem(`${prefix}:assistant-full-size`);
				const initial = readInitialAssistantPanelState();
				setAssistantOpen(savedOpen === null ? initial.open : savedOpen === "true");
				setAssistantFullSize(savedFullSize === null ? initial.fullSize : savedFullSize === "true");
				if (window.location.pathname === "/inbox") {
					const savedEmail = localStorage.getItem(`${prefix}:current-email`);
					if (savedEmail && emailPath.test(savedEmail)) router.replace(savedEmail);
				}
			} catch { /* Storage is optional. */ }
			setStoragePrefix(prefix);
		}).catch(() => undefined);
		return () => { cancelled = true; };
	}, []);

	useEffect(() => {
		if (!panelRestored) return;
		saveAssistantPanelState(assistantOpen, assistantFullSize, storagePrefix);
	}, [panelRestored, storagePrefix, assistantOpen, assistantFullSize]);

	useEffect(() => {
		if (!storagePrefix || !emailPath.test(pathname)) return;
		try { localStorage.setItem(`${storagePrefix}:current-email`, pathname); }
		catch { /* Storage is optional. */ }
	}, [storagePrefix, pathname]);

	return { assistantOpen, setAssistantOpen, assistantFullSize, setAssistantFullSize };
}
