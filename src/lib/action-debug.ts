import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

type ActionOutcome = "SUCCESS" | "REDIRECTED" | "FAILED";

function createActionId(): string {
  return `ACT-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().toUpperCase()}`;
}

function safeTargetReference(actionName: string, args: unknown[]): string | null {
  const targetFields = ["caseId", "ticketId", "requestId", "aopcId", "filingId", "recordId", "announcementId", "notificationId"];
  for (const arg of args) {
    if (arg instanceof FormData) {
      for (const key of targetFields) {
        const value = arg.get(key);
        if (typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value)) return `${key}:${value}`;
      }
    }
  }
  const lowerName = actionName.toLowerCase();
  if (/(ticket|case|filing|request|aopc|announcement|notification)/.test(lowerName)) {
    const candidate = args.find((arg): arg is string => typeof arg === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(arg));
    if (candidate) return candidate;
  }
  return null;
}

function isNextRedirect(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "digest" in error && typeof error.digest === "string" && error.digest.startsWith("NEXT_REDIRECT"));
}

function errorFrames(error: unknown): { name: string | null; stack: string | null } {
  if (!(error instanceof Error)) return { name: null, stack: null };
  // Exclude the first stack line because it repeats Error.message, which may
  // contain user-provided text. Keep only server frames useful for debugging.
  const frames = error.stack?.split("\n").slice(1, 21).join("\n").slice(0, 8_000) ?? null;
  return { name: error.name.slice(0, 100), stack: frames };
}

/** Wraps one user-triggered server action. Payload values are never persisted. */
export async function runWithActionDebug<T>(
  actionName: string,
  args: unknown[],
  operation: (actionId: string) => Promise<T>
): Promise<T> {
  const actionId = createActionId();
  const startedAt = new Date();
  let durationMs = 0;
  let outcome: ActionOutcome = "SUCCESS";
  let errorName: string | null = null;
  let errorStack: string | null = null;
  let requestMethod: string | null = null;
  let requestPath: string | null = null;
  let actor: { id: string | null; name: string | null; provider: string | null; tiers: string } = {
    id: null, name: null, provider: null, tiers: "[]",
  };

  try {
    const request = args.find((arg): arg is Request => arg instanceof Request);
    if (request) {
      requestMethod = request.method;
      requestPath = new URL(request.url).pathname.slice(0, 500);
    } else {
      const incoming = await headers();
      const referer = incoming.get("referer");
      if (referer) requestPath = new URL(referer).pathname.slice(0, 500);
      requestMethod = "SERVER_ACTION";
    }
  } catch {
    // Some non-request invocations (for example tests) have no request context.
  }

  try {
    const session = await auth();
    actor = {
      id: session?.user?.providerUserId ?? null,
      name: session?.user?.username ?? null,
      provider: session?.user?.identityProvider ?? null,
      tiers: JSON.stringify(session?.user?.tiers ?? []),
    };
  } catch {
    // Preserve action behavior if session inspection itself is unavailable.
  }

  try {
    const result = await operation(actionId);
    if (result instanceof Response && result.status >= 400) {
      outcome = "FAILED";
      errorName = `HTTP_${result.status}`;
    }
    return result;
  } catch (error) {
    if (isNextRedirect(error)) outcome = "REDIRECTED";
    else {
      outcome = "FAILED";
      ({ name: errorName, stack: errorStack } = errorFrames(error));
    }
    throw error;
  } finally {
    durationMs = Math.max(0, Date.now() - startedAt.getTime());
    try {
      await prisma.actionDebugLog.create({
        data: {
          actionId,
          actionName: actionName.slice(0, 160),
          actorId: actor.id,
          actorName: actor.name?.slice(0, 120) ?? null,
          identityProvider: actor.provider,
          requestMethod,
          requestPath,
          permissionTiers: actor.tiers,
          outcome,
          startedAt,
          durationMs,
          targetReference: safeTargetReference(actionName, args),
          errorName,
          errorStack,
        },
      });
      if (Math.random() < 0.001) {
        await prisma.actionDebugLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } } });
      }
    } catch (logError) {
      console.error(`[${actionId}] Failed to persist action diagnostics`, logError);
    }
  }
}
