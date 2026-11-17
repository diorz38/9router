import { NextResponse } from "next/server";
import { listPortalUsers } from "@/lib/localDb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const users = await listPortalUsers();
    return NextResponse.json({ users });
  } catch (error) {
    console.error("Error listing portal users:", error);
    return NextResponse.json({ error: "Failed to list portal users" }, { status: 500 });
  }
}
