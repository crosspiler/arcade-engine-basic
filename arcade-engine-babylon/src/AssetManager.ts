import { Scene } from '@babylonjs/core/scene';
import { AssetsManager as BabylonAssetsManager } from '@babylonjs/core/Misc/assetsManager';

export class AssetManager {
    private scene: Scene;
    private babylonAssetsManager: BabylonAssetsManager;

    constructor(scene: Scene) {
        this.scene = scene;
        this.babylonAssetsManager = new BabylonAssetsManager(this.scene);
    }

    public load(onFinish: () => void) {
        this.babylonAssetsManager.onFinish = onFinish;
        this.babylonAssetsManager.load();
    }

    public addMeshTask(taskName: string, meshName: any, rootUrl: string, sceneFileName: string) {
        return this.babylonAssetsManager.addMeshTask(taskName, meshName, rootUrl, sceneFileName);
    }
}
