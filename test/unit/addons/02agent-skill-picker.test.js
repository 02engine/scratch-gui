/**
 * "/" skill picker behaviour: query parsing, filtering, keyboard wrap-around,
 * and the inserted prefix that must close the panel.
 */
import {describe, expect, test} from '@jest/globals';

import {
    buildSkillPrefix,
    filterSkillSuggestions,
    moveSkillSelection,
    parseSkillQuery,
} from '../../../src/addons/addons/02agent/skillPicker';

const SKILLS = [
    {id: 's1', name: 'code-review', description: '审查代码'},
    {id: 's2', name: 'Review-PR', description: '审 PR'},
    {id: 's3', name: 'deploy', description: '部署'},
];

describe('02Agent "/" skill picker', () => {
    test('parses a bare slash token on the first line', () => {
        expect(parseSkillQuery('/')).toBe('');
        expect(parseSkillQuery('/co')).toBe('co');
        expect(parseSkillQuery('   /co')).toBe('co');
    });

    test('closes once the token is followed by a space or the message starts', () => {
        expect(parseSkillQuery('/code-review ')).toBeNull();
        expect(parseSkillQuery('/code-review 写个函数')).toBeNull();
        expect(parseSkillQuery('看下 /co')).toBeNull();
        expect(parseSkillQuery('')).toBeNull();
        expect(parseSkillQuery('hello')).toBeNull();
    });

    test('filters by case-insensitive name substring', () => {
        expect(filterSkillSuggestions(SKILLS, '').map((s) => s.name)).toEqual([
            'code-review',
            'Review-PR',
            'deploy',
        ]);
        expect(filterSkillSuggestions(SKILLS, 're').map((s) => s.name)).toEqual([
            'code-review',
            'Review-PR',
        ]);
        expect(filterSkillSuggestions(SKILLS, 'zzz')).toEqual([]);
    });

    test('no query or no skills yields an empty panel', () => {
        expect(filterSkillSuggestions(SKILLS, null)).toEqual([]);
        expect(filterSkillSuggestions([], '')).toEqual([]);
    });

    test('escape dismissal is scoped to the exact query', () => {
        expect(filterSkillSuggestions(SKILLS, 'co', 'co')).toEqual([]);
        // Typing one more character is a different query, so the panel reopens.
        expect(filterSkillSuggestions(SKILLS, 'cod', 'co').map((s) => s.name)).toEqual(['code-review']);
    });

    test('selection wraps in both directions', () => {
        expect(moveSkillSelection(0, 1, 3)).toBe(1);
        expect(moveSkillSelection(2, 1, 3)).toBe(0);
        expect(moveSkillSelection(0, -1, 3)).toBe(2);
        expect(moveSkillSelection(5, 0, 3)).toBe(2);
        expect(moveSkillSelection(1, 1, 0)).toBe(0);
    });

    test('picked prefix closes the panel and is resolved on send', () => {
        const prefix = buildSkillPrefix('code-review');
        expect(prefix).toBe('/code-review ');
        // The trailing space is what stops the query from matching.
        expect(parseSkillQuery(prefix)).toBeNull();
        expect(buildSkillPrefix('  deploy  ')).toBe('/deploy ');
    });
});
