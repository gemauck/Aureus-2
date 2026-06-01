import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

export function resolvePoaRoot() {
    return path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
}

export function resolvePoaPython(rootDir) {
    const venvPythonPath = path.join(rootDir, 'venv-poareview', 'bin', 'python3');
    return fs.existsSync(venvPythonPath) ? venvPythonPath : 'python3';
}

export function runPoaPythonScript(rootDir, scriptRelativePath, stdinJson) {
    const scriptsDir = path.join(rootDir, 'scripts', 'poa-review');
    const python = resolvePoaPython(rootDir);
    const scriptPath = path.join(scriptsDir, scriptRelativePath);

    return new Promise((resolve, reject) => {
        const child = spawn(python, [scriptPath], {
            cwd: scriptsDir,
            env: { ...process.env, PYTHONUNBUFFERED: '1' },
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code !== 0) {
                reject(new Error((stderr || stdout || `Python exit ${code}`).slice(0, 3000)));
                return;
            }
            try {
                resolve(JSON.parse(stdout || '{}'));
            } catch (e) {
                reject(new Error(`Invalid JSON from POA script: ${e.message}`));
            }
        });
        child.stdin.write(JSON.stringify(stdinJson ?? {}));
        child.stdin.end();
    });
}
