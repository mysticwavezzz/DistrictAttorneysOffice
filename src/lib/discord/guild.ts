import { z } from "zod";

const DISCORD_API_BASE = "https://discord.com/api/v10";

const guildMemberSchema = z.object({
  nick: z.string().nullable().optional(),
  roles: z.array(z.string()),
});

export interface DiscordGuildMember {
  nick: string | null;
  roles: string[];
}

export class DiscordApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "DiscordApiError";
    this.status = status;
  }
}

export async function fetchDiscordGuildMember(
  botToken: string,
  guildId: string,
  userId: string
): Promise<DiscordGuildMember | null> {
  const res = await fetch(`${DISCORD_API_BASE}/guilds/${guildId}/members/${userId}`, {
    headers: { Authorization: `Bot ${botToken}` },
    cache: "no-store",
  });

  if (res.status === 404) return null;

  if (!res.ok) {
    throw new DiscordApiError(`Discord guild member lookup returned ${res.status}`, res.status);
  }

  const json = guildMemberSchema.parse(await res.json());
  return { nick: json.nick ?? null, roles: json.roles };
}

export function discordAvatarUrl(profile: {
  id: string;
  avatar: string | null;
  discriminator: string;
}): string {
  if (!profile.avatar) {
    const defaultAvatarNumber =
      profile.discriminator === "0"
        ? Number(BigInt(profile.id) >> BigInt(22)) % 6
        : parseInt(profile.discriminator, 10) % 5;
    return `https://cdn.discordapp.com/embed/avatars/${defaultAvatarNumber}.png`;
  }
  const format = profile.avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${format}`;
}
