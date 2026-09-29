import Link from "next/link";

export function TipsSection() {
  return (
    <section id="tips">
      <h2>Official Criminal Tip Line</h2>
      <p>Have information to share with investigators? Use the dedicated report form to provide incident and suspect details, evidence, and required acknowledgments.</p>
      <Link href="/report-crime" className="govbtn">Report a Crime</Link>
    </section>
  );
}
