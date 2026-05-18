/**
 * Classifier — separates hardware crashes from real code bugs.
 */

export type Category = 1 | 2;

export interface Classification {
    category: Category;
    note: string;
}

const CAT1 = [
    /CUDA out of memory/i, /RuntimeError: .*out of memory/i, /MemoryError/i,
    /torch\.cuda\.OutOfMemoryError/i, /Resource exhausted/i, /OOM/,
    /Cannot allocate memory/i, /GPU memory/i, /insufficient memory/i,
];

export function classify(stderr: string): Classification {
    for (const p of CAT1) {
        if (p.test(stderr)) {
            return { category: 1, note: 'Hardware limit — not a code bug. Would work on a bigger machine.' };
        }
    }
    return { category: 2, note: 'Logic error — will crash on any machine. This is a real bug.' };
}

export interface ParsedError {
    type: string;
    message: string;
    file: string;
    line: number | null;
    func: string | null;
    stack: string[];
}

export function parsePython(stderr: string): ParsedError {
    const lines = stderr.split('\n');
    const stack: string[] = [];
    let type = 'UnknownError', message = '', file = 'unknown', line: number | null = null, func: string | null = null;

    for (let i = lines.length - 1; i >= 0; i--) {
        const l = lines[i].trim();
        if (l && !l.startsWith('Traceback')) {
            const m = l.match(/^(\w+Error|\w+Exception):\s*(.*)/);
            if (m) { type = m[1]; message = m[2]; break; }
        }
    }
    for (const l of lines) {
        const m = l.match(/File "(.+?)", line (\d+)(?:, in (.+))?/);
        if (m) {
            stack.push(`${m[1]} line ${m[2]}${m[3] ? ` in ${m[3]}` : ''}`);
            file = m[1]; line = parseInt(m[2]); func = m[3] || null;
        }
    }

    return { type, message, file, line, func, stack };
}

export function parseNode(stderr: string): ParsedError {
    const lines = stderr.split('\n');
    const stack: string[] = [];
    let type = 'Error', message = '', file = 'unknown', line: number | null = null, func: string | null = null;

    for (const l of lines) {
        const em = l.match(/^(\w+Error|\w+Exception):\s*(.*)/);
        if (em) { type = em[1]; message = em[2]; continue; }
        const tm = l.match(/at\s+(.+?)\s+\((.+?):(\d+):\d+\)/);
        if (tm) {
            stack.push(`${tm[2]} line ${tm[3]} in ${tm[1]}`);
            if (!line) { file = tm[2]; line = parseInt(tm[3]); func = tm[1]; }
        }
    }

    return { type, message, file, line, func, stack };
}
