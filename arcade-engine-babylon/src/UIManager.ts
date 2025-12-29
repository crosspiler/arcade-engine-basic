import { Scene } from '@babylonjs/core/scene';
import { AdvancedDynamicTexture, TextBlock } from '@babylonjs/gui/2D';

export class UIManager {
    private scene: Scene;
    private advancedTexture: AdvancedDynamicTexture;
    private scoreText: TextBlock;
    private gameOverText: TextBlock;
    private instructionsText: TextBlock;

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
        this.gameOverText.text = "";
        this.gameOverText.color = "red";
        this.gameOverText.fontSize = 96;
        this.gameOverText.isVisible = false;
        this.advancedTexture.addControl(this.gameOverText);

        this.instructionsText = new TextBlock();
        this.instructionsText.text = "Tap on a lane to spawn a sheep";
        this.instructionsText.color = "white";
        this.instructionsText.fontSize = 24;
        this.instructionsText.textVerticalAlignment = TextBlock.VERTICAL_ALIGNMENT_BOTTOM;
        this.instructionsText.paddingBottom = "10px";
        this.advancedTexture.addControl(this.instructionsText);
    }

    public updateScore(score: number) {
        this.scoreText.text = `Score: ${score}`;
    }


    public showGameOver(message: string) {
        this.gameOverText.text = message;
        this.gameOverText.isVisible = true;
        this.instructionsText.isVisible = false;
    }
}
