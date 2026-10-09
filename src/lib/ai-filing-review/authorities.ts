import { createHash } from "node:crypto";

/** Curated rule excerpts transcribed from the local Rules_of_Procedure_Master.txt. */
export const FILING_REVIEW_AUTHORITIES = [
  {
    id: "CRIM_2_1_1",
    citation: "Ches. R. Crim. P. Rule 2.1(1)",
    title: "Prosecution by Information",
    text: "A prosecution may be commenced by filing an information. An information is a plain, concise, and definite written statement of the essential facts constituting the offense charged and must be signed and presented by an attorney for the government. Each count of an information must state the official or customary citation of the statute, rule, regulation, or other provision of law that the defendant allegedly violated. Unless the defendant was misled, the error in a citation is not a ground to dismiss the information.",
  },
  {
    id: "CRIM_2_1_2_3",
    citation: "Ches. R. Crim. P. Rule 2.1(2)-(3)",
    title: "Probable-Cause Statement and Determination",
    text: "An information must be accompanied by a written statement of the facts establishing probable cause to believe that the charged offense has been committed and that the defendant committed it. The statement must be made under oath before a judicial officer or signed under penalty of perjury. The judge must determine whether probable cause exists to believe an offense has been committed and the defendant committed it.",
  },
  {
    id: "CRIM_2_2_1",
    citation: "Ches. R. Crim. P. Rule 2.2(1)",
    title: "Arrest Warrant or Summons",
    text: "If the information, supporting documents, and any supplemental sworn testimony establish probable cause to believe that an offense has been committed and that the defendant committed it, the Court shall issue a summons or arrest warrant. A summons shall issue in preference to an arrest warrant unless the Court finds reasonable grounds to believe that: (1) the defendant is unlikely to appear in response to a summons; (2) the defendant presents a substantial risk of danger to another person or the community; (3) the service of summons is impracticable; (4) the defendant may obstruct or interfere with the administration of justice; or (5) an arrest warrant is otherwise required by law.",
  },
  {
    id: "CRIM_3_3_1",
    citation: "Ches. R. Crim. P. Rule 3.3(1)",
    title: "Disclosure Materials",
    text: "The government must, upon the defendant’s request, allow access at any time to all matters within the government’s possession or control which relate to the case, and make the following disclosures: the names of witnesses who may be called by the government to testify at trial, and the names of any other individuals with information about the case; any books, papers, photographs, documents, articles, law enforcement officer reports, or electronically stored information relating to the case; any materials or information within the government’s possession that tend to negate or reduce the defendant’s guilt; and any evidence the government may rely on in seeking an aggravated sentence against the defendant.",
  },
  {
    id: "CRIM_3_4_1",
    citation: "Ches. R. Crim. P. Rule 3.4(1)",
    title: "Motions and Hearings",
    text: "An application to this court for any order must be a motion, which, unless made during a hearing or trial, must be put into writing. Which states the facts, arguments, and authorities pertinent to the motion. A pretrial motion shall state the grounds on which it is based and shall include in separately numbered paragraphs all reasons, defenses, or objections then available. If multiple charges are present, a motion that is filed pursuant to this rule shall specify which particular charge(s) it applies to. An affidavit detailing all the facts in support of such motion and signed by a person with factual basis of the motion shall be attached. No motion to suppress evidence, other than evidence seized during a warrantless search, and no motion to dismiss may be filed unless accompanied by a memorandum of law, unless otherwise ordered by the judge or justice of the peace.",
  },
  {
    id: "CIV_7_B",
    citation: "Har. R. Civ. P. Rule 7(b)",
    title: "Motions and Other Documents",
    text: "A request for a court order must be made by motion which, unless made during a hearing or trial, must be in writing, state with particularity the grounds for granting the motion, and set forth the relief or order sought.",
  },
  {
    id: "CIV_8_A",
    citation: "Har. R. Civ. P. Rule 8(a)",
    title: "Claim for Relief",
    text: "A pleading that states a claim for relief must contain: (1) a short and plain statement of the grounds for the court's jurisdiction, unless the court already has jurisdiction and the claim needs no new jurisdictional support; (2) a short and plain statement of the claim showing that the pleader is entitled to relief; and (3) a demand for the relief sought, which may include relief in the alternative or different types of relief.",
  },
  {
    id: "CIV_10_A_B",
    citation: "Har. R. Civ. P. Rule 10(a)-(b)",
    title: "Caption and Paragraphs",
    text: "Every pleading must have a caption with the title of the court, the title of the action or proceeding, and the case number, along with the pleading's designation under Rule 7. The title of the complaint must name all the parties. A party must state claims or defenses in consecutively numbered paragraphs, each limited as far as practicable to a single set of circumstances.",
  },
  {
    id: "CIV_11_A",
    citation: "Har. R. Civ. P. Rule 11(a)",
    title: "Signature",
    text: "Every pleading, written motion, and other document must be signed by at least one attorney—or by a party personally if the party is unrepresented. The court must strike an unsigned document unless the omission is promptly corrected after being called to the attention of the party.",
  },
] as const;

export const FILING_REVIEW_SOURCE_VERSION = createHash("sha256")
  .update(JSON.stringify(FILING_REVIEW_AUTHORITIES))
  .digest("hex")
  .slice(0, 16);

export function findFilingReviewAuthority(id: string) {
  return FILING_REVIEW_AUTHORITIES.find((authority) => authority.id === id) ?? null;
}
