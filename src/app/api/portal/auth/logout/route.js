import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clearPortalAuthCookie } from "@/lib/auth/portalSession";

export async function POST() {
  const cookieStore = await cookies();
  clearPortalAuthCookie(cookieStore);
  return NextResponse.json({ success: true });
}
