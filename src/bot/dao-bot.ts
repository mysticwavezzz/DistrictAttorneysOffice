import {
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
  SlashCommandBuilder,
  TextChannel,
  ThreadAutoArchiveDuration,
  ThreadChannel,
} from "discord.js";
import { prisma } from "../lib/prisma";

const TOKEN = process.env.DISCORD_BOT_TOKEN ?? "";
const GUILD_ID = process.env.DISCORD_GUILD_ID ?? "";
const REMINDERS_CHANNEL_ID = process.env.DISCORD_REMINDERS_CHANNEL_ID ?? "";
const SITE_URL = (process.env.NEXTAUTH_URL || process.env.SITE_URL || "https://da-office-website-production.up.railway.app").replace(/\/$/, "");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

// Track 5-minute auto-delete timers for ✅-reacted reminder messages
const deleteTimers = new Map<string, NodeJS.Timeout>();
const CLEAR_DELAY_MS = 5 * 60 * 1000;

async function getOrCreateAttorneyThread(
  channel: TextChannel,
  attorneyName: string
): Promise<ThreadChannel> {
  const recent = await channel.messages.fetch({ limit: 100 });
  let anchor = recent.find(
    (m) =>
      m.author.id === client.user?.id &&
      m.embeds.some((e) => e.title === `${attorneyName} - Case Reminders`)
  );

  if (!anchor) {
    const embed = new EmbedBuilder()
      .setTitle(`${attorneyName} - Case Reminders`)
      .setDescription("Case reminders are in the thread below.\nReact 🟡 if you're working on it, or ✅ when it's done (auto-deletes after 5m).")
      .setColor(0x3b82f6);
    anchor = await channel.send({ embeds: [embed] });
  }

  if (anchor.thread) {
    if (anchor.thread.archived) await anchor.thread.setArchived(false);
    return anchor.thread;
  }

  return anchor.startThread({
    name: `${attorneyName} Reminders`.slice(0, 100),
    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
  });
}

async function postReminderToThread(
  attorneyName: string,
  caseId: string,
  caseNumber: string,
  caseTitle: string,
  reminderTitle: string,
  reason: string,
  color: number,
  courtDocketUrl?: string | null
) {
  const ch = await client.channels.fetch(REMINDERS_CHANNEL_ID);
  if (!ch || !(ch instanceof TextChannel)) return;

  const caseUrl = `${SITE_URL}/portal/cases/${caseId}`;
  const thread = await getOrCreateAttorneyThread(ch, attorneyName);
  const embed = new EmbedBuilder()
    .setTitle(`${reminderTitle}: ${caseNumber}`)
    .setURL(caseUrl)
    .setDescription(reason)
    .addFields(
      { name: "Case", value: `[${caseNumber} - ${caseTitle}](${caseUrl})`, inline: true },
      { name: "Assigned attorney", value: attorneyName, inline: true },
      ...(courtDocketUrl ? [{ name: "Court Docket", value: courtDocketUrl, inline: false }] : [])
    )
    .setColor(color)
    .setFooter({ text: "Harrison County District Attorney's Office" })
    .setTimestamp();

  const msg = await thread.send({ embeds: [embed] });
  await msg.react("🟡");
  await msg.react("✅");
}

async function sweepDueReminders(): Promise<number> {
  const now = new Date();
  const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
  const openCases = await prisma.case.findMany({
    where: { archived: false, isDraft: false, NOT: { stage: { startsWith: "Closed" } } },
    include: { assignedAttorney: { select: { displayName: true } } },
  });

  let sent = 0;
  for (const c of openCases) {
    const atty = c.assignedAttorney?.displayName || "Unassigned";
    if (c.initialFilingDue && c.initialFilingDue < now && c.stage === "Intake") {
      await postReminderToThread(
        atty,
        c.id,
        c.caseNumber,
        c.title,
        "Initial filing overdue",
        "Your initial filing is past the 24-hour window. Get the paperwork submitted to the clerk and mark it filed in the portal.",
        0xc53030,
        c.courtDocketUrl
      );
      sent++;
    } else if (c.discDue && c.discDue < now) {
      await postReminderToThread(
        atty,
        c.id,
        c.caseNumber,
        c.title,
        "Discovery overdue",
        "Discovery is now overdue. Serve defense counsel and log service in the portal.",
        0xc53030,
        c.courtDocketUrl
      );
      sent++;
    } else if (c.updatedAt < fiveDaysAgo) {
      await postReminderToThread(
        atty,
        c.id,
        c.caseNumber,
        c.title,
        "Case needs attention",
        "No docket activity for 5+ days. Check the case status and update the portal.",
        0xd69e2e,
        c.courtDocketUrl
      );
      sent++;
    }
  }
  return sent;
}

client.on("messageReactionAdd", async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => null);
  if (reaction.emoji.name !== "✅") return;
  if (reaction.message.author?.id !== client.user?.id) return;

  const msgId = reaction.message.id;
  if (deleteTimers.has(msgId)) return;

  const timer = setTimeout(async () => {
    deleteTimers.delete(msgId);
    try {
      const fresh = await reaction.message.fetch();
      const check = fresh.reactions.cache.get("✅");
      if (check && check.count > 1) {
        await fresh.delete();
      }
    } catch {
      // Already deleted
    }
  }, CLEAR_DELAY_MS);
  deleteTimers.set(msgId, timer);
});

client.on("messageReactionRemove", async (reaction, user) => {
  if (user.bot || reaction.emoji.name !== "✅") return;
  const timer = deleteTimers.get(reaction.message.id);
  if (timer && (reaction.count ?? 0) <= 1) {
    clearTimeout(timer);
    deleteTimers.delete(reaction.message.id);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "case") {
    const cn = interaction.options.getString("number", true).trim();
    const c = await prisma.case.findUnique({
      where: { caseNumber: cn },
      include: { assignedAttorney: { select: { displayName: true } } },
    });
    if (!c) {
      await interaction.reply({ content: `Case \`${cn}\` not found.`, ephemeral: true });
      return;
    }
    const embed = new EmbedBuilder()
      .setTitle(`${c.caseNumber} | ${c.title}`)
      .addFields(
        { name: "Stage", value: c.stage || "Intake", inline: true },
        { name: "Attorney", value: c.assignedAttorney?.displayName || "Unassigned", inline: true },
        { name: "Court Docket", value: c.courtDocketUrl || "Not linked", inline: false }
      )
      .setColor(0x22c55e);
    await interaction.reply({ embeds: [embed] });
  } else if (interaction.commandName === "reconcile") {
    const flagged = await prisma.case.findMany({
      where: {
        archived: false,
        isDraft: false,
        stage: { in: ["Charges Filed", "Pretrial", "Trial", "Continued"] },
        courtFiledAt: null,
      },
      select: { caseNumber: true, title: true, stage: true },
      take: 15,
    });
    const text = flagged.length
      ? flagged.map((c) => `- **${c.caseNumber}** (${c.stage}) - ${c.title}`).join("\n")
      : "All court-stage cases have `courtFiledAt` recorded.";
    await interaction.reply({ content: text, ephemeral: true });
  } else if (interaction.commandName === "reminders") {
    await interaction.deferReply({ ephemeral: true });
    const count = await sweepDueReminders();
    await interaction.editReply(`Sent ${count} reminder(s).`);
  } else if (interaction.commandName === "clear-reminders") {
    await interaction.deferReply({ ephemeral: true });
    const ch = await client.channels.fetch(REMINDERS_CHANNEL_ID);
    if (!ch || !(ch instanceof TextChannel)) {
      await interaction.editReply("Reminders channel not found.");
      return;
    }
    let deleted = 0;
    while (true) {
      const batch = await ch.messages.fetch({ limit: 100 });
      if (batch.size === 0) break;
      const bulk = await ch.bulkDelete(batch, true).catch(() => null);
      deleted += bulk?.size ?? 0;
      const remaining = batch.filter((m) => !bulk?.has(m.id));
      for (const msg of remaining.values()) {
        await msg.delete().catch(() => null);
        deleted++;
      }
      if (batch.size < 100) break;
    }
    await interaction.editReply(`Cleared ${deleted} message(s) from #reminders.`);
  }
});

client.once("ready", async () => {
  console.log(`DAO Bot logged in as ${client.user?.tag}`);
  const commands = [
    new SlashCommandBuilder()
      .setName("case")
      .setDescription("Look up a DAO portal case")
      .addStringOption((o) => o.setName("number").setDescription("Case number (e.g. DA-2026-0040)").setRequired(true)),
    new SlashCommandBuilder().setName("reconcile").setDescription("List court-stage cases missing courtFiledAt"),
    new SlashCommandBuilder().setName("reminders").setDescription("Sweep due reminders into per-attorney threads"),
    new SlashCommandBuilder().setName("clear-reminders").setDescription("Clear all messages in #reminders for a fresh start"),
  ].map((c) => c.toJSON());

  const rest = new REST({ version: "10" }).setToken(TOKEN);
  if (GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(client.user!.id, GUILD_ID), { body: commands });
  } else {
    await rest.put(Routes.applicationCommands(client.user!.id), { body: commands });
  }

  setInterval(() => {
    void sweepDueReminders().catch((e) => console.error("Auto reminder sweep error:", e));
  }, 6 * 60 * 60 * 1000);
});

const globalForBot = globalThis as typeof globalThis & { __daoBotStarted?: boolean };

export async function startDaoBot() {
  if (globalForBot.__daoBotStarted) return;
  if (!TOKEN || !REMINDERS_CHANNEL_ID) {
    console.warn("DAO Bot skipped: missing DISCORD_BOT_TOKEN or DISCORD_REMINDERS_CHANNEL_ID.");
    return;
  }
  globalForBot.__daoBotStarted = true;
  await client.login(TOKEN);
}

if (require.main === module) {
  void startDaoBot();
}
