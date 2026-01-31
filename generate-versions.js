// generate-versions.js
const { Octokit } = require("@octokit/rest");
const fs = require("fs").promises;
const path = require("path");
const dayjs = require("dayjs");

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

async function main() {
  const owner = process.env.GITHUB_REPOSITORY_OWNER || "你的用户名";
  const repo = process.env.GITHUB_REPOSITORY_NAME || "你的仓库名";

  // 如果环境变量里没有，手动硬编码也行（不推荐）
  // const owner = "你的用户名";
  // const repo = "你的仓库名";

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
    .filter(r => !r.draft && !r.prerelease) // 建议只保留正式版，可按需修改
    .map(release => {
      let version = release.tag_name;

      // 常见格式处理： v1.15.2 → 1.15.2    1.15.2 → 1.15.2    v1.15.2-beta → 1.15.2-beta
      version = version.replace(/^v/, "").trim();

      // 如果你严格只想要 X.Y.Z 格式，可以再加一层过滤
      // if (!/^\d+\.\d+\.\d+(?:[-+].*)?$/.test(version)) return null;

      const date = dayjs(release.published_at || release.created_at).format("YYYY-MM-DD");

      // 将 body 按行分割，有内容的行才保留
      let notes = (release.body || "")
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith("<!--") && !line.endsWith("-->"))
        // 可选：过滤掉一些常见的无意义行
        .filter(line => !/^(v?\d+\.\d+\.\d+|\d{4}-\d{2}-\d{2}|---|\*\*Full Changelog\*\*|See commits)/i.test(line));

      return {
        version,
        date,
        notes: notes.length > 0 ? notes : ["No release notes provided"],
      };
    })
    // .filter(Boolean)           // 如果上面加了 null 过滤则启用
    .sort((a, b) => {
      // 版本号倒序（最新在上）
      return b.version.localeCompare(a.version, undefined, { numeric: true });
    });

  const outputDir = path.join(process.cwd(), "updates");
  const outputPath = path.join(outputDir, "versions.json");

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(result, null, 2) + "\n");

  console.log(`Generated ${result.length} entries → ${outputPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
