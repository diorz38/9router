import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getPortalUserByUsername, verifyPassword } from "@/lib/localDb";
import { setPortalAuthCookie } from "@/lib/auth/portalSession";

export async function POST(request) {
  try {
    const body = await request.json();
    const username = body.username ? String(body.username).trim().toLowerCase() : "";
    const password = body.password ? String(body.password) : "";

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }

    const user = await getPortalUserByUsername(username, true);
    if (!user) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    if (!user.isActive) {
      return NextResponse.json({ error: "User account is suspended. Please contact your administrator." }, { status: 403 });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const cookieStore = await cookies();
    const token = await setPortalAuthCookie(cookieStore, request, user);

    return NextResponse.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message || "Login failed" }, { status: 500 });
  }
}
