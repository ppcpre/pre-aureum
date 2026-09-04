export interface ChatHistoryRow {
  id: number;
  ts: number;
  role: "user" | "assistant";
  content: string;
}

export async function saveChatMessage(db: D1Database, role: "user" | "assistant", content: string): Promise<void> {
  await db
    .prepare(`INSERT INTO chat_messages (ts, role, content) VALUES (?, ?, ?)`)
    .bind(Math.floor(Date.now() / 1000), role, content)
    .run();
}

/** Ascending order (oldest first) — ready to render top-to-bottom or feed straight back as model context. */
export async function getChatHistory(db: D1Database, limit = 50): Promise<ChatHistoryRow[]> {
  const { results } = await db
    .prepare(`SELECT id, ts, role, content FROM chat_messages ORDER BY id DESC LIMIT ?`)
    .bind(limit)
    .all<ChatHistoryRow>();
  return (results ?? []).reverse();
}

export async function clearChatHistory(db: D1Database): Promise<void> {
  await db.prepare(`DELETE FROM chat_messages`).run();
}
