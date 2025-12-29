// src/games/MahjongSolitaire.ts
import { GameModel } from './GameModel';
import { GridCursorInteraction } from '../engine/features/interactionSystems/GridCursorInteraction';
import type { GameItem, InputAction, SoundEmitter } from '../engine/types';
import * as THREE from 'three';

// Classic Stacked Mahjong Solitaire

const CURSOR = 100;
const SELECTED = 101;
const BLOCKED = 102;
const NUM_TILE_TYPES = 16;

interface Tile {
    id: string;
    x: number;
    y: number;
    z: number;
    type: number;
    visible: boolean;
}

export default class MahjongSolitaire extends GameModel {
    tiles: Tile[] = [];
    selectedTileId: string | null = null;
    matches = 0;
    totalPairs = 0;
    interaction: GridCursorInteraction;
    
    constructor(audio?: SoundEmitter) {
        // 14x14 grid to accommodate the pyramid layout
        super(14, 14, 'mahjong', audio);
        this.interaction = new GridCursorInteraction({
            width: 14,
            height: 14,
            onAction: (x, y) => this.handleAction(x, y),
            onStartLevel: () => this.startLevel()
        });
    }

    start() {
        this.startLevel();
    }

    startLevel() {
        this.isGameOver = false;
        this.matches = 0;
        this.selectedTileId = null;
        this.interaction.cursor = {x: 6, y: 6};
        this.tiles = [];
        
        this.generateLayout();

        this.status$.next('Select matching free tiles');
        this.emit();
    }

    generateLayout() {
        // Define a Pyramid-like layout
        // We use 1x1 tiles for simplicity in this grid engine
        const positions: {x: number, y: number, z: number}[] = [];
        
        // Layer 0: 8x8 base (centered at 14x14 grid -> offset 3,3)
        for(let x=0; x<8; x++) for(let y=0; y<8; y++) positions.push({x: x+3, y: y+3, z: 0});
        
        // Layer 1: 6x6
        for(let x=0; x<6; x++) for(let y=0; y<6; y++) positions.push({x: x+4, y: y+4, z: 1});
        
        // Layer 2: 4x4
        for(let x=0; x<4; x++) for(let y=0; y<4; y++) positions.push({x: x+5, y: y+5, z: 2});
        
        // Layer 3: 2x2
        for(let x=0; x<2; x++) for(let y=0; y<2; y++) positions.push({x: x+6, y: y+6, z: 3});
        
        // Layer 4: 1 tile on top
        positions.push({x: 6, y: 6, z: 4}); // Top-left of center 2x2
        
        // Total tiles: 64 + 36 + 16 + 4 + 1 = 121. 
        // We need an even number. Let's remove the top one to make it 120.
        positions.pop();

        this.totalPairs = positions.length / 2;
        const types: number[] = [];
        
        // Fill types
        for(let i=0; i<this.totalPairs; i++) {
            const t = (i % NUM_TILE_TYPES) + 1;
            types.push(t);
            types.push(t);
        }
        
        // Shuffle types
        for (let i = types.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [types[i], types[j]] = [types[j], types[i]];
        }

        // Create Tiles
        for(let i=0; i<positions.length; i++) {
            const p = positions[i];
            this.tiles.push({
                id: `tile_${i}`,
                x: p.x,
                y: p.y,
                z: p.z,
                type: types[i],
                visible: true
            });
        }
    }

    handleInput(action: InputAction) {
        const changed = this.interaction.handleInput(action, this.isGameOver);
        if (changed) this.emit();
    }

    getTopTileAt(x: number, y: number): Tile | null {
        let top: Tile | null = null;
        for (const t of this.tiles) {
            if (t.visible && t.x === x && t.y === y) {
                if (!top || t.z > top.z) top = t;
            }
        }
        return top;
    }

    isFree(tile: Tile): boolean {
        // 1. Check if covered (tile at z+1)
        const covered = this.tiles.some(t => t.visible && t.z === tile.z + 1 && t.x === tile.x && t.y === tile.y);
        if (covered) return false;

        // 2. Check sides (Left OR Right must be empty)
        // In this 1x1 grid model, we check x-1 and x+1 at the same Z level
        const leftBlocked = this.tiles.some(t => t.visible && t.z === tile.z && t.x === tile.x - 1 && t.y === tile.y);
        const rightBlocked = this.tiles.some(t => t.visible && t.z === tile.z && t.x === tile.x + 1 && t.y === tile.y);

        // If both sides are blocked, the tile is blocked.
        // If at least one side is free, the tile is free.
        return !(leftBlocked && rightBlocked);
    }

    handleAction(x: number, y: number) {
        const tile = this.getTopTileAt(x, y);
        if (!tile) return;

        if (!this.isFree(tile)) {
            this.audio.playTone(150, 'sawtooth', 0.1); // Error
            return;
        }

        if (this.selectedTileId === null) {
            this.selectedTileId = tile.id;
            this.audio.playSelect();
        } else {
            if (this.selectedTileId === tile.id) {
                this.selectedTileId = null; // Deselect
            } else {
                const selectedTile = this.tiles.find(t => t.id === this.selectedTileId);
                if (selectedTile && selectedTile.type === tile.type) {
                    // Match!
                    selectedTile.visible = false;
                    tile.visible = false;
                    this.selectedTileId = null;
                    this.matches++;
                    this.audio.playMatch();
                    this.effects$.next({ type: 'PARTICLE', x: tile.x, y: tile.y, color: 0xffff00, style: 'PUFF' });
                    
                    if (this.matches >= this.totalPairs) {
                        this.handleWin();
                    }
                } else {
                    // Mismatch - switch selection
                    this.selectedTileId = tile.id;
                    this.audio.playSelect();
                }
            }
        }
    }

    handleWin() {
        this.isGameOver = true;
        this.status$.next('CLEARED! Press SELECT');
        this.effects$.next({ type: 'PARTICLE', x: this.width/2, y: this.height/2, color: 0xFFD700, style: 'CONFETTI' });
    }

    emit() {
        const items: GameItem[] = [];

        // Render Tiles
        this.tiles.forEach(t => {
            if (t.visible) {
                const isSelected = t.id === this.selectedTileId;
                items.push({ 
                    id: t.id, 
                    x: t.x, 
                    y: t.y, 
                    type: isSelected ? SELECTED : t.type, 
                    z: t.z // Pass Z to SceneEntityManager
                } as any);
            }
        });

        // Cursor (on top of the highest tile at cursor pos)
        if (!this.isGameOver) {
            const top = this.getTopTileAt(this.interaction.cursor.x, this.interaction.cursor.y);
            // If there is a tile, place cursor at its Z. If empty, Z=0.
            const z = top ? top.z : 0;
            const isBlocked = top ? !this.isFree(top) : false;
            
            items.push({ 
                id: 'cursor', 
                x: this.interaction.cursor.x, 
                y: this.interaction.cursor.y, 
                z, 
                type: isBlocked ? BLOCKED : CURSOR 
            } as any);
        }

        this.state$.next(items);
    }

    getRenderConfig() {
        const colors: Record<number, number> = {
            100: 0xFFFF00, // Cursor (Yellow)
            101: 0xFFFF00, // Selected (Yellow)
            102: 0xFF0000, // Blocked Cursor (Red)
        };
        
        // Generate colors for tiles
        const baseColors = [
            0xFF0000, 0x00FF00, 0x0000FF, 0xFFFF00, 
            0x00FFFF, 0xFF00FF, 0xC0C0C0, 0x800000,
            0x808000, 0x008000, 0x800080, 0x008080,
            0x000080, 0xFFA500, 0xA52A2A, 0xDEB887
        ];
        
        for(let i=1; i<=NUM_TILE_TYPES; i++) {
            colors[i] = baseColors[(i-1) % baseColors.length];
        }

        return {
            geometry: 'box' as const,
            colors,
            bgColor: 0x222222,
            customGeometry: (type: number) => {
                // Cursor is now a Box that is slightly larger (0.9) than a standard tile (0.8)
                // This creates the "Outer Boundary" effect.
                if (type === CURSOR) return new THREE.BoxGeometry(0.9, 0.9, 0.1);
                if (type === BLOCKED) return new THREE.BoxGeometry(0.9, 0.9, 0.1);
                if (type === SELECTED) return new THREE.BoxGeometry(0.85, 0.85, 0.25);
                if (type >= 1 && type <= NUM_TILE_TYPES) return new THREE.BoxGeometry(0.8, 0.8, 0.25);
                return null;
            }
        }
    }
}