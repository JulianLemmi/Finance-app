import { supabase } from "./storage.js";

export async function sendTelegramNotification(chatId: string, message: string): Promise<boolean> {
  if (!supabase || !chatId?.trim()) return false;
  try {
    const { error } = await supabase.functions.invoke("telegram-bot", {
      body: { action: "notify", chatId: String(chatId).trim(), message },
    });
    return !error;
  } catch {
    return false;
  }
}
