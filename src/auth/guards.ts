import { redirect } from "next/navigation";
import { auth } from "@/auth";

export async function requireUser(callbackUrl = "/cuenta") {
  const session = await auth();
  if (!session?.user?.id) redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  return session.user;
}

export async function requireRole(roles: Array<"user" | "reviewer" | "admin">) {
  const user = await requireUser("/admin/importaciones");
  if (!user.role || !roles.includes(user.role)) {
    redirect("/cuenta?error=forbidden");
  }
  return user;
}
