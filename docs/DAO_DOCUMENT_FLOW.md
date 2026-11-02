# DAO document flow

The dao-document-flow.ps1 script handles the repetitive steps after a filing has been drafted in its correct DAO template and reviewed. It converts the final DOCX to a native Google Doc, exports the Doc to PDF, checks the PDF, uploads both files to Drive, verifies that the PDF is **Anyone with the link — Viewer**, and saves a local manifest. The source DOCX is not changed. The Google Doc stays private unless the ShareGoogleDoc option is supplied.

If requested, the script also submits the PDF to an active case through the signed local-automation API. That filing enters the DAO Review Inbox as **Pending**. The script never approves a filing and never files it with the court.

## One-time Google Drive setup

1. In a Google Cloud project, enable the Google Drive API and configure the OAuth consent screen for your account.
2. Create an OAuth client of type **Desktop app**, download its client JSON, and keep that file private.
3. Run PowerShell 7 from this repository:

   ```powershell
   pwsh -File .\scripts\dao-document-flow.ps1 setup-google -ClientJsonPath "C:\path\to\oauth-client.json"
   ```

4. Complete Google sign-in in the browser opened on this computer. The refresh credential is stored with Windows DPAPI under %LOCALAPPDATA%\DistrictAttorneyDocumentFlow. It is tied to this Windows account and does not read or use any other local token file.

Google OAuth apps left in **Testing** may issue refresh tokens that expire after seven days when using Drive scopes. If that happens, run setup-google again. Use Google's consent-screen status and verification requirements for a longer-lived account connection.

## One-time DAO portal setup

If you have not already configured local case operations, follow **One-time setup** in LOCAL_CASEOPS.md. The website must have the local automation credential registered to the authorized owner account. The filing-upload API route also needs to be deployed before SubmitToPortal can work against the production site.

## Publish a document

Use a finalized DOCX based on the proper filing template. The script does not draft legal content or choose a template.

```powershell
pwsh -File .\scripts\dao-document-flow.ps1 publish -DocxPath "C:\path\to\final-response.docx" -CaseNumber HCR-26-0001 -Title "People's Response to Defendant's Motion"
```

The script asks for confirmation before making Drive or local output changes. It creates the native Google Doc and PDF in Drive, saves the PDF and manifest.json under DAO Document Flow Output\<case number>-<timestamp>, and prints links only after verifying their Drive metadata and the PDF viewer permission. Repeating the same case, title, and source file reuses its Drive files instead of creating duplicates.

Useful options:

```powershell
# Put both files in a specific Drive folder
-DriveFolderId "GOOGLE_DRIVE_FOLDER_ID"

# Also make the Google Doc viewable by anyone with its link
-ShareGoogleDoc

# Submit the PDF to the live DAO case after creating and verifying Drive files
-SubmitToPortal

# Use a local DAO development server and its separate local automation credential
-SubmitToPortal -Local
```

By default, only the PDF is link-shareable. Do not use ShareGoogleDoc for a document that should remain private. If Google Workspace policy blocks public link access, the script stops and does not report the PDF as shareable. Check the exported PDF visually before court filing because Word-to-Docs conversion can change page layout.

## Output and limits

- Google Doc: native editable document, private by default.
- PDF: Drive file with an independently verified anyone: reader permission and discovery disabled.
- Local output: exported PDF and a JSON manifest with the source hash, Drive IDs/links, permission status, and optional portal status.
- The DAO portal accepts PDFs up to 5 MB. The script checks size, PDF header, encryption, and end marker before upload.
- Google API credentials are stored per Windows user. Do not copy the DPAPI credential file to another computer or Windows account.
