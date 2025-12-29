import { Engine } from './Engine';
import { GameScene } from './games/sheep-fight/GameScene';

const main = async () => {
    const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
    
    canvas.addEventListener("pointerdown", () => {
        console.log("Canvas clicked");
    });

    const engine = new Engine(canvas);

    // Create the game scene
    const gameScene = new GameScene(engine.scene);
    await gameScene.create();
}

main();


