const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8080;
const ROOT = __dirname; // Serve files from current directory

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.txt': 'text/plain',
    '.ico': 'image/x-icon',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogv': 'video/ogg',
};

const server = http.createServer((req, res) => {
    console.log(`${req.method} ${req.url}`);

    const parsedUrl = url.parse(req.url, true);
    let pathname;
    try {
        pathname = decodeURIComponent(parsedUrl.pathname);
    } catch (e) {
        console.error('URI Decode Error:', e);
        pathname = parsedUrl.pathname;
    }

    // API: Save Chart
    if (req.method === 'POST' && pathname === '/save') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                // Sanitize path to prevent directory traversal
                // We expect "songs/folder/file.txt"
                const targetPath = path.join(ROOT, data.path);
                const safePrefix = path.join(ROOT, 'songs');

                if (!targetPath.startsWith(safePrefix)) {
                    res.writeHead(403);
                    res.end('Forbidden');
                    return;
                }

                fs.writeFile(targetPath, data.content, err => {
                    if (err) {
                        console.error(err);
                        res.writeHead(500);
                        res.end('Error writing file');
                    } else {
                        res.writeHead(200);
                        res.end('File saved successfully');
                    }
                });
            } catch (e) {
                console.error(e);
                res.writeHead(400);
                res.end('Invalid JSON');
            }
        });
        return;
    }

    // API: Save Score
    if (req.method === 'POST' && pathname === '/api/score') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                const newScore = JSON.parse(body);
                const scoresPath = path.join(ROOT, 'scores.json');

                let scores = {};
                if (fs.existsSync(scoresPath)) {
                    try {
                        scores = JSON.parse(fs.readFileSync(scoresPath, 'utf8'));
                    } catch (e) {
                        console.error('Error parsing scores.json', e);
                    }
                }

                const songId = newScore.songId;
                if (!scores[songId]) scores[songId] = [];

                // Add playerName support (default to 'Guest' if missing)
                if (!newScore.playerName) newScore.playerName = 'Guest';
                newScore.timestamp = new Date().toISOString();

                // Check for Personal Best: only save if it's better than current records for this song
                // Since we only want BEST values to save capacity
                let isBetter = true;
                if (scores[songId].length > 0) {
                    const currentBest = scores[songId][0].score || 0;
                    if (newScore.score <= currentBest) {
                        isBetter = false;
                    }
                }

                if (isBetter) {
                    // Replace or push? The user wants "Best values". 
                    // Let's keep only the ONE BEST to maximize capacity efficiency.
                    scores[songId] = [newScore];

                    fs.writeFile(scoresPath, JSON.stringify(scores, null, 2), err => {
                        if (err) {
                            res.writeHead(500);
                            res.end('Error saving score');
                        } else {
                            res.writeHead(200);
                            res.end('New Personal Best saved');
                        }
                    });
                } else {
                    res.writeHead(200);
                    res.end('Score not a new best, not saved');
                }
            } catch (e) {
                console.error(e);
                res.writeHead(400);
                res.end('Bad Request');
            }
        });
        return;
    }

    // API: Get Scores
    if (req.method === 'GET' && pathname === '/api/scores') {
        const scoresPath = path.join(ROOT, 'scores.json');
        if (fs.existsSync(scoresPath)) {
            const data = fs.readFileSync(scoresPath, 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(data);
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({}));
        }
        return;
    }

    const { exec } = require('child_process');

    // API: List Files (Recursive)
    if (req.method === 'GET' && pathname === '/api/files/list') {
        const getFiles = (dir) => {
            let results = [];
            const list = fs.readdirSync(dir, { withFileTypes: true });
            list.forEach(dirent => {
                const resPath = path.join(dir, dirent.name);
                if (dirent.isDirectory()) {
                    if (dirent.name !== 'node_modules' && !dirent.name.startsWith('.')) {
                        results = results.concat(getFiles(resPath));
                    }
                } else {
                    if (!dirent.name.startsWith('.')) {
                        results.push(path.relative(ROOT, resPath).replace(/\\/g, '/'));
                    }
                }
            });
            return results;
        };

        try {
            const fileList = getFiles(ROOT);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(fileList));
        } catch (e) {
            console.error(e);
            res.writeHead(500);
            res.end('Error reading files: ' + e);
        }
        return;
    }

    // API: Read Any File
    if (req.method === 'GET' && pathname === '/api/files/read') {
        const target = parsedUrl.query.file;
        if (!target) { res.writeHead(400); res.end('Missing file param'); return; }
        const filePath = path.join(ROOT, target);

        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('File not found');
            } else {
                // If it's an image, send as base64 for editor preview? Or just let editor load by URL
                // Actually for text editor, we assume text.
                // Binary files check
                const ext = path.extname(target).toLowerCase();
                const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.ico'].includes(ext);

                if (isImage) {
                    res.writeHead(200, { 'Content-Type': mimeTypes[ext] });
                    res.end(data);
                } else {
                    res.writeHead(200, { 'Content-Type': 'text/plain' });
                    res.end(data);
                }
            }
        });
        return;
    }

    // API: Save Any File
    if (req.method === 'POST' && pathname === '/api/files/save') {
        const target = parsedUrl.query.file;
        if (!target) { res.writeHead(400); res.end('Missing file param'); return; }

        let body = [];
        req.on('data', chunk => body.push(chunk));
        req.on('end', () => {
            const buffer = Buffer.concat(body);
            const filePath = path.join(ROOT, target);

            fs.writeFile(filePath, buffer, err => {
                if (err) {
                    res.writeHead(500);
                    res.end('Error writing file');
                } else {
                    // If TS file, compile
                    if (target.endsWith('.ts')) {
                        exec('npx tsc magusic.ts --target es2016 --lib es2016,dom --outFile magusic.js', (error, stdout, stderr) => {
                            let msg = 'Saved & Compiled!';
                            if (error) msg = `Saved but Compile Error:\n${stderr || error.message}`;
                            res.writeHead(200);
                            res.end(msg);
                        });
                    } else {
                        res.writeHead(200);
                        res.end('File Saved');
                    }
                }
            });
        });
        return;
    }

    // Static File Serving
    if (pathname === '/') pathname = '/index.html';

    // Prevent directory traversal
    const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    const ext = path.extname(safePath);
    let fsPath = path.join(ROOT, safePath);

    console.log(`Requested: ${pathname} -> Decoded: ${safePath}`);
    console.log(`Attempting to read: ${fsPath}`);

    fs.readFile(fsPath, (err, data) => {
        if (err) {
            console.error(`Error reading ${fsPath}:`, err.code);
            res.writeHead(404);
            res.end('Not Found');
        } else {
            const contentType = mimeTypes[ext] || 'application/octet-stream';
            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': 'no-cache, no-store, must-revalidate'
            });
            res.end(data);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log('Use Ctrl+C to stop.');
});
