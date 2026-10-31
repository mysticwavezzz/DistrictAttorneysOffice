# Criminal Division attorney training

The training system has three instructional phases followed by a branching mock bench trial. The course bank contains 30 phase questions and 24 fictional trial packets with 400 authored decision points. The final mock case is randomly assigned when Phase 3 is passed. Each case uses the form structure of a CID probable-cause statement; it does not use real case evidence or real people.

## Site flow

- A roster manager with authority checks **Prosecutor-in-Training** on a linked, active Criminal Division attorney profile.
- The active flag overrides every other role and developer-profile permission. The trainee gets one staff navigation tab, **Learning Course**. Other page access is redirected; server routes also check the roster flag and session identity.
- Phase and mock answers are accepted and graded server-side. Only the next question and its choice text are sent to the browser. The grading key and explanations stay in server modules.
- Progress is saved in `TrainingAttempt`; a trainee can resume after signing out. A failed phase or mock may be retried.
- Passing all phases unlocks the mock trial. A passing mock clears the roster flag and assigns the trainee to the less populated Criminal Division group. They can then read the orientation at `/dashboard/orientation`.

## Local checks

```powershell
npx tsx scripts/training-pilot.ts --validate
npx tsx scripts/training-pilot.ts
npm run typecheck
```

`npx prisma generate` refreshes the client after schema edits. The app's normal startup runs `prisma db push`; do not point a local smoke run at production data. Before deployment, recheck the cited Chesapeake procedure rules, Harrison statutes, attorney rank names, access restrictions, and group assignment policy. The course is fictional training material, not legal advice for a real case.
