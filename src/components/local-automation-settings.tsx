"use client";

import { useState, useTransition } from "react";
import { createLocalAutomationToken, revokeLocalAutomationToken } from "@/app/settings/local-automation-actions";

type ActiveToken = {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
};

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export function LocalAutomationSettings({ activeToken, canCreate }: { activeToken: ActiveToken | null; canCreate: boolean }) {
  const [certificatePem, setCertificatePem] = useState("");
  const [name, setName] = useState("My Windows PC");
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function createToken(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    startTransition(async () => {
      try {
        const result = await createLocalAutomationToken({ name, certificatePem });
        setIssuedToken(result.token);
        setCertificatePem("");
        setMessage(`Credential created. It expires ${dateTime.format(new Date(result.expiresAt))}.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Credential could not be created.");
      }
    });
  }

  function revokeToken(tokenId: string) {
    setMessage("");
    startTransition(async () => {
      try {
        const result = await revokeLocalAutomationToken(tokenId);
        if (result.revoked) {
          setIssuedToken(null);
          setMessage("Local automation credential revoked.");
          window.location.reload();
        } else {
          setMessage("That credential was already revoked.");
        }
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Credential could not be revoked.");
      }
    });
  }

  async function copyToken() {
    if (!issuedToken) return;
    try {
      await navigator.clipboard.writeText(issuedToken);
      setMessage("Credential copied. Save it in the local script now; it will not be shown again.");
    } catch {
      setMessage("Clipboard access failed. Select and copy the credential below, then save it in the local script.");
    }
  }

  return <section className="formbox" aria-labelledby="local-automation-heading">
    <h2 id="local-automation-heading" style={{ marginTop: 0 }}>Local case operations</h2>
    <p>Use the PowerShell tool in <code>scripts/dao-caseops.ps1</code> to list accessible cases and attorneys or reassign a case. Each request checks your current Roblox group access. Reassignment is written to the case history.</p>
    <ol>
      <li>Run <code>pwsh -File .\scripts\dao-caseops.ps1 setup</code> on this Windows computer. It creates a non-exportable signing key in your Windows user certificate store and copies the public certificate.</li>
      <li>Paste that public certificate into the form below and create the credential.</li>
      <li>Run <code>pwsh -File .\scripts\dao-caseops.ps1 save-token</code> and paste the one-time credential at its secure prompt.</li>
    </ol>
    {activeToken && <div className="message">
      <strong>{activeToken.name}</strong> · {activeToken.tokenPrefix}… · expires {dateTime.format(new Date(activeToken.expiresAt))}
      <p className="note-inline">Created {dateTime.format(new Date(activeToken.createdAt))}. Last used {activeToken.lastUsedAt ? dateTime.format(new Date(activeToken.lastUsedAt)) : "Never"}.</p>
      <button className="govbtn-outline" type="button" disabled={pending} onClick={() => revokeToken(activeToken.id)}>Revoke this computer credential</button>
    </div>}
    {!activeToken && !issuedToken && canCreate && <form className="formbox" onSubmit={createToken}>
      <div className="field"><label htmlFor="automation-name">Computer name</label><input id="automation-name" maxLength={60} value={name} onChange={(event) => setName(event.target.value)} required /></div>
      <div className="field"><label htmlFor="automation-certificate">Public certificate from setup</label><textarea id="automation-certificate" rows={8} value={certificatePem} onChange={(event) => setCertificatePem(event.target.value)} required autoComplete="off" spellCheck={false} /></div>
      <button className="govbtn" type="submit" disabled={pending}>{pending ? "Creating…" : "Create local credential"}</button>
    </form>}
    {!activeToken && !canCreate && !issuedToken && <p className="message">Your current role cannot issue a local case operations credential. You can still revoke an existing one above.</p>}
    {issuedToken && <div className="message message-success" role="status">
      <strong>Copy this credential once, then save it with the local script.</strong>
      <p><code className="mono" style={{ overflowWrap: "anywhere" }}>{issuedToken}</code></p>
      <button className="govbtn-outline" type="button" onClick={copyToken}>Copy credential</button>
    </div>}
    {message && <p className="message" role="status">{message}</p>}
  </section>;
}
