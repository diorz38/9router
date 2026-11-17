import { NextResponse } from "next/server";
import { getPortalSessionFromRequest } from "@/lib/auth/portalSession";
import { getPortalUserById } from "@/lib/localDb";

export async function GET(request) {
  const session = await getPortalSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
  }

  const user = await getPortalUserById(session.userId);
  if (!user || !user.isActive) {
    return NextResponse.json({ authenticated: false, user: null }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      createdAt: user.createdAt,
    },
  });
}
