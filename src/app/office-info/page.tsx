import { redirect } from "next/navigation";

export default function LegacyOfficeInfoRedirect() {
  redirect("/contacts");
}
