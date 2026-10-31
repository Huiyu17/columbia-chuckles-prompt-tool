"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="gate"><section className="gate-card stack"><h1>Could not load this page.</h1><p>Please try again. Your saved prompt chains are unchanged.</p><button onClick={reset}>Try again</button></section></main>;
}
