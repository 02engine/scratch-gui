// generate-changelog.js
const { Octokit } = require("@octokit/rest");
const fs = require("fs").promises;
const path = require("path");
const dayjs = require("dayjs");

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

async function main() {
  const owner = process.env.GITHUB_REPOSITORY_OWNER || "02engine";
  const repo = process.env.GITHUB_REPOSITORY_NAME || "desktop";

  console.log(`Fetching releases from ${owner}/${repo}`);

  let allReleases = [];
  let page = 1;

  while (true) {
    const { data: releases } = await octokit.rest.repos.listReleases({
      owner,
      repo,
      per_page: 100,
      page,
    });

    if (releases.length === 0) break;
    allReleases = allReleases.concat(releases);
    page++;
  }

  console.log(`Found ${allReleases.length} releases`);

  const result = allReleases
    .filter(r => !r.draft && !r.prerelease)
    .map(release => {
      let rawTag = release.tag_name;

      // 去掉开头的 v（常见写法 v1.2.3 或 1.2.3）
      let version = rawTag.replace(/^v/i, "").trim();

      // 只提取 major.minor.patch 部分（X.Y.Z）
      const semverMatch = version.match(/^(\d+\.\d+\.\d+)/);
      if (!semverMatch || !semverMatch[1]) {
        console.log(`Skipping invalid version format: ${rawTag}`);
        return null;
      }

      version = semverMatch[1]; // 现在 version 只可能是 1.2.3 这种

      const date = dayjs(release.published_at || release.created_at).format("YYYY-MM-DD");

      // 处理 release notes
      let notes = (release.body || "")
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => 
          line.length > 0 &&
          !line.startsWith("<!--") &&
          !line.endsWith("-->")
        )
        // 过滤掉一些常见的无意义行（可根据你的仓库实际情况增减）
        .filter(line => 
          !/^(v?\d+\.\d+\.\d+|\d{4}-\d{2}-\d{2}|---|\*\*Full Changelog\*\*|See commits|chore:|feat:|fix:)/i.test(line)
        );

      return {
        version,
        date,
        notes: notes.length > 0 ? notes : ["No release notes provided"],
      };
    })
    .filter(Boolean) // 移除 null 条目
    .sort((a, b) => {
      // 版本号倒序（最新版本在数组最前面）
      return b.version.localeCompare(a.version, undefined, { numeric: true });
    });

  const outputDir = path.join(process.cwd(), "changelog");
  const outputPath = path.join(outputDir, "changelog.json");

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(result, null, 2) + "\n", "utf8");

  console.log(`Generated ${result.length} entries → ${outputPath}`);
}

main().catch(err => {
  console.error("Script failed:", err);
  process.exit(1);
});
