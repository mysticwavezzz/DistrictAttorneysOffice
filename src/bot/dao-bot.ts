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

if (!TOKEN || !REMINDERS_CHANNEL_ID) {
  console.error("Missing DISCORD_BOT_TOKEN or DISCORD_REMINDERS_CHANNEL_ID.");
  process.exit(1);
}

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
      m.embeds.some((e) => e.title === `📋 ${attorneyName} — Case Reminders`)
  );

  if (!anchor) {
    const embed = new EmbedBuilder()
      .setTitle(`📋 ${attorneyName} — Case Reminders`)
      .setDescription("Active case reminders are posted in the thread below.\nReact **🟡** while working on it, or **✅** to clear (auto-deletes after 5 min).")
      .setColor(0x3b82f6);
    anchor = await channel.send({ embeds: [embed] });
  }

  if (anchor.thread) {
    if (anchor.thread.archived) await anchor.thread.setArchived(false);
    return anchor.thread;
  }

  return anchor.startThread({
    name: `Reminders — ${attorneyName}`.slice(0, 100),
    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
  });
}

async function postReminderToThread(
  attorneyName: string,
  caseNumber: string,
  title: string,
  reason: string
) {
  const ch = await client.channels.fetch(REMINDERS_CHANNEL_ID);
  if (!ch || !(ch instanceof TextChannel)) return;

  const thread = await getOrCreateAttorneyThread(ch, attorneyName);
  const embed = new EmbedBuilder()
    .setTitle(`⏰ ${caseNumber} — ${title}`)
    .setDescription(reason)
    .setColor(0xf59e0b)
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
      await postReminderToThread(atty, c.caseNumber, c.title, "Initial filing is **overdue**.");
      sent++;
    } else if (c.discDue && c.discDue < now) {
      await postReminderToThread(atty, c.caseNumber, c.title, "Discovery deadline is **overdue**.");
      sent++;
    } else if (c.updatedAt < fiveDaysAgo) {
      await postReminderToThread(atty, c.caseNumber, c.title, "No docket activity for **5+ days**.");
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
      ? flagged.map((c) => `• **${c.caseNumber}** (${c.stage}) — ${c.title}`).join("\n")
      : "All court-stage cases have `courtFiledAt` recorded.";
    await interaction.reply({ content: text, ephemeral: true });
  } else if (interaction.commandName === "reminders") {
    await interaction.deferReply({ ephemeral: true });
    const count = await sweepDueReminders();
    await interaction.editReply(`Dispatched **${count}** reminder(s) to per-attorney threads.`);
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

void client.login(TOKEN);
