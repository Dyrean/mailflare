"use client";

import { createContext, useContext } from "react";
import type { MessageListVisibility } from "./types";

export const MessageListVisibilityContext = createContext<MessageListVisibility>({ visible: true, toggle: () => undefined });

export function useMessageListVisibility() {
	return useContext(MessageListVisibilityContext);
}
