"use client";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main id="main" className="paper" role="alert"><h1>Staff portal temporarily unavailable</h1><p>Your work has not been changed. Retry the page, or return to the dashboard.</p><button className="govbtn" onClick={() => reset()}>Try again</button></main>;
}
