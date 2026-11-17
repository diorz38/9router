import { NextResponse } from "next/server";
import { getApiKeys, createApiKey } from "@/lib/localDb";
import { getConsistentMachineId } from "@/shared/utils/machineId";
import { validateKeyAccessInput } from "@/shared/utils/keyAccess.js";

export const dynamic = "force-dynamic";

// GET /api/keys - List API keys
export async function GET() {
  try {
    const keys = await getApiKeys();
    return NextResponse.json({ keys });
  } catch (error) {
    console.log("Error fetching keys:", error);
    return NextResponse.json({ error: "Failed to fetch keys" }, { status: 500 });
  }
}

// POST /api/keys - Create new API key
export async function POST(request) {
  try {
    const body = await request.json();
    const { name, access, maxTokens } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const options = {};

    if (access !== undefined) {
      const checked = validateKeyAccessInput(access);
      if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
      options.access = checked.value;
    }

    if (maxTokens !== undefined && maxTokens !== null && maxTokens !== "") {
      const num = Number(maxTokens);
      if (!Number.isFinite(num) || num < 0) {
        return NextResponse.json({ error: "maxTokens must be a positive number or null" }, { status: 400 });
      }
      options.maxTokens = num > 0 ? Math.floor(num) : null;
    }

    // Always get machineId from server
    const machineId = await getConsistentMachineId();
    const apiKey = await createApiKey(name.trim(), machineId, options);

    return NextResponse.json({
      key: apiKey.key,
      name: apiKey.name,
      id: apiKey.id,
      machineId: apiKey.machineId,
      access: apiKey.access,
      maxTokens: apiKey.maxTokens,
      usedTokens: apiKey.usedTokens,
    }, { status: 201 });
  } catch (error) {
    console.log("Error creating key:", error);
    return NextResponse.json({ error: "Failed to create key" }, { status: 500 });
  }
}
