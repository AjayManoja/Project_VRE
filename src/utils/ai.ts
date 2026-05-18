import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

export function getGeminiKey(root: string): string | null {
    try {
        const envPath = path.join(root, '.env');
        if (!fs.existsSync(envPath)) return null;
        const content = fs.readFileSync(envPath, 'utf-8');
        const match = content.match(/^GEMINI_API_KEY\s*=\s*['"]?([^'"\n\r;]+)['"]?/m);
        if (match && match[1]) {
            return match[1].trim();
        }
    } catch { /* skip */ }
    return null;
}

export async function optimizeWithGemini(code: string, ext: string, key: string): Promise<string> {
    return new Promise((resolve) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
        
        const lang = ext === '.py' ? 'Python' : (ext === '.ts' ? 'TypeScript' : 'JavaScript');
        
        const payload = JSON.stringify({
            contents: [{
                parts: [{
                    text: `You are the VRE (Virtual Runtime Environment) Step-Capping Optimizer. 
The user is providing a ${lang} script.
Your goal is to inject Dynamic Early-Exits (Step-Capping) into heavy execution loops (like training loops, dataloaders, or massive data processing).
For example, if you see a training loop over a dataset, inject a break after 3 iterations so it finishes instantly without altering the fundamental logic.
Do not change the mathematical operations or model architecture. Just add 'break' or 'return' conditions to loop indices.
Return ONLY the raw modified source code. Do not wrap in markdown blocks like \`\`\`python. Just the exact string to be written to a file.`
                }, {
                    text: code
                }]
            }],
            generationConfig: {
                temperature: 0.1,
            }
        });

        const req = https.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return resolve(code); // Fallback to original code
                }
                try {
                    const parsed = JSON.parse(data);
                    let result = parsed.candidates[0].content.parts[0].text;
                    if (result.startsWith('\`\`\`')) {
                        result = result.replace(/^\`\`\`[a-z]*\n/, '').replace(/\n\`\`\`$/, '');
                    }
                    resolve(result.trim() + '\n');
                } catch (e) {
                    resolve(code);
                }
            });
        });

        req.on('error', () => resolve(code)); // Fallback
        req.write(payload);
        req.end();
    });
}

export async function generateCrashDiagnosis(errorLog: string, code: string, ext: string, key: string): Promise<string> {
    return new Promise((resolve) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
        
        const lang = ext === '.py' ? 'Python' : (ext === '.ts' ? 'TypeScript' : 'JavaScript');
        
        const payload = JSON.stringify({
            contents: [{
                parts: [{
                    text: `You are the VRE AI Diagnostic Engine. 
The user's ${lang} script crashed.
Here is the error log:
${errorLog}

Here is the source code:
${code}

Write a short, highly precise 2-3 sentence diagnostic explaining EXACTLY why it crashed, and how the user's AI assistant should fix it. Do not use markdown blocks, just raw text.`
                }]
            }],
            generationConfig: {
                temperature: 0.1,
            }
        });

        const req = https.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return resolve(''); // Fallback
                }
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed.candidates[0].content.parts[0].text.trim());
                } catch (e) {
                    resolve('');
                }
            });
        });

        req.on('error', () => resolve('')); // Fallback
        req.write(payload);
        req.end();
    });
}

export async function generateEnvGuideline(deltaX: string, key: string): Promise<string> {
    return new Promise((resolve) => {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
        
        const payload = JSON.stringify({
            contents: [{
                parts: [{
                    text: `You are the VRE AI Environment Architect.
The user just opened a project. Here is their system's delta.X gap report:
${deltaX}

Write a short (3-5 sentences) proactive guideline.
Point out any missing packages or OS mismatches. Tell the user exactly what to be careful about before running their code on this exact machine configuration. Keep it crisp, technical, and do not use markdown code blocks.`
                }]
            }],
            generationConfig: {
                temperature: 0.1,
            }
        });

        const req = https.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return resolve(''); // Fallback
                }
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed.candidates[0].content.parts[0].text.trim());
                } catch (e) {
                    resolve('');
                }
            });
        });

        req.on('error', () => resolve('')); // Fallback
        req.write(payload);
        req.end();
    });
}
