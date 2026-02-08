// Minimal config loader for flarum integration
let cached = null;

export async function loadFlarumConfig() {
    if (cached) return cached;
    try {
        const res = await fetch('/flarum.config.json');
        if (!res.ok) throw new Error('没有找到 flarum.config.json');
        cached = await res.json();
        return cached;
    } catch (e) {
        console.warn('加载 flarum.config.json 失败，继续使用空配置：', e.message);
        cached = {forums: []};
        return cached;
    }
}

export function getDefaultForum(config) {
    if (!config || !config.forums || config.forums.length === 0) return null;
    return config.forums[0];
}
