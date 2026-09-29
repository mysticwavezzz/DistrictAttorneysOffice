import { siteConfig } from "@/config/site";

export function TipsSection() {
  return (
    <section id="tips">
      <h2>Submit a Criminal Tip</h2>
      <p className="lede">
        If you have information about criminal activity in {siteConfig.county}, please share it
        with our office.
      </p>
      <div className="header-band">
        This is not an emergency line. If you or someone else is in immediate danger, call 911
        or your local emergency number right away.
      </div>

      <div className="message">
        The online tip line is temporarily unavailable while we update it. Please contact the
        office directly in the meantime.
      </div>
    </section>
  );
}
