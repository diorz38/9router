import { NextResponse } from "next/server";
import { getPortalSessionFromRequest } from "@/lib/auth/portalSession";
import { getPortalUserById, getApiKeysByUserId } from "@/lib/localDb";

function maskApiKey(fullKey) {
  if (!fullKey || fullKey.length < 16) return fullKey || "";
  return `${fullKey.slice(0, 10)}...${fullKey.slice(-4)}`;
}

export async function GET(request) {
  const session = await getPortalSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getPortalUserById(session.userId);
  if (!user || !user.isActive) {
    return NextResponse.json({ error: "User account suspended" }, { status: 403 });
  }

  const rawKeys = await getApiKeysByUserId(session.userId);

  let totalMaxTokens = 0;
  let totalUsedTokens = 0;
  let hasUnlimited = false;

  const accessibleModelsSet = new Set();
  let hasWildcardAccess = false;

  const keys = rawKeys.map((k) => {
    const maxTokens = k.maxTokens && k.maxTokens > 0 ? k.maxTokens : null;
    const usedTokens = Math.max(0, k.usedTokens || 0);

    if (maxTokens === null) {
      hasUnlimited = true;
    } else {
      totalMaxTokens += maxTokens;
    }
    totalUsedTokens += usedTokens;

    const remainingTokens = maxTokens !== null ? Math.max(0, maxTokens - usedTokens) : null;
    const usagePercent = maxTokens !== null && maxTokens > 0
      ? Math.min(100, Math.round((usedTokens / maxTokens) * 1000) / 10)
      : null;

    const isRestricted = Boolean(k.access?.restricted);
    const allowed = isRestricted ? (k.access?.allow || []) : ["*"];

    if (k.isActive) {
      if (!isRestricted) {
        hasWildcardAccess = true;
      } else {
        allowed.forEach((m) => accessibleModelsSet.add(m));
      }
    }

    return {
      id: k.id,
      name: k.name || "Default Key",
      keyMasked: maskApiKey(k.key),
      isActive: Boolean(k.isActive),
      createdAt: k.createdAt,
      maxTokens,
      usedTokens,
      remainingTokens,
      usagePercent,
      isRestricted,
      allowedModels: allowed,
    };
  });

  const totalRemainingTokens = hasUnlimited ? null : Math.max(0, totalMaxTokens - totalUsedTokens);
  const totalUsagePercent = !hasUnlimited && totalMaxTokens > 0
    ? Math.min(100, Math.round((totalUsedTokens / totalMaxTokens) * 1000) / 10)
    : null;

  const accessibleModels = hasWildcardAccess ? ["*"] : Array.from(accessibleModelsSet).sort();

  return NextResponse.json({
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      createdAt: user.createdAt,
    },
    summary: {
      totalKeys: keys.length,
      activeKeys: keys.filter((k) => k.isActive).length,
      totalMaxTokens: hasUnlimited ? null : totalMaxTokens,
      totalUsedTokens,
      totalRemainingTokens,
      usagePercent: totalUsagePercent,
      hasUnlimited,
    },
    keys,
    accessibleModels,
  });
}
