/**
 * Pure helpers for the "/" skill picker in the composer.
 *
 * The picker is driven entirely by the textarea content: the first line must be a
 * bare "/query" token (no trailing space, no newline). Keeping the parsing and
 * filtering here makes the behaviour unit-testable without rendering React.
 */

export interface SkillPickerEntry {
    id: string;
    name: string;
    description?: string;
}

/**
 * Extract the query from a leading "/token" on the first line.
 * Returns null when the text is not a bare slash query, which is what closes the
 * picker: "/name " (picked), "/name rest" (already typing the message) and
 * "hello /x" all yield null.
 */
export const parseSkillQuery = (inputText: string): string | null => {
    // Deliberately no trimEnd(): a trailing space means "picked / done typing the token",
    // and that trailing whitespace is what closes the panel.
    const firstLine = String(inputText || "").split("\n")[0] || "";
    const match = /^\s*\/([^ \n]*)$/.exec(firstLine);
    return match ? match[1] : null;
};

/**
 * Filter enabled skills by a case-insensitive name substring.
 * `dismissedQuery` lets Escape hide the panel for exactly the current query, so
 * typing one more character brings it back.
 */
export const filterSkillSuggestions = <T extends SkillPickerEntry>(
    skills: T[],
    query: string | null,
    dismissedQuery: string | null = null,
): T[] => {
    if (query === null || !Array.isArray(skills) || skills.length === 0) return [];
    if (dismissedQuery !== null && dismissedQuery === query) return [];
    const needle = query.toLowerCase();
    return skills.filter((skill) => String(skill?.name || "").toLowerCase().includes(needle));
};

/** Move the highlighted row with wrap-around, clamped for an empty list. */
export const moveSkillSelection = (current: number, delta: number, length: number): number => {
    if (length <= 0) return 0;
    const start = Number.isFinite(current) ? current : 0;
    return ((start + delta) % length + length) % length;
};

/** The text inserted on pick; the trailing space closes the picker. */
export const buildSkillPrefix = (name: string): string => `/${String(name || "").trim()} `;
