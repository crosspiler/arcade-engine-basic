
import { GameModel } from './GameModel';
import type { SoundEmitter } from '../engine/types';

const DEBUG_HANDLERS: Record<string, (game: GameModel) => void> = {
    // A single, generic handler that calls the game's own debug method.
    default: (game) => {
        // Check if the game instance has implemented its own debug action.
        if (typeof (game as any).debugAction === 'function') {
            (game as any).debugAction();
        }
    }
};

export interface GameDefinition {
    id: string;
    name: string;
    // The class is now loaded via a dynamic import function
    loader: () => Promise<{ default: new (audio?: SoundEmitter) => GameModel }>;
    debug?: (game: GameModel) => void;
}

// The single source of truth for all games
const ALL_GAMES: GameDefinition[] = [
    { id: 'snake', name: 'Snake', loader: () => import('./Snake') as any, debug: DEBUG_HANDLERS.default },
    { id: 'sokoban', name: 'Sokoban', loader: () => import('./Sokoban'), debug: DEBUG_HANDLERS.default },
    { id: 'match3', name: 'Match-3', loader: () => import('./Match3'), debug: DEBUG_HANDLERS.default},
    { id: 'tetris', name: 'Tetris', loader: () => import('./Tetris'), debug: DEBUG_HANDLERS.default },
    { id: '2048', name: '2048', loader: () => import('./Game2048'), debug: DEBUG_HANDLERS.default },
    { id: 'lightsout', name: 'Lights Out', loader: () => import('./LightsOut'), debug: DEBUG_HANDLERS.default },
    { id: 'minesweeper', name: 'Minesweeper', loader: () => import('./Minesweeper'), debug: DEBUG_HANDLERS.default },
    { id: 'memory', name: 'Memory', loader: () => import('./Memory'), debug: DEBUG_HANDLERS.default },
    { id: 'simon', name: 'Simon', loader: () => import('./Simon'), debug: DEBUG_HANDLERS.default },
    { id: 'tictactoe', name: 'Tic Tac Toe', loader: () => import('./TicTacToe'), debug: DEBUG_HANDLERS.default },
    { id: 'sliding', name: 'Sliding Puzzle', loader: () => import('./SlidingPuzzle'), debug: DEBUG_HANDLERS.default },
    { id: 'whackamole', name: 'Whack-A-Mole', loader: () => import('./WhackAMole'), debug: DEBUG_HANDLERS.default },
    { id: 'samegame', name: 'SameGame', loader: () => import('./SameGame'), debug: DEBUG_HANDLERS.default },
    { id: 'mazerun', name: 'Maze Run', loader: () => import('./MazeRun'), debug: DEBUG_HANDLERS.default },
    { id: 'sudoku', name: 'Sudoku', loader: () => import('./Sudoku'), debug: DEBUG_HANDLERS.default },
    { id: 'crossword', name: 'Mini Crossword', loader: () => import('./Crossword'), debug: DEBUG_HANDLERS.default },
];


// Generate the registry map from the single source of truth
export const GAME_REGISTRY: Record<string, GameDefinition> = {};
ALL_GAMES.forEach(game => {
    GAME_REGISTRY[game.id] = game;
});

// Generate the game list for the UI from the single source of truth
export const GAME_LIST = ALL_GAMES.map(({ id, name }) => ({ id, name }));

// Generate the game IDs list
export const GAME_IDS = ALL_GAMES.map(g => g.id);
