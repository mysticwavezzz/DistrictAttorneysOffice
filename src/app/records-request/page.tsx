import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Sidebar } from "@/components/sidebar";
import { submitRecordsRequest } from "./actions";

export default async function RecordsRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const query = await searchParams;
  return (
    <div className="wrap">
      <a href="#main" className="skiplink">
        Skip to main content
      </a>

      <SiteHeader />

      <div className="body">
        <Sidebar />

        <main className="paper" id="main">
          <p className="eyebrow">Office Records</p>
          <h1>Public Records Request</h1>
          <p className="lede">
            Use this form to request copies of public records held by the office. Certain
            records may be sealed or exempt from disclosure.
          </p>

          {query.sent ? (
            <div className="message message-success">
              Your request has been submitted. The office will follow up using the contact
              information you provided.
            </div>
          ) : (
            <>
              {query.error && (
                <div className="message message-error" role="alert" aria-live="assertive">
                  {query.error === "rate-limited" ? "Too many requests were sent from this connection. Please wait an hour before submitting another request." : "Please fill in all fields and try again."}
                </div>
              )}
              <form action={submitRecordsRequest} className="formbox">
                <div className="field">
                  <label htmlFor="name">Name</label>
                  <input type="text" id="name" name="name" required maxLength={100} />
                </div>
                <div className="field">
                  <label htmlFor="contact">
                    Contact Info <span className="hint">(email or Discord username)</span>
                  </label>
                  <input type="text" id="contact" name="contact" required maxLength={200} />
                </div>
                <div className="field">
                  <label htmlFor="details">What records are you requesting?</label>
                  <textarea id="details" name="details" required rows={5} maxLength={2000} />
                </div>
                <button type="submit" className="govbtn">
                  Submit Request
                </button>
              </form>
            </>
          )}
        </main>
      </div>

      <SiteFooter />
    </div>
  );
}
