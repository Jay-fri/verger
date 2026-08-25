import { redirect } from "next/navigation";

// The Control console is no longer a separate nav destination — it's Live
// mode on the merged Service screen, reached from Prep or the home screen's
// hero card. This picker's job (pick a service to run) is now covered by
// the Prep list at /dashboard/prep.
export default function LegacyConsolePickerRedirect() {
  redirect("/dashboard/prep");
}
