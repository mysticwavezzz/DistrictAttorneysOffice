"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="paper" role="alert"><h1>We couldn’t load this page</h1><p>Something went wrong. Please try again.</p><button className="govbtn" onClick={() => reset()}>Try again</button></main>;
}
