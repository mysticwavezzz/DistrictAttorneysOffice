type RequestOriginContext = {
  origin: string | null;
  requestUrl: string;
  forwardedHost?: string | null;
  host?: string | null;
  forwardedProto?: string | null;
  configuredSiteUrl?: string | null;
};

function firstHeaderValue(value: string | null | undefined): string | null {
  return value?.split(",", 1)[0]?.trim() || null;
}

export function isAllowedRequestOrigin(context: RequestOriginContext): boolean {
  if (!context.origin) return true;

  let received: URL;
  try {
    received = new URL(context.origin);
  } catch {
    return false;
  }
  if (received.protocol !== "https:" && received.protocol !== "http:") return false;

  if (context.configuredSiteUrl) {
    try {
      if (received.origin === new URL(context.configuredSiteUrl).origin) return true;
    } catch {
      // Ignore a malformed optional site URL and use the request host below.
    }
  }

  let request: URL;
  try {
    request = new URL(context.requestUrl);
  } catch {
    return false;
  }
  const protocol = firstHeaderValue(context.forwardedProto)?.replace(/:$/, "");
  const expectedProtocol = protocol ? `${protocol}:` : request.protocol;
  if (expectedProtocol !== "https:" && expectedProtocol !== "http:") return false;

  const hosts = [context.forwardedHost, context.host, request.host]
    .map(firstHeaderValue)
    .filter((host): host is string => Boolean(host));
  return hosts.some((host) => {
    try {
      return new URL(`${expectedProtocol}//${host}`).host === received.host && received.protocol === expectedProtocol;
    } catch {
      return false;
    }
  });
}
