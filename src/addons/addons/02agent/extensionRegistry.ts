export type ExtensionSource = "scratch" | "02engine" | "tw" | "pm" | "mist" | "sharkpool" | "special" | "external";

export interface ExtensionRegistryItem {
  extensionId: string;
  name: string;
  description?: string;
  source: ExtensionSource;
  extensionURL?: string;
  tags?: string[];
  credits?: string[];
  docsURI?: string | null;
  samples?: Array<{ href: string; text: string }> | null;
  iconURL?: string;
  builtin?: boolean;
  special?: boolean;
  incompatibleWithScratch?: boolean;
  bluetoothRequired?: boolean;
  internetConnectionRequired?: boolean;
}

export interface ExtensionSearchOptions {
  query?: string;
  source?: ExtensionSource | "all";
  scratchCompatibleOnly?: boolean;
  includeBuiltin?: boolean;
  includeRemote?: boolean;
  includeSpecial?: boolean;
  maxResults?: number;
}

const ROOT = typeof process !== "undefined" ? process.env.ROOT || "/" : "/";

const BUILTIN_EXTENSIONS: ExtensionRegistryItem[] = [
  { extensionId: "music", name: "Music", description: "Play instruments and drums.", source: "scratch", tags: ["scratch", "sound", "drum", "instrument"], builtin: true },
  { extensionId: "pen", name: "Pen", description: "Draw with your sprites.", source: "scratch", tags: ["scratch", "draw", "line", "stamp", "render"], builtin: true },
  { extensionId: "videoSensing", name: "Video Sensing", description: "Sense motion with the camera.", source: "scratch", tags: ["scratch", "camera", "motion"], builtin: true },
  { extensionId: "text2speech", name: "Text to Speech", description: "Make your projects talk.", source: "scratch", tags: ["scratch", "speech", "voice"], builtin: true, internetConnectionRequired: true },
  { extensionId: "translate", name: "Translate", description: "Translate text into many languages.", source: "scratch", tags: ["scratch", "translation", "language"], builtin: true, internetConnectionRequired: true },
  { extensionId: "makeymakey", name: "Makey Makey", description: "Make anything into a key.", source: "scratch", tags: ["scratch", "keyboard", "hardware"], builtin: true },
  { extensionId: "microbit", name: "micro:bit", description: "Connect your projects with the world.", source: "scratch", tags: ["scratch", "hardware", "bluetooth"], builtin: true, bluetoothRequired: true, internetConnectionRequired: true },
  { extensionId: "ev3", name: "LEGO MINDSTORMS EV3", description: "Build interactive robots and more.", source: "scratch", tags: ["scratch", "lego", "robot", "bluetooth"], builtin: true, bluetoothRequired: true, internetConnectionRequired: true },
  { extensionId: "boost", name: "LEGO BOOST", description: "Bring robotic creations to life.", source: "scratch", tags: ["scratch", "lego", "robot", "bluetooth"], builtin: true, bluetoothRequired: true, internetConnectionRequired: true },
  { extensionId: "wedo2", name: "LEGO Education WeDo 2.0", description: "Build with motors and sensors.", source: "scratch", tags: ["scratch", "lego", "motor", "sensor", "bluetooth"], builtin: true, bluetoothRequired: true, internetConnectionRequired: true },
  { extensionId: "gdxfor", name: "Go Direct Force & Acceleration", description: "Sense push, pull, motion, and spin.", source: "scratch", tags: ["scratch", "sensor", "force", "acceleration", "bluetooth"], builtin: true, bluetoothRequired: true, internetConnectionRequired: true },
  { extensionId: "tw", name: "TurboWarp Blocks", description: "Extra TurboWarp blocks.", source: "special", tags: ["tw", "runtime", "utility"], builtin: true, incompatibleWithScratch: true },
  { extensionId: "procedures_enable_return", name: "Custom Reporters", description: "Allow custom blocks to output values and be used as inputs.", source: "special", tags: ["tw", "custom blocks", "reporter", "return"], special: true, incompatibleWithScratch: true },
];

let cachedRemoteExtensions: ExtensionRegistryItem[] | null = null;
let cachedRemoteAt = 0;
const REMOTE_CACHE_MS = 5 * 60 * 1000;

const normalizeText = (value: unknown) => String(value || "").trim();

const normalizeLookup = (value: unknown) =>
  normalizeText(value)
    .toLowerCase()
    .replace(/\.js$/i, "")
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");

const getURLStem = (value: unknown) => {
  const text = normalizeText(value);
  if (!text || text.startsWith("data:")) return "";
  try {
    const url = new URL(text, window.location.href);
    const last = url.pathname.split("/").filter(Boolean).pop() || "";
    return last.replace(/\.js$/i, "");
  } catch {
    return text.split("/").filter(Boolean).pop()?.replace(/\.js$/i, "") || text;
  }
};

const creditToText = (credit: any) => {
  if (!credit) return "";
  if (typeof credit === "string") return credit;
  if (typeof credit.name === "string") return credit.name;
  return String(credit);
};

const safeFetchJson = async <T>(url: string, fallback: T): Promise<T> => {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.warn("[02Agent] Failed to fetch extension registry", url, error);
    return fallback;
  }
};

const fetchPenguinModExtensions = async (): Promise<ExtensionRegistryItem[]> => {
  try {
    const module = await import(/* webpackIgnore: true */ "/penguinmod/extensions.js");
    const extensions = Array.isArray(module?.default) ? module.default : [];
    return extensions.map((extension: any) => ({
      name: normalizeText(extension.name),
      description: normalizeText(extension.description),
      extensionId: normalizeText(extension.name),
      extensionURL: `https://extensions.penguinmod.com/extensions/${extension.code}`,
      iconURL: `https://extensions.penguinmod.com/images/${extension.banner || "images/unknown.svg"}`,
      source: "pm" as ExtensionSource,
      tags: ["pm"],
      credits: [normalizeText(extension.creator)].filter(Boolean),
      docsURI: null,
      samples: null,
      incompatibleWithScratch: false,
    }));
  } catch (error) {
    console.warn("[02Agent] Failed to fetch PenguinMod extensions", error);
    return [];
  }
};

export const fetchRemoteExtensions = async (forceRefresh = false) => {
  const now = Date.now();
  if (!forceRefresh && cachedRemoteExtensions && now - cachedRemoteAt < REMOTE_CACHE_MS) {
    return cachedRemoteExtensions;
  }

  const [engineData, twData, mistData, sharkPoolData, penguinModData] = await Promise.all([
    safeFetchJson<any>("https://extensions.02engine.02studio.xyz/extensions.json", { extensions: [] }),
    safeFetchJson<any>("https://extensions.turbowarp.org/generated-metadata/extensions-v0.json", { extensions: [] }),
    safeFetchJson<any>("https://mistiumextensions.02studio.xyz/generated-metadata/extensions-v0.json", { extensions: [] }),
    safeFetchJson<any>("https://sharkpoolextensions.02studio.xyz/Gallery%20Files/Extension-Keys.json", { extensions: {} }),
    fetchPenguinModExtensions(),
  ]);

  const engineExtensions = (Array.isArray(engineData.extensions) ? engineData.extensions : []).map((extension: any) => ({
    name: normalizeText(extension.name),
    description: normalizeText(extension.description),
    extensionId: normalizeText(extension.id),
    extensionURL: `https://extensions.02engine.02studio.xyz/extension/${extension.slug}.js`,
    iconURL: `https://extensions.02engine.02studio.xyz/image/${extension.image || "images/unknown.svg"}`,
    source: "02engine" as ExtensionSource,
    tags: ["02engine", "ztengine"],
    credits: [...(extension.original || []), ...(extension.by || [])].map(creditToText).filter(Boolean),
    docsURI: null,
    samples: extension.samples ? extension.samples.map((sample: string) => ({
      href: `${ROOT}editor?project_url=https://extensions.02engine.02studio.xyz/samples/${encodeURIComponent(sample)}.sb3`,
      text: sample,
    })) : null,
    incompatibleWithScratch: !extension.scratchCompatible,
  }));

  const twExtensions = (Array.isArray(twData.extensions) ? twData.extensions : []).map((extension: any) => ({
    name: normalizeText(extension.name),
    description: normalizeText(extension.description),
    extensionId: normalizeText(extension.id),
    extensionURL: `https://extensions.turbowarp.org/${extension.slug}.js`,
    iconURL: `https://extensions.turbowarp.org/${extension.image || "images/unknown.svg"}`,
    source: "tw" as ExtensionSource,
    tags: ["tw"],
    credits: [...(extension.original || []), ...(extension.by || [])].map(creditToText).filter(Boolean),
    docsURI: extension.docs ? `https://extensions.turbowarp.org/${extension.slug}` : null,
    samples: extension.samples ? extension.samples.map((sample: string) => ({
      href: `${ROOT}editor?project_url=https://extensions.turbowarp.org/samples/${encodeURIComponent(sample)}.sb3`,
      text: sample,
    })) : null,
    incompatibleWithScratch: !extension.scratchCompatible,
  }));

  const mistExtensions = (Array.isArray(mistData.extensions) ? mistData.extensions : []).map((extension: any) => ({
    name: normalizeText(extension.name),
    description: normalizeText(extension.description),
    extensionId: normalizeText(extension.id),
    extensionURL: `https://mistiumextensions.02studio.xyz/featured/${extension.name}.js`,
    iconURL: `https://mistiumextensions.02studio.xyz/${extension.image || "images/unknown.svg"}`,
    source: "mist" as ExtensionSource,
    tags: ["mist"],
    credits: [...(extension.original || []), ...(extension.by || [])].map(creditToText).filter(Boolean),
    docsURI: null,
    samples: extension.samples ? extension.samples.map((sample: string) => ({
      href: `${ROOT}editor?project_url=https://extensions.turbowarp.org/samples/${encodeURIComponent(sample)}.sb3`,
      text: sample,
    })) : null,
    incompatibleWithScratch: !extension.scratchCompatible,
  }));

  const sharkPoolExtensions = Object.entries(sharkPoolData.extensions || {}).map(([slug, rawExtension]: [string, any]) => ({
    name: slug,
    description: normalizeText(rawExtension.desc),
    extensionId: slug,
    extensionURL: `https://sharkpoolextensions.02studio.xyz/extension-code/${rawExtension.url}`,
    iconURL: `https://sharkpoolextensions.02studio.xyz/extension-thumbs/${rawExtension.banner || "images/unknown.svg"}`,
    source: "sharkpool" as ExtensionSource,
    tags: [...(rawExtension.tags || []), "sharkpool"].map(String),
    credits: normalizeText(rawExtension.creator).split(", ").filter(Boolean),
    docsURI: null,
    samples: null,
    incompatibleWithScratch: false,
  }));

  cachedRemoteExtensions = [
    ...engineExtensions,
    ...twExtensions,
    ...penguinModData,
    ...mistExtensions,
    ...sharkPoolExtensions,
  ].filter((extension) => extension.extensionId || extension.extensionURL);
  cachedRemoteAt = now;
  return cachedRemoteExtensions;
};

export const getBuiltinExtensions = () => [...BUILTIN_EXTENSIONS];

export const getAllKnownExtensions = async (options: { includeRemote?: boolean; forceRefresh?: boolean } = {}) => {
  const includeRemote = options.includeRemote !== false;
  return includeRemote ? [...BUILTIN_EXTENSIONS, ...(await fetchRemoteExtensions(Boolean(options.forceRefresh)))] : [...BUILTIN_EXTENSIONS];
};

export const searchKnownExtensions = async (options: ExtensionSearchOptions = {}) => {
  const includeBuiltin = options.includeBuiltin !== false;
  const includeRemote = options.includeRemote !== false;
  const includeSpecial = options.includeSpecial !== false;
  const source = options.source || "all";
  const query = normalizeText(options.query);
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const normalizedQuery = normalizeLookup(query);
  const maxResults = Math.max(1, Math.min(100, Math.floor(Number(options.maxResults) || 20)));
  const extensions = await getAllKnownExtensions({ includeRemote });

  const scored = extensions
    .filter((extension) => includeBuiltin || !extension.builtin)
    .filter((extension) => includeSpecial || !extension.special)
    .filter((extension) => source === "all" || extension.source === source)
    .filter((extension) => !options.scratchCompatibleOnly || !extension.incompatibleWithScratch)
    .map((extension) => {
      const haystackParts = [
        extension.extensionId,
        extension.name,
        extension.description,
        extension.extensionURL,
        getURLStem(extension.extensionURL),
        ...(extension.tags || []),
        ...(extension.credits || []),
      ];
      const haystack = haystackParts.join(" ").toLowerCase();
      const normalizedHaystack = normalizeLookup(haystackParts.join(" "));
      let score = query ? 0 : 1;
      if (query) {
        if (normalizeLookup(extension.extensionId) === normalizedQuery) score += 100;
        if (normalizeLookup(extension.name) === normalizedQuery) score += 90;
        if (normalizeLookup(getURLStem(extension.extensionURL)) === normalizedQuery) score += 80;
        if (normalizedHaystack.includes(normalizedQuery)) score += 50;
        score += queryTerms.filter((term) => haystack.includes(term)).length * 10;
      }
      return { extension, score };
    })
    .filter((item) => !query || item.score > 0)
    .sort((left, right) => right.score - left.score || left.extension.name.localeCompare(right.extension.name));

  return scored.slice(0, maxResults).map(({ extension, score }) => ({ ...extension, score }));
};

export const resolveKnownExtension = async (options: {
  extensionId?: string;
  extensionURL?: string;
  query?: string;
  source?: ExtensionSource | "all";
  allowExternalUrl?: boolean;
  forceRefresh?: boolean;
}) => {
  const extensionId = normalizeText(options.extensionId);
  const extensionURL = normalizeText(options.extensionURL);
  const allExtensions = await getAllKnownExtensions({ includeRemote: true, forceRefresh: options.forceRefresh });
  const normalizedId = normalizeLookup(extensionId);
  const normalizedURL = normalizeLookup(extensionURL);

  const exact = allExtensions.find((extension) => {
    if (options.source && options.source !== "all" && extension.source !== options.source) return false;
    return (
      (normalizedId && normalizeLookup(extension.extensionId) === normalizedId) ||
      (normalizedId && normalizeLookup(extension.name) === normalizedId) ||
      (normalizedURL && normalizeLookup(extension.extensionURL) === normalizedURL) ||
      (normalizedURL && normalizeLookup(getURLStem(extension.extensionURL)) === normalizedURL)
    );
  });
  if (exact) return { item: exact, external: false, matches: [exact] };

  if (extensionURL) {
    if (!options.allowExternalUrl) {
      return { item: null, external: true, matches: [], error: "External extensionURL requires allowExternalUrl: true." };
    }
    return {
      item: {
        extensionId: extensionId || getURLStem(extensionURL) || "external_extension",
        name: extensionId || getURLStem(extensionURL) || extensionURL,
        description: "External extension URL supplied directly to 02Agent.",
        source: "external" as ExtensionSource,
        extensionURL,
        tags: ["external"],
        incompatibleWithScratch: true,
      },
      external: true,
      matches: [],
    };
  }

  const matches = await searchKnownExtensions({ query: options.query || extensionId, source: options.source, maxResults: 8 });
  return { item: matches.length === 1 ? matches[0] : null, external: false, matches };
};
