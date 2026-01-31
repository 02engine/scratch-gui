// Small Flarum API client helpers
export async function uploadFiles(baseUrl, bearerToken, files) {
    const form = new FormData();
    files.forEach((f) => form.append('files[]', f));
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/fof/upload`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${bearerToken}`
        },
        body: form
    });
    if (!res.ok) throw new Error(`上传失败：${res.status}`);
    return res.json();
}

export async function createDiscussion(baseUrl, bearerToken, title, content, tagIds = []) {
    const payload = {
        data: {
            type: 'discussions',
            attributes: {
                title,
                content
            },
            relationships: {
                tags: {
                    data: tagIds.map(id => ({type: 'tags', id}))
                }
            }
        }
    };
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/discussions`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${bearerToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`发帖失败：${res.status}`);
    return res.json();
}

export async function getTags(baseUrl, bearerToken) {
    try {
        const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${bearerToken}`,
                'Accept': 'application/json'
            }
        });

        if (!res.ok) {
            console.warn(`Tags API failed with status ${res.status}, trying without auth`);
            // 如果带认证失败，尝试不带认证
            const resNoAuth = await fetch(`${baseUrl.replace(/\/$/, '')}/api/tags`, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            });
            if (!resNoAuth.ok) {
                console.error(`Tags API failed even without auth: ${resNoAuth.status}`);
                return [];
            }
            const data = await resNoAuth.json();
            return data.data || [];
        }

        const data = await res.json();
        return data.data || [];
    } catch (error) {
        console.error('获取标签时发生错误:', error);
        return [];
    }
}

export async function getCurrentUser(baseUrl, bearerToken) {
    const base = baseUrl.replace(/\/$/, '');

    // 根据test-oauth.html的方式，使用 /api/user?access_token=${token}
    try {
        const res = await fetch(`${base}/api/user?access_token=${bearerToken}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!res.ok) {
            throw new Error(`获取用户信息失败: ${res.status}`);
        }

        const user = await res.json();

        return {
            username: user.username || user.displayName || 'user',
            avatarUrl: user.avatarUrl || user.avatar_url || (user.avatar && user.avatar.url) || null,
            raw: user
        };
    } catch (error) {
        console.error('获取用户信息失败:', error);
        throw error;
    }
}
