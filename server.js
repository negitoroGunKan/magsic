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
    '.m4a': 'audio/mp4',
    '.m4v': 'video/mp4',
    '.webm': 'video/webm',
    '.ogv': 'video/ogg',
    '.svg': 'image/svg+xml',
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

                const dirPath = path.dirname(targetPath);
                fs.mkdir(dirPath, { recursive: true }, err => {
                    if (err) {
                        console.error('Mkdir error:', err);
                        res.writeHead(500);
                        res.end('Error creating directory');
                        return;
                    }
                    fs.writeFile(targetPath, data.content, err => {
                        if (err) {
                            console.error(err);
                            res.writeHead(500);
                            res.end('Error writing file: ' + err.message);
                        } else {
                            res.writeHead(200);
                            res.end('File saved successfully');
                        }
                    });
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
                fs.appendFileSync('server_log.txt', `[${new Date().toISOString()}] Received /api/score request. Body length: ${body.length}\n`);
                const newScore = JSON.parse(body);
                const scoresPath = path.join(ROOT, 'scores.json');

                let scores = {};
                if (fs.existsSync(scoresPath)) {
                    try {
                        const content = fs.readFileSync(scoresPath, 'utf8');
                        scores = JSON.parse(content);
                    } catch (e) {
                        fs.appendFileSync('server_log.txt', `Error parsing scores.json: ${e.message}\n`);
                    }
                }

                const songId = newScore.songId;
                if (!songId) {
                    fs.appendFileSync('server_log.txt', `Error: songId is missing in newScore\n`);
                    res.writeHead(400);
                    res.end('Missing songId');
                    return;
                }
                if (!scores[songId]) scores[songId] = [];

                if (!newScore.playerName) newScore.playerName = 'Guest';
                newScore.timestamp = new Date().toISOString();

                let isBetter = true;
                let existingDiffIndex = -1;
                
                existingDiffIndex = scores[songId].findIndex(s => s.difficulty === newScore.difficulty && s.playerName === newScore.playerName);
                if (existingDiffIndex !== -1) {
                    const currentBest = scores[songId][existingDiffIndex].score || 0;
                    if (newScore.score <= currentBest) {
                        isBetter = false;
                    }
                }

                if (isBetter) {
                    if (existingDiffIndex !== -1) {
                        scores[songId][existingDiffIndex] = newScore;
                    } else {
                        scores[songId].push(newScore);
                    }

                    fs.appendFileSync('server_log.txt', `Saving scores for ${songId}. Total scores count: ${Object.keys(scores).length}\n`);
                    const jsonStr = JSON.stringify(scores, null, 2);
                    fs.writeFile(scoresPath, jsonStr, err => {
                        if (err) {
                            fs.appendFileSync('server_log.txt', `Error writing scores.json: ${err.message}\n`);
                            res.writeHead(500);
                            res.end('Error saving score');
                        } else {
                            fs.appendFileSync('server_log.txt', `Successfully saved scores.json. Size: ${jsonStr.length}\n`);
                            res.writeHead(200);
                            res.end('New Personal Best saved');
                        }
                    });
                } else {
                    res.writeHead(200);
                    res.end('Score not a new best, not saved');
                }
            } catch (e) {
                fs.appendFileSync('server_log.txt', `CRASH in /api/score handler: ${e.stack}\n`);
                res.writeHead(500);
                res.end('Internal Server Error');
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
            const dirPath = path.dirname(filePath);

            fs.mkdir(dirPath, { recursive: true }, err => {
                if (err) {
                    res.writeHead(500);
                    res.end('Error creating directory');
                    return;
                }
                fs.writeFile(filePath, buffer, err => {
                    if (err) {
                        res.writeHead(500);
                        res.end('Error writing file: ' + err.message);
                    } else {
                        // If TS file, compile
                        if (target.endsWith('.ts')) {
                            exec('npm run build:game', (error, stdout, stderr) => {
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

    fs.stat(fsPath, (err, stats) => {
        if (err || !stats.isFile()) {
            console.error(`Error reading ${fsPath}:`, err?.code);
            res.writeHead(404);
            res.end('Not Found');
            return;
        }

        const range = req.headers.range;
        const totalSize = stats.size;
        const contentType = mimeTypes[ext] || 'application/octet-stream';

        if (range) {
            console.log(`[DEBUG] Range requested: ${range} for ${safePath}`);
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = (parts[1] && parts[1].trim() !== "") ? parseInt(parts[1], 10) : totalSize - 1;

            if (isNaN(start) || start >= totalSize || (end !== undefined && end >= totalSize)) {
                console.error(`[DEBUG] Invalid Range: ${start}-${end}/${totalSize}`);
                res.writeHead(416, { 'Content-Range': `bytes */${totalSize}` });
                return res.end();
            }

            const chunksize = (end - start) + 1;
            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${totalSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': contentType
            });

            const stream = fs.createReadStream(fsPath, { start, end });
            stream.pipe(res);
        } else {
            console.log(`[DEBUG] Full file request: ${safePath}`);
            res.writeHead(200, {
                'Content-Length': totalSize,
                'Content-Type': contentType,
                'Accept-Ranges': 'bytes'
            });
            fs.createReadStream(fsPath).pipe(res);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log('Use Ctrl+C to stop.');
});

// --- WebSocket Battle Matching & Transit Server ---
const WebSocket = require('ws');
const wss = new WebSocket.Server({ server });

// Room management
// Structure: { roomId: { id: string, p1: ws, p2: ws } }
let rooms = {};
let waitingWs = null; // Client waiting for match

wss.on('connection', (ws) => {
    console.log('[WS] New Client Connected');
    ws.room = null;
    ws.role = null; // 'p1' or 'p2'
    ws.playerInfo = { nickname: 'Guest', icon: '' };

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'join') {
                ws.playerInfo.nickname = data.nickname || 'Guest';
                ws.playerInfo.icon = data.icon || '';
                
                // Matching logic
                if (waitingWs && waitingWs.readyState === WebSocket.OPEN && waitingWs !== ws) {
                    // Match found! Create a room
                    const roomId = 'room_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
                    const room = {
                        id: roomId,
                        p1: waitingWs,
                        p2: ws
                    };
                    rooms[roomId] = room;
                    
                    waitingWs.room = room;
                    waitingWs.role = 'p1';
                    ws.room = room;
                    ws.role = 'p2';
                    
                    waitingWs = null; // Reset waiting queue
                    
                    // Send MATCHED status to both
                    room.p1.send(JSON.stringify({
                        type: 'matched',
                        role: 'p1',
                        opponent: ws.playerInfo
                    }));
                    room.p2.send(JSON.stringify({
                        type: 'matched',
                        role: 'p2',
                        opponent: room.p1.playerInfo
                    }));
                    console.log(`[WS] Match created in ${roomId}: ${room.p1.playerInfo.nickname} vs ${room.p2.playerInfo.nickname}`);
                } else {
                    // No one waiting (or it was the same client requesting double join, prevent self-match)
                    waitingWs = ws;
                    ws.send(JSON.stringify({ type: 'waiting' }));
                    console.log(`[WS] Client ${ws.playerInfo.nickname} is waiting for match...`);
                }
            }
            
            else if (data.type === 'cursor_move') {
                sendToOpponent(ws, {
                    type: 'cursor_move',
                    index: data.index
                });
            }
            
            else if (data.type === 'diff_change') {
                sendToOpponent(ws, {
                    type: 'diff_change',
                    index: data.index
                });
            }
            
            else if (data.type === 'song_decide') {
                sendToOpponent(ws, {
                    type: 'song_decide',
                    songFolder: data.songFolder,
                    chartName: data.chartName,
                    audioName: data.audioName
                });
            }
            
            else if (data.type === 'play_state') {
                sendToOpponent(ws, {
                    type: 'play_state',
                    score: data.score,
                    health: data.health,
                    combo: data.combo,
                    clearRate: data.clearRate
                });
            }
            
            else if (data.type === 'results') {
                sendToOpponent(ws, {
                    type: 'results',
                    score: data.score,
                    clearRate: data.clearRate,
                    maxCombo: data.maxCombo,
                    isClear: data.isClear,
                    rank: data.rank
                });
            }

        } catch (e) {
            console.error('[WS] Message handling error:', e);
        }
    });

    ws.on('close', () => {
        console.log('[WS] Client Disconnected');
        if (waitingWs === ws) {
            waitingWs = null;
        }
        
        if (ws.room) {
            const room = ws.room;
            const opponent = ws.role === 'p1' ? room.p2 : room.p1;
            if (opponent && opponent.readyState === WebSocket.OPEN) {
                opponent.send(JSON.stringify({ type: 'opponent_left' }));
                opponent.room = null;
                opponent.role = null;
            }
            delete rooms[room.id];
        }
    });
});

function sendToOpponent(ws, payload) {
    if (ws.room) {
        const opponent = ws.role === 'p1' ? ws.room.p2 : ws.room.p1;
        if (opponent && opponent.readyState === WebSocket.OPEN) {
            opponent.send(JSON.stringify(payload));
        }
    }
}
