"use client";

import { useEffect, useState } from "react";

type Source = { id: string; label: string; section: string; url: string; checkedOn: string };
type Choice = { id: string; text: string };
type Question = { id: string; competency: string; prompt: string; facts?: string; sourceIds: string[]; choices: Choice[] };
type Result = { correct: number; total: number; percent: number; passed: boolean; criticalErrors: string[]; competencyPercent?: Record<string, number> };
type Lesson = { id: string; title: string; teaching: string[]; sources: Source[] };
type Snapshot = {
  status: "IN_PROGRESS" | "MOCK" | "PLACEMENT_PENDING" | "COMPLETED";
  currentPhase?: number;
  phaseResults?: { phaseId: number; passed: boolean; percent: number }[];
  phase?: { id: number; title: string; lessons: Lesson[]; sources: (Source | undefined)[] };
  case?: { title: string; packet: { heading: string; text: string }[]; sources: (Source | undefined)[]; pleaDisposition?: { accepted: boolean; explanation: string } | null };
  pleaDisposition?: { accepted: boolean; explanation: string } | null;
  question?: Question | null;
  result?: Result | null;
  completedAt?: string | null;
  needsSupervisorReview?: boolean;
  mockFailures?: number;
};
type Submitted = { questionId: string; selectedChoiceId: string; feedback?: string; result: Result | null };

export function LearningCourse() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState<Submitted | null>(null);
  const [lessonIndex, setLessonIndex] = useState(0);
  const [practiceStarted, setPracticeStarted] = useState(false);

  async function load() {
    setError("");
    const response = await fetch("/api/training/progress", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Could not load course progress.");
    setSnapshot(data as Snapshot);
  }

  useEffect(() => { void load().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not load the course.")); }, []);
  useEffect(() => { setLessonIndex(0); setPracticeStarted(false); }, [snapshot?.currentPhase]);

  async function post(body: Record<string, unknown>) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/training/answer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save this response.");
      if (data.snapshot) { setSnapshot(data.snapshot as Snapshot); setSubmitted(data.submitted ?? null); }
      else { setSnapshot(data as Snapshot); setSubmitted(null); }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save this response."); }
    finally { setBusy(false); }
  }

  if (error && !snapshot) return <section className="training-page"><h1>Learning Course</h1><p role="alert" className="training-error">{error}</p><button className="govbtn-outline" onClick={() => void load().catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not load the course."))}>Retry</button></section>;
  if (!snapshot) return <section className="training-page" aria-busy="true"><h1>Learning Course</h1><p>Loading your saved progress…</p></section>;
  if (snapshot.status === "COMPLETED") return <section className="training-page"><p className="eyebrow">Criminal Division</p><h1>Course complete</h1><div className="training-callout"><strong>You passed the final mock trial.</strong>{snapshot.result && <p>Score: {snapshot.result.correct}/{snapshot.result.total} ({snapshot.result.percent}%).</p>}{snapshot.pleaDisposition && <p>{snapshot.pleaDisposition.explanation}</p>}<p>Your group placement is recorded. Complete the attorney orientation acknowledgment before staff access opens.</p></div><a className="govbtn" href="/dashboard/orientation">Continue to attorney orientation</a></section>;
  if (snapshot.status === "PLACEMENT_PENDING") return <section className="training-page"><p className="eyebrow">Criminal Division · Attorney onboarding</p><h1>Mock trial passed</h1><div className="training-callout"><strong>Your result is saved. Group placement is waiting for a supervisor.</strong>{snapshot.result && <p>Score: {snapshot.result.correct}/{snapshot.result.total} ({snapshot.result.percent}%).</p>}{snapshot.pleaDisposition && <p>{snapshot.pleaDisposition.explanation}</p>}<p>No active supervisor was available in either group when you passed. You remain in the learning area until a supervisor records a staffed group placement, then you will complete orientation.</p>{snapshot.needsSupervisorReview && <p>A supervisor review is also flagged after two unsuccessful full mock trials.</p>}</div><p>Failed mock trials: {snapshot.mockFailures ?? 0}</p></section>;

  const question = snapshot.question;
  const phaseResult = snapshot.status === "IN_PROGRESS" ? snapshot.result : null;
  const mockResult = snapshot.status === "MOCK" ? snapshot.result : null;
  const shownSources = snapshot.status === "MOCK" ? snapshot.case?.sources : snapshot.phase?.sources;
  const lesson = snapshot.status === "IN_PROGRESS" ? snapshot.phase?.lessons[lessonIndex] : undefined;
  const mockStep = snapshot.status === "MOCK" && question
    ? question.competency === "charging" ? "Choose a filing"
      : question.id.includes("defense-response") || question.id.includes("02-") ? "Defense responds"
        : question.id.includes("plea-offer") ? "Plea decision"
          : "Continue the case"
    : null;

  return <div className="training-page">
    <p className="eyebrow">Criminal Division · Attorney onboarding</p>
    <h1>{snapshot.status === "MOCK" ? "Final Mock Trial" : snapshot.phase?.title ?? "Learning Course"}</h1>
    <p className="lede">{snapshot.status === "MOCK" ? "Read the file, choose one of four proposed court filings, and respond to the defense's argument. Your path changes with your choice. At the final pretrial conference, decide whether the evidence supports an authorized plea offer." : "Work through the lessons before answering the practice decisions. Each answer includes an explanation, and your progress saves as you go. The final mock case comes after all three phases."}</p>
    <div className="training-progress" aria-label="Course progress">
      {[1, 2, 3].map((id) => { const passed = snapshot.phaseResults?.some((item) => item.phaseId === id && item.passed); const current = snapshot.status === "IN_PROGRESS" && snapshot.currentPhase === id; return <div key={id} className={passed ? "is-passed" : current ? "is-current" : ""}><span>Phase {id}</span><strong>{passed ? "Passed" : current ? "In progress" : "Locked"}</strong></div>; })}
      <div className={snapshot.status === "MOCK" ? "is-current" : ""}><span>Final</span><strong>{snapshot.status === "MOCK" ? "Mock trial" : "Mock trial"}</strong></div>
    </div>

    {snapshot.status === "IN_PROGRESS" && snapshot.phase && !practiceStarted && lesson && <section className="training-card"><div className="training-lesson-heading"><div><p className="eyebrow">Lesson {lessonIndex + 1} of {snapshot.phase.lessons.length}</p><h2>{lesson.title}</h2></div><span className="training-step-count">Phase {snapshot.phase.id}</span></div>{lesson.teaching.map((line, index) => <p className="training-teaching" key={index}>{line}</p>)}<SourceLinks sources={lesson.sources} /><div className="training-lesson-controls"><button className="govbtn-outline" type="button" disabled={lessonIndex === 0} onClick={() => setLessonIndex((index) => Math.max(0, index - 1))}>Previous lesson</button>{lessonIndex < snapshot.phase.lessons.length - 1 ? <button className="govbtn" type="button" onClick={() => setLessonIndex((index) => index + 1)}>Next lesson</button> : <button className="govbtn" type="button" onClick={() => setPracticeStarted(true)}>Start phase practice</button>}</div></section>}

    {snapshot.status === "IN_PROGRESS" && snapshot.phase && practiceStarted && <section className="training-card training-practice-intro"><p className="eyebrow">Phase {snapshot.phase.id} · Practice</p><h2>Use the lesson on a case decision</h2><p>Choose the best answer from the record and the cited source. You will see why it is right or wrong, then move to the next decision.</p><button className="govbtn-outline" type="button" onClick={() => setPracticeStarted(false)}>Review lessons</button></section>}

    {snapshot.status === "MOCK" && snapshot.case && <section className="training-card"><h2>{snapshot.case.title}</h2><p className="training-fiction-label">Fictional training matter · Not a real case</p><div className="mock-trial-roadmap"><span>1. Review the file</span><span>2. Choose one of four filings</span><span>3. Respond to the defense</span><span>4. Decide on a plea</span></div><p>Read the CID statement, investigative report, evidence list, and status first. Then choose the court filing you would submit. The defense’s next argument changes to match your choice.</p>{snapshot.case.packet.map((section, index) => <article className="training-lesson" key={`${section.heading}-${index}`}><h3>{section.heading}</h3><p>{section.text}</p></article>)}<SourceLinks sources={snapshot.case.sources} /></section>}

    {question && (snapshot.status === "MOCK" || practiceStarted) && <section className="training-question" aria-labelledby="training-question-title"><p className="eyebrow">{snapshot.status === "MOCK" ? `Mock trial · ${mockStep}` : `Phase ${snapshot.currentPhase} practice`} · {question.competency}</p><h2 id="training-question-title">{question.prompt}</h2>{question.facts && <p>{question.facts}</p>}{snapshot.status === "MOCK" && question.competency === "charging" && <p className="mock-choice-hint">Compare the charge and facts in each proposed document with the packet. The options include a supported filing, a charging defect, and a filing that does not start a criminal case.</p>}<ol className="training-choices">{question.choices.map((choice, index) => <li key={choice.id}><button disabled={busy} className="training-choice" onClick={() => { setSubmitted(null); void post(snapshot.status === "MOCK" ? { questionId: question.id, choiceId: choice.id } : { phaseId: snapshot.currentPhase, questionId: question.id, choiceId: choice.id }); }}><span>{String.fromCharCode(65 + index)}</span>{choice.text}</button></li>)}</ol><SourceLinks sources={shownSources} /></section>}

    {submitted && <aside className="training-feedback" aria-live="polite"><strong>Response recorded</strong>{submitted.feedback && <p>{submitted.feedback}</p>}{submitted.result && <p className={submitted.result.passed ? "training-pass" : "training-fail"}>{submitted.result.passed ? "Phase passed." : "Phase not passed."} Score: {submitted.result.correct}/{submitted.result.total} ({submitted.result.percent}%). {submitted.result.criticalErrors.length ? "A critical issue must be corrected." : ""}</p>}</aside>}
    {phaseResult && <section className="training-feedback"><h2>{phaseResult.passed ? "Phase complete" : "Review and retry"}</h2><p className={phaseResult.passed ? "training-pass" : "training-fail"}>{phaseResult.passed ? "You passed this phase." : "You did not meet the passing standard yet."} Score: {phaseResult.correct}/{phaseResult.total} ({phaseResult.percent}%).</p>{!phaseResult.passed && <button disabled={busy} className="govbtn" onClick={() => void post({ action: "retry-phase" })}>Retry this phase</button>}</section>}
    {mockResult && <section className="training-feedback"><h2>{mockResult.passed ? "Mock trial passed" : "Mock trial result"}</h2><p className={mockResult.passed ? "training-pass" : "training-fail"}>{mockResult.passed ? "You passed the final assessment." : "The passing standard was not met."} Score: {mockResult.correct}/{mockResult.total} ({mockResult.percent}%).</p>{mockResult.passed && snapshot.case?.pleaDisposition && <p className="training-callout">{snapshot.case.pleaDisposition.explanation}</p>}{mockResult.competencyPercent && <ul>{Object.entries(mockResult.competencyPercent).map(([competency, percent]) => <li key={competency}>{competency}: {percent}%</li>)}</ul>}{snapshot.needsSupervisorReview && <p>A supervisor review has been flagged after two unsuccessful full mock trials. You may still review the lessons and try again.</p>}{!mockResult.passed && <button disabled={busy} className="govbtn" onClick={() => void post({ action: "retry-mock" })}>Retry final mock trial</button>}</section>}
    {error && <p role="alert" className="training-error">{error}</p>}
    {busy && <p role="status">Saving…</p>}
  </div>;
}

function SourceLinks({ sources }: { sources?: (Source | undefined)[] }) {
  const unique = [...new Map((sources ?? []).filter((source): source is Source => Boolean(source)).map((source) => [source.id, source])).values()];
  if (!unique.length) return null;
  return <details className="training-sources"><summary>Sources</summary><ul>{unique.map((source) => <li key={source.id}><a href={source.url} target="_blank" rel="noreferrer">{source.label}, {source.section}</a> <small>checked {source.checkedOn}</small></li>)}</ul></details>;
}
