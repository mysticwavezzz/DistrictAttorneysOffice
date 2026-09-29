import { siteConfig } from "@/config/site";
import Link from "next/link";

export function TipsSection() {
  return (
    <section id="tips">
      <h2>Official Criminal Tip Line</h2>
      <p className="lede">
        If you have information about criminal activity in {siteConfig.county}, please share it
        with our office.
      </p>
      <div className="header-band">
        This is not an emergency line. If you or someone else is in immediate danger, call 911
        or your local emergency number right away.
      </div>

      <p>Have information to share with investigators? Use the dedicated report form to provide incident and suspect details, evidence, and required acknowledgments.</p>
      <Link href="/report-crime" className="govbtn">Report a Crime</Link>
    </section>
  );
}
