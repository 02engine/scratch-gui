#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import process from 'process';

const REPOS = [
    { owner: '02Engine', repo: 'scratch-gui' },
    { owner: '02Engine', repo: 'scratch-vm' }
];

const OUT_FILE = path.resolve(
    'static/credits/contributors.json'
);

const headers = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': '02Engine-Credits-Sync'
    // 可选：提高 rate limit
    // 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`
};

async function fetchContributors(owner, repo) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contributors?per_page=100`;

    const res = await fetch(url, { headers });
    if (!res.ok) {
        throw new Error(`${owner}/${repo} → ${res.status}`);
    }

    const data = await res.json();

    return data
        .filter(u => u.type === 'User')
        .map(u => ({
            login: u.login,
            avatar: u.avatar_url,
            url: u.html_url,
            contributions: u.contributions
        }));
}

(async () => {
    console.log('[credits] syncing contributors...');

    const map = new Map();

    for (const { owner, repo } of REPOS) {
        console.log(`  - ${owner}/${repo}`);
        const users = await fetchContributors(owner, repo);

        for (const u of users) {
            const prev = map.get(u.login);
            map.set(u.login, {
                ...u,
                contributions: (prev?.contributions || 0) + u.contributions
            });
        }
    }

    const result = [...map.values()]
        .sort((a, b) => b.contributions - a.contributions);

    await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
    await fs.writeFile(
        OUT_FILE,
        JSON.stringify(result, null, 2),
        'utf-8'
    );

    console.log(`[credits] wrote ${result.length} contributors`);
})().catch(err => {
    console.error('[credits] sync failed:', err);
    process.exit(1);
});
