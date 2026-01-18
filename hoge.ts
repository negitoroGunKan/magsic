const canvas = document.createElement('canvas');
document.body.appendChild(canvas);
let showLine = true;
const ctx = canvas.getContext('2d');
if (!ctx) {
    throw new Error("Could not get canvas context");
}

let width = window.innerWidth;
let height = window.innerHeight;
canvas.width = width;
canvas.height = height;

const centerX = width / 4; // Shift animation to the left
const graphX = width * 0.6; // Start graph on the right side
const yHistory: number[] = [];
const yHistory2: number[] = [];
const yHistory3: number[] = [];
const maxHistory = 400; // number of data points to keep
const centerY = height / 2;
const radius2 = 300;
const radius1 = radius2 / 2.5;
let angle = 0;
const minSpeed = 0.03;
const maxSpeed = 0.03;
const speed = Math.random() * (maxSpeed - minSpeed) + minSpeed;
let angle2 = 0;
const speed2 = speed * 2;
let playerX = centerX;
let playerY = centerY;

const playerSpeed = 5;
const keys: { [key: string]: boolean } = {};

function animate() {
    if (!ctx) {
        throw new Error("Could not get canvas context");
    }
    // Clear with a slight fade effect for trails (optional, but looks nice)
    // For now, solid clear
    // Clear with a slight fade effect for trails
    ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(0, 0, width, height);

    // Update position
    const x = centerX + Math.cos(angle) * radius1;
    const y = centerY + Math.sin(angle) * radius1;

    // Draw Sprite (Circle)
    ctx.fillStyle = '#4facfe'; // Cyan/Blue gradient-ish color
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#4facfe';
    ctx.fill();
    ctx.shadowBlur = 0;


    // Draw Second Sprite (Circle) - 2.5x speed
    const x2 = centerX + Math.cos(angle2) * radius2;
    const y2 = centerY + Math.sin(angle2) * radius2;

    // Draw Line connecting the two sprites
    if (showLine) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    ctx.fillStyle = '#ff4b1f'; // Red/Orange gradient-ish color
    ctx.beginPath();
    ctx.arc(x2, y2, 10, 0, Math.PI * 2);
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#ff4b1f';
    ctx.fill();
    ctx.shadowBlur = 0;

    // Draw Third Sprite (Midpoint)
    const x3 = (x + x2) / 2;
    const y3 = (y + y2) / 2;

    ctx.fillStyle = '#00ff9d'; // Green/Neon gradient-ish color
    ctx.beginPath();
    ctx.arc(x3, y3, 10, 0, Math.PI * 2);
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00ff9d';
    ctx.fill();
    ctx.fill();
    ctx.fill();
    ctx.shadowBlur = 0;

    // Draw Player Sprite (White)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(playerX, playerY, 10, 0, Math.PI * 2);
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#ffffff';
    ctx.fill();
    ctx.shadowBlur = 0;

    // Collision Detection
    const checkCollision = (tx: number, ty: number) => {
        const dx = playerX - tx;
        const dy = playerY - ty;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < 20) { // 10 (player radius) + 10 (target radius)
            playerX = centerX;
            playerY = centerY;
        }
    };

    checkCollision(x, y); // Check blue sprite
    checkCollision(x2, y2); // Check red sprite
    checkCollision(x3, y3); // Check green sprite

    // Store history
    yHistory.push(y);
    yHistory2.push(y2);
    yHistory3.push(y3);

    if (yHistory.length > maxHistory) {
        yHistory.shift();
        yHistory2.shift();
        yHistory3.shift();
    }

    // Draw axes
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(graphX, 0);
    ctx.lineTo(graphX, height);
    ctx.stroke();

    // Helper function to draw graph line
    const drawGraphLine = (history: number[], color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < history.length; i++) {
            const plotX = graphX + i;
            const plotY = history[i];
            if (i === 0) {
                ctx.moveTo(plotX, plotY);
            } else {
                ctx.lineTo(plotX, plotY);
            }
        }
        ctx.stroke();
    };

    drawGraphLine(yHistory, '#4facfe'); // Blue
    drawGraphLine(yHistory2, '#ff4b1f'); // Orange/Red
    drawGraphLine(yHistory3, '#00ff9d'); // Green

    angle += speed;
    angle2 += speed2;



    // Apply player movement
    if (keys['ArrowUp']) playerY -= playerSpeed;
    if (keys['ArrowDown']) playerY += playerSpeed;
    if (keys['ArrowLeft']) playerX -= playerSpeed;
    if (keys['ArrowRight']) playerX += playerSpeed;

    drawHint();

    requestAnimationFrame(animate);
}

animate();

// Handle window resize
window.addEventListener('resize', () => {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
});

// Draw Hint Text
function drawHint() {
    if (!ctx) return;
    ctx.font = '20px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.textAlign = 'center';
    ctx.fillText("Press space key", centerX, centerY + radius2 + 50);
    ctx.fillText("Use ←↑↓→ to Move", centerX, centerY + radius2 + 80);
}

// Toggle line visibility with spacebar and track key states
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        showLine = !showLine;
    }
    keys[e.code] = true;
});

window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});
