import { Engine } from './Engine';
import { GameScene } from './games/sheep-fight/GameScene';

const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
const engine = new Engine(canvas);

// Create the game scene
const gameScene = new GameScene(engine.scene);
gameScene.create();


