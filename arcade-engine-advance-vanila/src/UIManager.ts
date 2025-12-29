import { Scene } from '@babylonjs/core';
import { AdvancedDynamicTexture, TextBlock } from '@babylonjs/gui';

export class UIManager {
    private scene: Scene;
    private advancedTexture: AdvancedDynamicTexture;
    private scoreText: TextBlock;
    private gameOverText: TextBlock;

    constructor(scene: Scene) {
        this.scene = scene;
        this.advancedTexture = AdvancedDynamicTexture.CreateFullscreenUI("UI", true, this.scene);

        this.scoreText = new TextBlock();
        this.scoreText.text = "Score: 0";
        this.scoreText.color = "white";
        this.scoreText.fontSize = 24;
        this.scoreText.textHorizontalAlignment = TextBlock.HORIZONTAL_ALIGNMENT_LEFT;
        this.scoreText.textVerticalAlignment = TextBlock.VERTICAL_ALIGNMENT_TOP;
        this.scoreText.paddingTop = "10px";
        this.scoreText.paddingLeft = "10px";
        this.advancedTexture.addControl(this.scoreText);

        this.gameOverText = new TextBlock();
        this.gameOverText.text = "Game Over";
        this.gameOverText.color = "red";
        this.gameOverText.fontSize = 96;
        this.gameOverText.isVisible = false;
        this.advancedTexture.addControl(this.gameOverText);
    }

    public updateScore(score: number) {
        this.scoreText.text = `Score: ${score}`;
    }

    public showGameOver() {
        this.gameOverText.isVisible = true;
    }
}
