import { env } from "@/lib/env";

const DISCORD_API_BASE = "https://discord.com/api/v10";

export async function sendDirectMessage(discordUserId: string, content: string): Promise<void> {
  const channelRes = await fetch(`${DISCORD_API_BASE}/users/@me/channels`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ recipient_id: discordUserId }),
  });

  if (!channelRes.ok) {
    throw new Error(`Failed to open DM channel: ${channelRes.status}`);
  }

  const channel = (await channelRes.json()) as { id: string };

  const messageRes = await fetch(`${DISCORD_API_BASE}/channels/${channel.id}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: content.slice(0, 2000) }),
  });

  if (!messageRes.ok) {
    throw new Error(`Failed to send DM: ${messageRes.status}`);
  }
}
