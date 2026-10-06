"use client";

import DebugErrorReport from "@/components/debug-error-report";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="paper" role="alert"><h1>We couldn’t load this page</h1><p>Something went wrong. Please try again.</p><button className="govbtn" onClick={() => reset()}>Try again</button> <DebugErrorReport supportReference={error.digest} /></main>;
}
