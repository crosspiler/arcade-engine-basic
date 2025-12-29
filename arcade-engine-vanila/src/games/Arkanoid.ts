// src/games/Arkanoid.ts
import { GameModel } from './GameModel';
import type { GameItem, InputAction, SoundEmitter } from '../engine/types';
import { DirectionalInteraction } from '../engine/features/interactionSystems/DirectionalInteraction';
import { GameLoop } from '../engine/features/GameLoop';
import { Grid } from '../engine/features/Grid';
import * as THREE from 'three';

const EMPTY = 0;
const BRICK = 1;
const PADDLE = 2;
const BALL = 3;
const WALL = 4;
const POWERUP_WIDE = 5;
const POWERUP_SLOW = 6;
const POWERDOWN_SMALL = 7;
const POWERUP_FAST = 8;
const POWERUP_BIG = 9;
const POWERDOWN_TINY = 10;
const POWERUP_FIRE = 11;
const POWERUP_MULTI = 12;
const BRICK_2 = 13; // 2 hits (Silver)
const BRICK_3 = 14; // 3 hits (Gold)

interface Powerup {
    x: number;
    y: number;
    vy: number; // Only vertical velocity needed for falling
    type: number;
    id: string;
}

interface Ball {
    x: number;
    y: number;
    vx: number;
    vy: number;
    speed: number;
    radius: number;
}

export default class Arkanoid extends GameModel {
    grid!: Grid<number>;
    paddle = { x: 5, y: 0 };
    paddleWidth = 3;
    balls: Ball[] = [];
    gameRunning = false;
    gameLoop: GameLoop;
    score = 0;
    powerups: Powerup[] = [];
    isFireball = false;
    fireballTimer = 0;
    currentBallRadius = 0.3;
    ballSpeedMult = 1.0;
    moveDirection = 0; // -1, 0, 1
    inputTimeout = 0;
    interaction: DirectionalInteraction;

    constructor(audio?: SoundEmitter) {
        // 11 columns (odd number allows perfect centering), 16 rows
        super(11, 16, 'arkanoid', audio);
        this.grid = new Grid(11, 16, EMPTY);
        this.gameLoop = new GameLoop((dt) => this.tick(dt));
        this.interaction = new DirectionalInteraction(
            (dx) => this.handleMove(dx),
            () => this.startLevel()
        );
    }

    start() {
        this.startLevel();
    }

    startLevel() {
        // Reset progression only on Game Over or Level 1
        if (this.isGameOver) {
            this.level = 1;
            this.score = 0;
        }
        
        if (this.level === 1) {
            this.paddleWidth = 3;
            this.isFireball = false;
            this.fireballTimer = 0;
            this.currentBallRadius = 0.3;
            this.ballSpeedMult = 1.0;
            this.moveDirection = 0;
            this.inputTimeout = 0;
        }

        this.isGameOver = false;
        this.gameRunning = false;
        this.powerups = [];
        
        // Init Grid
        this.grid = new Grid(this.width, this.height, EMPTY);
        
        this.generateLevel();

        this.paddle.x = Math.floor(this.width / 2);
        this.resetBalls();

        this.status$.next('Press Left/Right to Start');
        this.emit();

        this.gameLoop.start();
    }

    generateLevel() {
        const pattern = (this.level - 1) % 4;
        const difficulty = Math.min(1.0, this.level * 0.15); // Increases with level

        // Generate bricks in rows 8 to 14
        for(let y = 8; y < 15; y++) {
            for(let x = 1; x < this.width - 1; x++) {
                let type = EMPTY;
                
                // Procedural Patterns
                if (pattern === 0) { // Simple Rows
                    if (y % 2 === 0) type = BRICK;
                } else if (pattern === 1) { // Columns
                    if (x % 2 !== 0) type = BRICK;
                } else if (pattern === 2) { // Checkerboard
                    if ((x + y) % 2 === 0) type = BRICK;
                } else { // Random / Dense
                    if (Math.random() > 0.3) type = BRICK;
                }

                // Upgrade bricks based on difficulty
                if (type !== EMPTY) {
                    const rand = Math.random();
                    if (rand < difficulty * 0.3) type = BRICK_3;
                    else if (rand < difficulty * 0.6) type = BRICK_2;
                    
                    this.grid.set(x, y, type);
                }
            }
        }
    }

    resetBalls() {
        this.balls = [{ 
            x: this.paddle.x, 
            y: 1.5, // Just above paddle
            vx: 0, 
            vy: 0,
            speed: (6.0 + (this.level * 1.0)) * this.ballSpeedMult, // Speed in units per second
            radius: this.currentBallRadius
        }];
        this.gameRunning = false;
    }

    handleInput(action: InputAction) {
        this.interaction.handleInput(action, this.isGameOver);
    }

    handleMove(dx: number) {
        if (!this.gameRunning && dx !== 0) { 
            this.gameRunning = true;
            // Launch ball
            this.balls[0].vx = dx * 0.5;
            this.balls[0].vy = 1.0; // Normalized direction
            this.normalizeBallVelocity(this.balls[0]);
        }
        
        if (dx !== 0) {
            this.moveDirection = dx;
            // Keep moving for a short duration to bridge key repeat gaps
            this.inputTimeout = 0.15; 
        }
    }

    tick(dt: number) {
        if (this.isGameOver) return;

        // --- Paddle Movement ---
        // Apply continuous force if input is active
        if (this.inputTimeout > 0) {
            this.inputTimeout -= dt;
            
            // Constant speed, no acceleration
            const speed = 20.0; // Units per second
            this.paddle.x += this.moveDirection * speed * dt;
            
            if (this.inputTimeout <= 0) {
                this.moveDirection = 0;
            }
        }

        // --- Paddle Constraints ---
        const wings = (this.paddleWidth - 1) / 2;
        const minX = 1 + wings;
        const maxX = (this.width - 2) - wings;
        this.paddle.x = Math.max(minX, Math.min(maxX, this.paddle.x));

        if (!this.gameRunning && this.balls.length > 0) {
            this.balls[0].x = this.paddle.x;
            return;
        }

        // --- Ball Movement ---
        // Iterate backwards to safely remove balls
        for (let i = this.balls.length - 1; i >= 0; i--) {
            const ball = this.balls[i];
            const nextX = ball.x + ball.vx * dt;
            const nextY = ball.y + ball.vy * dt;

        // Wall Collisions (Left/Right)
        // Wall center at 0. Extent 0.5. Inner edge 0.5.
        // Collision: x < 0.5 + radius
        // Reduced offset slightly (0.8 * radius) to allow visual contact before bounce
        // Using 0.5 multiplier to ensure ball overlaps wall slightly before bouncing
            const wallOffset = 0.5 + (ball.radius * 0.5);
        
        if (nextX < wallOffset) {
            ball.vx = Math.abs(ball.vx);
            ball.x = wallOffset;
            this.audio.playMove();
        }
        // Right wall center at width-1. Extent 0.5. Inner edge width-1.5.
        else if (nextX > (this.width - 1) - wallOffset) {
            ball.vx = -Math.abs(ball.vx);
            ball.x = (this.width - 1) - wallOffset;
            this.audio.playMove();
        }

        // Ceiling Collision
        // Top wall center at height-1. Inner edge height-1.5.
            const ceilingOffset = 0.5 + (ball.radius * 0.5);
        if (nextY > (this.height - 1) - ceilingOffset) {
            ball.vy = -Math.abs(ball.vy);
            ball.y = (this.height - 1) - ceilingOffset;
            this.audio.playMove();
        }

        // Floor Collision (Game Over)
        if (nextY < 0) {
                this.balls.splice(i, 1);
                this.audio.playTone(100, 'sawtooth', 0.1);
                continue; // Ball lost
        }

        // Paddle Collision
        // Efficient Point-based check
        // Check if the bottom of the ball intersects the paddle's top surface
        const paddleTop = this.paddle.y + 0.25;
        const ballBottom = nextY - ball.radius;

        if (ball.vy < 0 && ballBottom <= paddleTop && ballBottom >= paddleTop - 0.5) {
            const halfWidth = this.paddleWidth / 2;
            if (nextX >= this.paddle.x - halfWidth && nextX <= this.paddle.x + halfWidth) {
                ball.vy = Math.abs(ball.vy); // Force up
                
                // Add "English" (spin) based on where it hit the paddle
                const hitOffset = (nextX - this.paddle.x) / halfWidth;
                ball.vx += hitOffset * 0.1; // Add horizontal momentum
                
                this.normalizeBallVelocity(ball);
                this.audio.playSelect();
            }
        }

        // Brick Collision
        // "Look-ahead" probe to prevent tunneling. Check the point on the ball's leading edge.
        const probeX = nextX + Math.sign(ball.vx) * ball.radius;
        const probeY = nextY + Math.sign(ball.vy) * ball.radius;
        const gx = Math.floor(probeX);
        const gy = Math.floor(probeY);

        if (gx >= 0 && gx < this.width && gy >= 0 && gy < this.height) {
            const cell = this.grid.get(gx, gy);
            if (cell === BRICK || cell === BRICK_2 || cell === BRICK_3) {
                let destroyed = false;
                
                if (!this.isFireball) {
                    // Determine if it was a horizontal or vertical collision
                    // by checking which side of the brick the ball's center is on.
                    const overlapX = nextX - gx; // 0 to 1
                    const overlapY = nextY - gy; // 0 to 1
                    const fromSide = overlapX < 0.2 || overlapX > 0.8;
                    const fromTopBottom = overlapY < 0.2 || overlapY > 0.8;

                    if (fromSide && !fromTopBottom) {
                        ball.vx *= -1;
                    } else {
                        ball.vy *= -1;
                    }

                    // Downgrade brick
                    if (cell === BRICK) {
                        this.grid.set(gx, gy, EMPTY);
                        destroyed = true;
                    } else if (cell === BRICK_2) {
                        this.grid.set(gx, gy, BRICK);
                    } else if (cell === BRICK_3) {
                        this.grid.set(gx, gy, BRICK_2);
                    }
                } else {
                    // Fireball destroys everything
                    this.grid.set(gx, gy, EMPTY);
                    destroyed = true;
                }
                
                this.score += 100;
                this.status$.next(`Score: ${this.score}`);
                this.audio.playMatch();
                const color = (cell === BRICK_3) ? 0xFFD700 : (cell === BRICK_2 ? 0xC0C0C0 : 0xFF0000);
                this.effects$.next({ type: 'PARTICLE', x: gx, y: gy, color, style: 'EXPLODE' });
                
                if (destroyed) {
                    this.checkLevelComplete();
                    // Spawn Powerup (20% chance)
                    if (Math.random() < 0.25) {
                        const rand = Math.floor(Math.random() * 8);
                        let powerupType = POWERUP_WIDE;
                        if (rand === 0) powerupType = POWERUP_WIDE;
                        else if (rand === 1) powerupType = POWERUP_SLOW;
                        else if (rand === 2) powerupType = POWERUP_FAST;
                        else if (rand === 3) powerupType = POWERUP_BIG;
                        else if (rand === 4) powerupType = POWERDOWN_TINY;
                        else if (rand === 5) powerupType = POWERUP_FIRE;
                        else if (rand === 6) powerupType = POWERUP_MULTI;
                        else {
                            powerupType = POWERDOWN_SMALL;
                        }
                        this.powerups.push({
                            x: gx,
                            y: gy,
                            type: powerupType,
                            vy: -5.0, // Initial vertical velocity for falling
                            id: this.uid()
                        });
                    }
                }
            }
        }

            ball.x = nextX;
            ball.y = nextY;

        }

        // Fireball cooldown
        if (this.isFireball) {
            this.fireballTimer -= dt;
            if (this.fireballTimer <= 0) this.isFireball = false;
        }

        if (this.gameRunning && this.balls.length === 0) {
            this.isGameOver = true;
            this.status$.next('Game Over! Press SELECT');
            this.audio.playGameOver();
            this.gameLoop.stop();
        }
        

        // Update Powerups
        for (let i = this.powerups.length - 1; i >= 0; i--) {
            const p = this.powerups[i];
            p.y -= 5.0 * dt; // Fall speed
            
            // Collect
            if (p.y < 1 && p.y > 0 && Math.abs(p.x - this.paddle.x) < (this.paddleWidth / 2 + 0.5)) {
                this.applyPowerup(p.type);
                this.powerups.splice(i, 1);
            } 
            // Miss
            else if (p.y < -1) {
                this.powerups.splice(i, 1);
            }
        }

        this.emit();
    }

    checkLevelComplete() {
        let bricksLeft = 0;
        for(let x=0; x<this.width; x++) for(let y=0; y<this.height; y++) {
            const c = this.grid.get(x, y);
            if (c === BRICK || c === BRICK_2 || c === BRICK_3) bricksLeft++;
        }
        if (bricksLeft === 0) {
            this.handleLevelComplete();
        }
    }

    normalizeBallVelocity(ball: Ball) {
        // Normalize vector and apply current speed
        const len = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
        if (len === 0) return;
        ball.vx = (ball.vx / len) * ball.speed;
        ball.vy = (ball.vy / len) * ball.speed;
    }

    applyPowerup(type: number) {
        this.score += 50;
        this.audio.playSelect();

        if (type === POWERUP_WIDE) {
            this.status$.next('WIDE PADDLE');
            this.paddleWidth = Math.min(this.paddleWidth + 2, 7);
        } else if (type === POWERDOWN_SMALL) {
            this.status$.next('SMALL PADDLE');
            this.paddleWidth = Math.max(3, this.paddleWidth - 2);
        } else if (type === POWERUP_SLOW) {
            this.status$.next('SLOW BALL');
            this.ballSpeedMult = Math.max(0.5, this.ballSpeedMult * 0.8);
            this.balls.forEach(b => {
                b.speed = (6.0 + (this.level * 1.0)) * this.ballSpeedMult;
                this.normalizeBallVelocity(b);
            });
        } else if (type === POWERUP_FAST) {
            this.status$.next('FAST BALL');
            this.ballSpeedMult = Math.min(2.0, this.ballSpeedMult * 1.2);
            this.balls.forEach(b => {
                b.speed = (6.0 + (this.level * 1.0)) * this.ballSpeedMult;
                this.normalizeBallVelocity(b);
            });
        } else if (type === POWERUP_BIG) {
            this.status$.next('BIG BALL');
            this.currentBallRadius = 0.5;
            this.balls.forEach(b => b.radius = this.currentBallRadius);
        } else if (type === POWERDOWN_TINY) {
            this.status$.next('TINY BALL');
            this.currentBallRadius = 0.2; // Increased from 0.15
            this.balls.forEach(b => b.radius = this.currentBallRadius);
        } else if (type === POWERUP_FIRE) {
            this.status$.next('FIREBALL!');
            this.isFireball = true;
            this.fireballTimer = 5.0; // 5 seconds
        } else if (type === POWERUP_MULTI) {
            this.status$.next('MULTIBALL!');
            const newBalls: Ball[] = [];
            this.balls.forEach(b => {
                const clone = { ...b };
                // Deflect slightly to separate
                clone.vx = -b.vx + (Math.random() * 0.2 - 0.1);
                this.normalizeBallVelocity(clone);
                newBalls.push(clone);
            });
            this.balls.push(...newBalls);
        }
        
        if (type === POWERUP_WIDE || type === POWERDOWN_SMALL) {
            const wings = (this.paddleWidth - 1) / 2;
            const minX = 1 + wings;
            const maxX = (this.width - 2) - wings;
            this.paddle.x = Math.max(minX, Math.min(maxX, this.paddle.x));
        }
    }

    handleLevelComplete() {
        this.level++;
        this.status$.next(`Level ${this.level}! Speed Up!`);
        this.audio.playMatch();
        this.gameLoop.stop();
        setTimeout(() => this.startLevel(), 2000);
    }

    emit() {
        const items: GameItem[] = [];

        // Bricks
        for(let x=0; x<this.width; x++) for(let y=0; y<this.height; y++) {
            const t = this.grid.get(x, y);
            if (t === BRICK || t === BRICK_2 || t === BRICK_3) {
                let color = 0xFF0000;
                if (t === BRICK_2) color = 0xC0C0C0; // Silver
                if (t === BRICK_3) color = 0xFFD700; // Gold
                items.push({ id: `b_${x}_${y}`, x, y, type: BRICK, color });
            }
        }

        // Walls (Visual Outline)
        for(let y=0; y<this.height; y++) {
            items.push({ id: `w_l_${y}`, x: 0, y, type: WALL });
            items.push({ id: `w_r_${y}`, x: this.width - 1, y, type: WALL });
        }
        for(let x=1; x<this.width-1; x++) {
            items.push({ id: `w_t_${x}`, x, y: this.height - 1, type: WALL });
        }

        // Paddle (Dynamic width)
        const wings = (this.paddleWidth - 1) / 2;
        for(let i = -wings; i <= wings; i++) {
            items.push({ id: `pad_${i}`, x: this.paddle.x + i, y: this.paddle.y + 0.5, type: PADDLE });
        }

        // Balls
        this.balls.forEach((ball, idx) => {
        let ballColor = 0xFFFFFF;
            if (this.isFireball) ballColor = 0xFF4400;
            else if (ball.speed > 0.4) ballColor = 0xFF8800;
            else if (ball.speed < 0.2) ballColor = 0x88FFFF;

            items.push({ id: `ball_${idx}`, x: ball.x, y: ball.y, type: BALL, color: ballColor, scale: ball.radius / 0.3 });
        });

        // Powerups
        this.powerups.forEach(p => {
            items.push({ id: p.id, x: p.x, y: p.y, type: p.type, rotation: {x: 0, y: Date.now() * 0.005, z: 0} });
        });

        this.state$.next(items);
    }

    getRenderConfig() {
        return {
            geometry: 'box' as const,
            colors: {
                1: 0xFF0000, // Brick (Red)
                2: 0x00FFFF, // Paddle (Cyan)
                3: 0xFFFFFF, // Ball (White)
                4: 0x555555, // Wall (Grey)
                5: 0x00FF00, // Wide Paddle (Green)
                6: 0x0088FF, // Slow Ball (Blue)
                7: 0xFF00FF, // Small Paddle (Magenta)
                8: 0xFF8800, // Fast Ball (Orange)
                9: 0xFFFF00, // Big Ball (Yellow)
                10: 0x8800FF, // Tiny Ball (Purple)
                11: 0xFF0000, // Fireball (Red)
                12: 0xCCCCCC, // Multiball (Silver)
            },
            bgColor: 0x111111,
            customGeometry: (type: number) => {
                if (type === BRICK) return new THREE.BoxGeometry(0.9, 0.5, 0.5);
                if (type === PADDLE) return new THREE.BoxGeometry(1, 0.5, 0.5);
                if (type === BALL) return new THREE.SphereGeometry(0.3);
                if (type === WALL) return new THREE.BoxGeometry(1, 1, 0.5);
                if (type >= POWERUP_WIDE && type <= POWERUP_MULTI) return new THREE.BoxGeometry(0.9, 0.5, 0.5);
                return null;
            }
        }
    }
}