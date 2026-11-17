import https from "https";
import pkg from "../../../../package.json" with { type: "json" };

const GITHUB_REPO = "diorz38/9router";
const GITHUB_RAW_PACKAGE_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/refs/heads/master/package.json`;
const GITHUB_RELEASE_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const VERSION_CACHE_TTL_MS = 3600000; // cache version lookup for 1h

// Survive hot reload; one cache per process
const versionCache = (global.__versionCheckCache ??= { value: null, fetchedAt: 0 });

function fetchHttpsJson(url, headers = {}) {
  return new Promise((resolve) => {
    const req = https.get(
      url,
      {
        headers: { "User-Agent": "9router-version-checker", ...headers },
        timeout: 4000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

// Fetch latest version from user's GitHub repository (first raw package.json on master, fallback to latest release)
async function fetchLatestVersion() {
  const rawPkg = await fetchHttpsJson(GITHUB_RAW_PACKAGE_URL);
  if (rawPkg?.version) {
    return rawPkg.version;
  }

  const release = await fetchHttpsJson(GITHUB_RELEASE_API_URL);
  if (release?.tag_name) {
    return release.tag_name.replace(/^v/, "");
  }

  return null;
}

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

async function getLatestVersionCached() {
  if (versionCache.value && Date.now() - versionCache.fetchedAt < VERSION_CACHE_TTL_MS) {
    return versionCache.value;
  }
  const latest = await fetchLatestVersion();
  if (latest) {
    versionCache.value = latest;
    versionCache.fetchedAt = Date.now();
  }
  return latest;
}

export async function GET() {
  const latestVersion = await getLatestVersionCached();
  const currentVersion = pkg.version;
  const hasUpdate = latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false;
  const repoUrl = `https://github.com/${GITHUB_REPO}`;
  const releaseUrl = `${repoUrl}/releases`;

  return Response.json({ currentVersion, latestVersion, hasUpdate, repoUrl, releaseUrl });
}
