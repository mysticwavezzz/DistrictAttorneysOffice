"use client";

import DebugErrorReport from "@/components/debug-error-report";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main id="main" className="paper" role="alert"><h1>We couldn’t load this staff page</h1><p>If you just submitted a change, check the record before retrying. Otherwise, retry the page or return to the dashboard.</p>{error.digest && <p className="note-inline">Support reference: <code>{error.digest}</code></p>}<button className="govbtn" onClick={() => reset()}>Retry page</button> <DebugErrorReport supportReference={error.digest} /></main>;
}
