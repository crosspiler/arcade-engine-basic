
import { GameModel } from './GameModel';
import { GridCursorInteraction } from '../engine/features/interactionSystems/GridCursorInteraction';
import { Grid } from '../engine/features/Grid';
import type{ GameItem, InputAction, SoundEmitter } from '../engine/types';
import * as THREE from 'three';

const TYPE_CURSOR = 100;
const TYPE_SELECTED = 101;

export default class Match3Game extends GameModel {
    colors = [0xff595e, 0xffca3a, 0x8ac926, 0x1982c4, 0x6a4c93];
    grid!: Grid<GameItem | null>;
    selected: { x: number, y: number } | null = null;
    isLocked = false;
    interaction: GridCursorInteraction;

    constructor(audio?: SoundEmitter) {
        super(8, 8, 'match3', audio);
        this.grid = new Grid(8, 8, null);
        this.interaction = new GridCursorInteraction({
            width: 8,
            height: 8,
            onAction: (x, y) => this.handleAction(x, y),
            onStartLevel: () => this.startLevel()
        });
    }

    start() {
        this.startLevel();
    }

    startLevel() {
        this.isGameOver = false;
        this.selected = null;
        this.interaction.cursor = { x: 0, y: 0 };
        
        this.grid = new Grid(this.width, this.height, (x, y) => {
            return { id: this.uid(), type: Math.floor(Math.random() * 5), x, y };
        });
        // Initial clear of matches could go here, but keeping it simple as per original
        this.emit();
        this.status$.next('Pick a tile');
    }

    handleInput(action: InputAction) {
        const changed = this.interaction.handleInput(action, this.isGameOver);
        if (changed) this.emit();
    }

    handleAction(x: number, y: number) {
        if (this.isLocked) return;

        if (!this.selected) {
            this.selected = { x, y };
            this.audio.playSelect();
            this.status$.next('Select neighbor');
        } else {
            const dx = Math.abs(this.selected.x - x);
            const dy = Math.abs(this.selected.y - y);

            if (dx + dy === 1) {
                this.swap(this.selected.x, this.selected.y, x, y);
                this.selected = null;
                this.status$.next('Pick a tile');
            } else if (this.selected.x === x && this.selected.y === y) {
                this.selected = null;
                this.status$.next('Pick a tile');
            } else {
                // Change selection
                this.selected = { x, y };
                this.audio.playSelect();
                this.status$.next('Select neighbor');
            }
        }
    }

    async swap(x1: number, y1: number, x2: number, y2: number) {
        this.isLocked = true;
        this.audio.playMove();
        
        this.grid.swap(x1, y1, x2, y2);

        const c1 = this.grid.get(x1, y1);
        const c2 = this.grid.get(x2, y2);
        if (c1) { c1.x = x1; c1.y = y1; }
        if (c2) { c2.x = x2; c2.y = y2; }

        this.emit();
        await new Promise(r => setTimeout(r, 300));

        const m = this.findMatches();
        if (m.length) {
            this.subStat++;
            this.subStat$.next(this.subStat);
            await this.processMatches(m);
        } else {
            // Undo swap (swap back)
            this.grid.swap(x1, y1, x2, y2);
            const u1 = this.grid.get(x1, y1);
            const u2 = this.grid.get(x2, y2);
            if (u1) { u1.x = x1; u1.y = y1; }
            if (u2) { u2.x = x2; u2.y = y2; }
            this.emit();
            await new Promise(r => setTimeout(r, 300));
        }
        this.isLocked = false;
    }

    findMatches() {
        const m = new Set<GameItem>();
        const check = (x: number, y: number, dx: number, dy: number) => {
            const c1 = this.grid.get(x, y);
            const c2 = this.grid.get(x + dx, y + dy);
            const c3 = this.grid.get(x + dx * 2, y + dy * 2);
            if (c1 && c2 && c3 && c1.type === c2.type && c1.type === c3.type) {
                m.add(c1); m.add(c2); m.add(c3);
            }
        };
        for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width - 2; x++) check(x, y, 1, 0);
        for (let x = 0; x < this.width; x++) for (let y = 0; y < this.height - 2; y++) check(x, y, 0, 1);
        return Array.from(m);
    }

    async processMatches(matches: GameItem[]) {
        while (matches.length) {
            this.updateScore(matches.length * 10);
            this.audio.playMatch();
            matches.forEach(p => this.effects$.next({ 
                type: 'EXPLODE', 
                x: p.x, 
                y: p.y, 
                color: this.colors[p.type], 
                style: 'EXPLODE' 
            }));
            
            matches.forEach(p => (p as any).destroyed = true);
            this.emit();
            await new Promise(r => setTimeout(r, 300));

            for (let x = 0; x < this.width; x++) {
                let col = this.grid.getColumn(x).filter(p => p && !(p as any).destroyed);
                while (col.length < this.height) {
                    col.push({ id: this.uid(), type: Math.floor(Math.random() * 5), x: x, y: 0, spawnStyle: 'drop' });
                }
                for (let y = 0; y < this.height; y++) {
                    const item = col[y];
                    this.grid.set(x, y, item);
                    if(item) {
                        item.x = x;
                        item.y = y;
                    }
                }
            }
            this.emit();
            await new Promise(r => setTimeout(r, 400));
            matches = this.findMatches();
        }
    }

    // Standardized debug method
    debugAction() {
        this.updateScore(5000);
    }

    emit() {
        const r: GameItem[] = [];
        this.grid.forEach((cell, x, y) => {
            if(cell) {
                let color = this.colors[cell.type];
                // Tint Highlight: Brighten the gem under the cursor
                if (!this.isGameOver && x === this.interaction.cursor.x && y === this.interaction.cursor.y) {
                    const c = new THREE.Color(color);
                    c.offsetHSL(0, 0, 0.2); // Increase lightness
                    color = c.getHex();
                }
                // Pass explicit color to override default type-based color
                r.push({ ...cell, x, y, color });
            }
        });
        if (this.selected) r.push({ id: 'selected', type: TYPE_SELECTED, x: this.selected.x, y: this.selected.y });
        this.state$.next(r);
    }

    getRenderConfig() {
        return { 
            geometry: 'cylinder' as const, 
            colors: { 
                0: 0xff595e, 1: 0xffca3a, 2: 0x8ac926, 3: 0x1982c4, 4: 0x6a4c93,
                100: 0xffffff, 101: 0xffffff 
            }, 
            bgColor: 0x222222,
            customGeometry: (type: number) => {
                if (type === TYPE_SELECTED) return new THREE.BoxGeometry(1, 1, 0.1);
                return null;
            }
        };
    }
}
