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
                scores[songId].push(newScore);

                // Sort by score desc
                scores[songId].sort((a, b) => b.score - a.score);

                fs.writeFile(scoresPath, JSON.stringify(scores, null, 2), err => {
                    if (err) {
                        res.writeHead(500);
                        res.end('Error saving score');
                    } else {
                        res.writeHead(200);
                        res.end('Score saved');
                    }
                });
            } catch (e) {
                console.error(e);
                res.writeHead(400);
                res.end('Bad Request');
            }
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
