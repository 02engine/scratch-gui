/**
 * Costume / SVG asset pipeline helpers extracted from AITools (tools.ts) so the
 * sprite-assets domain does not have to live inside the god class. Every
 * function takes what it needs (runtime / target / costume) explicitly — no
 * module state, no `this`.
 */

export const escapeSvgAttribute = (value: unknown) =>
    String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

export const validateSvgText = (svgText: string) => {
    const text = String(svgText || "").trim();
    const errors: Array<{ line: number; message: string }> = [];
    if (!text) {
        errors.push({ line: 1, message: "SVG content is empty." });
    }
    if (!/^<svg[\s>]/i.test(text) && !text.includes("<svg")) {
        errors.push({ line: 1, message: "Costume file must contain an <svg> root element." });
    }
    if (/<script[\s>]/i.test(text)) {
        errors.push({ line: 1, message: "SVG <script> elements are not allowed." });
    }
    if (/\son[a-z]+\s*=/i.test(text)) {
        errors.push({ line: 1, message: "SVG event handler attributes such as onclick are not allowed." });
    }
    if (/href\s*=\s*["']https?:\/\//i.test(text) || /xlink:href\s*=\s*["']https?:\/\//i.test(text)) {
        errors.push({ line: 1, message: "Remote image links are not allowed; use data: images inside SVG." });
    }
    try {
        if (typeof DOMParser === "undefined") {
            return errors;
        }
        const doc = new DOMParser().parseFromString(text, "image/svg+xml");
        const parseError = doc.querySelector("parsererror");
        if (parseError) {
            errors.push({ line: 1, message: parseError.textContent?.trim().slice(0, 300) || "Invalid SVG XML." });
        }
    } catch (error) {
        errors.push({ line: 1, message: error instanceof Error ? error.message : "Invalid SVG XML." });
    }
    return errors;
};

const parseSvgLength = (value: string | null | undefined) => {
    const match = String(value || "").trim().match(/^-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
};

export const getSvgCanvasSize = (svgText: string) => {
    try {
        if (typeof DOMParser === "undefined") {
            return null;
        }
        const doc = new DOMParser().parseFromString(String(svgText || ""), "image/svg+xml");
        const svg = doc.querySelector("svg");
        if (!svg) return null;
        const viewBox = String(svg.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(Number);
        const viewBoxWidth = Number.isFinite(viewBox[2]) && viewBox[2] > 0 ? viewBox[2] : null;
        const viewBoxHeight = Number.isFinite(viewBox[3]) && viewBox[3] > 0 ? viewBox[3] : null;
        const width = parseSvgLength(svg.getAttribute("width")) || viewBoxWidth;
        const height = parseSvgLength(svg.getAttribute("height")) || viewBoxHeight;
        if (!width || !height) return null;
        return { width, height };
    } catch {
        return null;
    }
};

export const normalizeSvgTextForScratch = (svgText: string) => {
    let text = String(svgText || "").trim();
    const fencedMatch = text.match(/^```(?:svg|xml)?\s*([\s\S]*?)\s*```$/i);
    if (fencedMatch) {
        text = fencedMatch[1].trim();
    }
    const svgStart = text.search(/<svg[\s>]/i);
    const svgEnd = text.toLowerCase().lastIndexOf("</svg>");
    if (svgStart > 0 && svgEnd >= svgStart) {
        text = text.slice(svgStart, svgEnd + "</svg>".length).trim();
    }
    return text
        .replace(/&nbsp;/gi, "&#160;")
        .replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-f]+;)/gi, "&amp;");
};

/**
 * Map an explicit costume index / name to an index. Returns -1 when neither
 * resolves; callers must surface that instead of silently picking costume 0.
 */
export const resolveCostumeIndex = (target: any, costumeIndex?: number, costumeName?: string) => {
    const costumes = Array.isArray(target?.sprite?.costumes) ? target.sprite.costumes : [];
    if (typeof costumeIndex === "number" && Number.isFinite(costumeIndex)) {
        const normalizedIndex = Math.floor(costumeIndex);
        if (normalizedIndex >= 0 && normalizedIndex < costumes.length) return normalizedIndex;
    }
    if (costumeName) {
        const normalizedName = String(costumeName).trim().toLowerCase();
        const foundIndex = costumes.findIndex((costume: any) => String(costume?.name || "").trim().toLowerCase() === normalizedName);
        if (foundIndex >= 0) return foundIndex;
    }
    return -1;
};

/** Decode a costume into the canonical SVG text the virtual files expose. */
export const getCostumeSvgContent = (costume: any) => {
    const asset = costume?.asset;
    if (!asset) return "";
    const dataFormat = String(costume.dataFormat || asset.dataFormat || "").toLowerCase();
    if (dataFormat === "svg") {
        return asset.decodeText?.() || "";
    }
    if (dataFormat === "png" || dataFormat === "jpg" || dataFormat === "jpeg") {
        const imageHref = asset.encodeDataURI?.(dataFormat === "jpg" || dataFormat === "jpeg" ? "image/jpeg" : "image/png") || "";
        const width = Math.max(1, Number(costume.size?.[0] || costume.rotationCenterX * 2 || 480));
        const height = Math.max(1, Number(costume.size?.[1] || costume.rotationCenterY * 2 || 360));
        return [
            `<svg xmlns="http://www.w3.org/2000/svg" width="${escapeSvgAttribute(width)}" height="${escapeSvgAttribute(height)}" viewBox="0 0 ${escapeSvgAttribute(width)} ${escapeSvgAttribute(height)}">`,
            `  <image href="${escapeSvgAttribute(imageHref)}" x="0" y="0" width="${escapeSvgAttribute(width)}" height="${escapeSvgAttribute(height)}" />`,
            `</svg>`,
        ].join("\n");
    }
    return "";
};

/** Choose the SVG rotation center: explicit > ink bounds > stage size > fallback. */
export const inferSvgRotationCenter = (
    runtime: any,
    target: any,
    svg: string,
    fallback?: [number, number],
): [number, number] => {
    const canvasSize = getSvgCanvasSize(svg);
    if (canvasSize) {
        return [canvasSize.width / 2, canvasSize.height / 2];
    }
    if (target?.isStage) {
        const activeRuntime = runtime || {};
        return [Number(activeRuntime.stageWidth || 480) / 2, Number(activeRuntime.stageHeight || 360) / 2];
    }
    if (fallback && Number.isFinite(fallback[0]) && Number.isFinite(fallback[1])) {
        return fallback;
    }
    return [0, 0];
};

/** Write an SVG onto a costume object, updating asset / skin / center atomically. */
export const applySvgToCostumeObject = (
    runtime: any,
    costume: any,
    svg: string,
    rotationCenterX?: number,
    rotationCenterY?: number,
) => {
    const storage = runtime?.storage;
    const renderer = runtime?.renderer;
    if (!costume || !storage || !renderer) {
        throw new Error("Scratch runtime renderer/storage is not available for SVG update.");
    }

    const hasExplicitRotationCenter = Number.isFinite(rotationCenterX) && Number.isFinite(rotationCenterY);
    let resolvedRotationCenter: [number, number];

    if (typeof costume.skinId === "number" && typeof renderer.updateSVGSkin === "function") {
        if (hasExplicitRotationCenter) {
            renderer.updateSVGSkin(costume.skinId, svg, [Number(rotationCenterX), Number(rotationCenterY)]);
            resolvedRotationCenter = [Number(rotationCenterX), Number(rotationCenterY)];
        } else {
            renderer.updateSVGSkin(costume.skinId, svg);
            const derived = renderer.getSkinRotationCenter(costume.skinId);
            resolvedRotationCenter = [Number(derived?.[0] ?? 0), Number(derived?.[1] ?? 0)];
        }
    } else {
        const createdSkinId = hasExplicitRotationCenter
            ? renderer.createSVGSkin(svg, [Number(rotationCenterX), Number(rotationCenterY)])
            : renderer.createSVGSkin(svg);
        costume.skinId = createdSkinId;
        resolvedRotationCenter = hasExplicitRotationCenter
            ? [Number(rotationCenterX), Number(rotationCenterY)]
            : [
                Number(renderer.getSkinRotationCenter(createdSkinId)?.[0] ?? 0),
                Number(renderer.getSkinRotationCenter(createdSkinId)?.[1] ?? 0),
            ];
    }

    costume.rotationCenterX = resolvedRotationCenter[0];
    costume.rotationCenterY = resolvedRotationCenter[1];
    costume.size = renderer.getSkinSize(costume.skinId);
    costume.dataFormat = storage.DataFormat.SVG;
    costume.bitmapResolution = 1;
    costume.asset = storage.createAsset(
        storage.AssetType.ImageVector,
        storage.DataFormat.SVG,
        new TextEncoder().encode(svg),
        null,
        true,
    );
    costume.assetId = costume.asset.assetId;
    costume.md5 = `${costume.assetId}.${costume.dataFormat}`;
    costume.md5ext = costume.md5;
};
