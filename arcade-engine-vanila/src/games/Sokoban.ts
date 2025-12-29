
import type { GameItem, InputAction, SoundEmitter } from '../engine/types';
import { GameModel } from './GameModel';
import { Grid } from '../engine/features/Grid';
import { DirectionalInteraction } from '../engine/features/interactionSystems/DirectionalInteraction';

export default class SokobanGame extends GameModel {
    playerPos = { x: 0, y: 0 };
    grid!: Grid<GameItem | null>;
    targets: { x: number, y: number }[] = [];
    interaction: DirectionalInteraction;

    constructor(audio?: SoundEmitter) {
        super(8, 8, 'sokoban', audio);
        this.grid = new Grid(8, 8, null);
        this.interaction = new DirectionalInteraction(
            (dx, dy) => this.handleMove(dx, dy),
            () => this.startLevel()
        );
    }

    start() {
        this.level = 1;
        this.startLevel();
    }

    startLevel() {
        this.isGameOver = false;
        const size = Math.min(12, 6 + Math.floor(this.level / 2));
        this.resize(size, size);
        this.generateLevel();
        this.status$.next(`Level ${this.level}`);
    }

    generateLevel() {
        this.grid = new Grid(this.width, this.height, null);
        this.targets = [];
        
        // 1. Create a room with walls
        for(let x=0; x<this.width; x++) for(let y=0; y<this.height; y++) {
            if (x===0 || x===this.width-1 || y===0 || y===this.height-1) {
                this.grid.set(x, y, { id: `w_${x}_${y}`, type: 1, x, y });
            }
        }

        // 2. Place Player randomly inside
        let px = Math.floor(Math.random() * (this.width-2)) + 1;
        let py = Math.floor(Math.random() * (this.height-2)) + 1;
        this.playerPos = { x: px, y: py };

        // 3. Place Targets (Boxes will be pulled FROM here)
        const numBoxes = Math.min(5, 2 + Math.floor(this.level/2));
        const tempTargets: {x:number, y:number}[] = [];
        
        while(tempTargets.length < numBoxes) {
            let tx = Math.floor(Math.random() * (this.width-4)) + 2;
            let ty = Math.floor(Math.random() * (this.height-4)) + 2;
            if((tx!==px || ty!==py) && !tempTargets.some(t => t.x===tx && t.y===ty)) {
                tempTargets.push({x:tx, y:ty});
                // We don't place them in grid yet, we place them logically
            }
        }

        // 4. Reverse play to pull boxes
        const dirs = [{x:0, y:1}, {x:0, y:-1}, {x:1, y:0}, {x:-1, y:0}];
        
        // Track box positions (initially at targets)
        const boxes = tempTargets.map(t => ({...t}));

        for(let i=0; i<numBoxes * 15; i++) {
            const bIdx = Math.floor(Math.random() * boxes.length);
            const box = boxes[bIdx];
            const dir = dirs[Math.floor(Math.random() * dirs.length)];
            
            const pullX = box.x + dir.x;
            const pullY = box.y + dir.y;
            const playerX = box.x + 2*dir.x;
            const playerY = box.y + 2*dir.y;

            if (pullX > 0 && pullX < this.width-1 && pullY > 0 && pullY < this.height-1 &&
                playerX > 0 && playerX < this.width-1 && playerY > 0 && playerY < this.height-1) {
                
                // Check collisions
                const obs1 = this.grid.get(pullX, pullY);
                const obs2 = this.grid.get(playerX, playerY);
                const boxAtPull = boxes.some(b => b.x === pullX && b.y === pullY);
                const boxAtPlayer = boxes.some(b => b.x === playerX && b.y === playerY);

                if (!obs1 && !obs2 && !boxAtPull && !boxAtPlayer) {
                    box.x = pullX;
                    box.y = pullY;
                    this.playerPos = { x: playerX, y: playerY };
                }
            }
        }

        // Update Grid and save targets
        this.targets = tempTargets;

        // Clear previous box/target markers inside the walls
        for(let x=1; x<this.width-1; x++) for(let y=1; y<this.height-1; y++) this.grid.set(x, y, null);
        
        this.targets.forEach(t => {
            this.grid.set(t.x, t.y, { id: `t_${t.x}_${t.y}`, type: 4, x: t.x, y: t.y });
        });

        boxes.forEach((b, i) => {
            const onTarget = this.isTarget(b.x, b.y);
            this.grid.set(b.x, b.y, { id: `b_${i}`, type: onTarget ? 5 : 2, x: b.x, y: b.y });
        });

        this.emit();
    }

    handleInput(action: InputAction) {
        this.interaction.handleInput(action, this.isGameOver);
    }

    handleMove(dx: number, dy: number) {
        const tx = this.playerPos.x + dx;
        const ty = this.playerPos.y + dy;

        if (this.isWall(tx, ty)) return;

        const p = this.grid.get(tx, ty);
        if (p && (p.type === 2 || p.type === 5)) {
            // Pushing a box
            const px = tx + dx;
            const py = ty + dy;
            const nextP = this.grid.get(px, py);
            if (this.isWall(px, py) || (nextP && (nextP.type === 2 || nextP.type === 5))) return;
            
            this.move(tx, ty, px, py);
            // Check new pos
            const isT = this.isTarget(px, py);
            this.grid[px][py]!.type = isT ? 5 : 2;
            this.audio.playMove();
        }

        this.move(this.playerPos.x, this.playerPos.y, tx, ty);
        this.playerPos = { x: tx, y: ty };
        this.subStat++;
        this.subStat$.next(this.subStat);
        this.emit();
        
        this.checkWin();
    }
    
    checkWin() {
        // Check if every target position has a box on it (type 5)
        const allTargetsFilled = this.targets.every(t => {
            const item = this.grid.get(t.x, t.y);
            return item && item.type === 5;
        });

        if(allTargetsFilled && this.targets.length > 0) {
            this.handleWin();
        }
    }
    
    handleWin() {
        this.status$.next("LEVEL CLEARED!");
        this.updateScore(1000);
        this.audio.playMatch();
        this.effects$.next({ type: 'EXPLODE', x: this.width/2, y: this.height/2, color: 0x00ff00, style: 'EXPLODE' });
        setTimeout(() => {
            this.level++;
            this.startLevel();
        }, 1500);
    }

    // Standardized debug method
    debugAction() {
        this.handleWin();
    }

    move(x1: number, y1: number, x2: number, y2: number) {
        const item = this.grid.get(x1, y1);
        this.grid.set(x2, y2, item!);
        this.grid.set(x1, y1, null);
        if (item) {
            item.x = x2;
            item.y = y2;
        }
        // Restore target if we moved off one
        if (this.isTarget(x1, y1)) {
            this.grid.set(x1, y1, { id: `t_${x1}_${y1}`, type: 4, x: x1, y: y1 });
        }
    }

    isWall(x: number, y: number) {
        const cell = this.grid.get(x, y);
        return !this.grid.isValid(x, y) || (cell && cell.type === 1);
    }

    isTarget(x: number, y: number) {
        return this.targets.some(t => t.x === x && t.y === y);
    }
    
    emit() {
        const r: GameItem[] = [];
        this.grid.forEach((item, x, y) => {
            if (item) r.push({ ...item, x, y });
        });
        r.push({ id: 'p', type: 3, x: this.playerPos.x, y: this.playerPos.y });
        this.state$.next(r);
    }

    getRenderConfig() {
        return { 
            geometry: 'box' as const, 
            colors: { 1: 0x555555, 2: 0xcd853f, 3: 0x4dc9ff, 4: 0xff3333, 5: 0x00ff00 }, 
            bgColor: 0x111111 
        };
    }
}
