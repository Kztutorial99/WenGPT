import { useEffect, useSyncExternalStore } from "react";
import { bootChatStore, getServerSnapshot, getSnapshot, subscribe } from "./chat-store";
export function useChatStore() {
  useEffect(() => bootChatStore(), []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
