import { redirect } from "next/navigation";

// Keep existing bookmarks working without showing the retired membership page.
export default function MembersPage() {
  redirect("/captions");
}
