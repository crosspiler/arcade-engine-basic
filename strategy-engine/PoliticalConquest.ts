import { Scene } from '@babylonjs/core/scene';
import { Engine } from '@babylonjs/core/Engines/engine';
import { Vector3, Color3, Color4 } from '@babylonjs/core/Maths/math';
import { Matrix } from '@babylonjs/core/Maths/math.vector';
import { Ray } from '@babylonjs/core/Culling/ray';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents';
import { Animation } from '@babylonjs/core/Animations/animation';
import "@babylonjs/core/Animations/animatable";
import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock';
import { Control } from '@babylonjs/gui/2D/controls/control';
import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle';
import { StackPanel } from '@babylonjs/gui/2D/controls/stackPanel';
import { Button } from '@babylonjs/gui/2D/controls/button';
import { Mesh } from '@babylonjs/core/Meshes/mesh';

interface HexNode {
    id: string;
    q: number;
    r: number;
    level: number; // 0 = Core, 1 = Inner, 2 = Outer
    influence: number; // 0 to 100
    mesh: Mesh;
    material: StandardMaterial;
    neighbors: HexNode[];
    name: string;
    leader: string;
    defense: number;
    wealth: number;
}

export default class PoliticalConquest {
    private scene!: Scene;
    private camera!: ArcRotateCamera;
    private nodes: HexNode[] = [];
    private ui!: AdvancedDynamicTexture;
    private statusText!: TextBlock;
    private detailsPanel!: Rectangle;
    private detailsText!: TextBlock;
    private actionPanel!: StackPanel;

    // Game State
    private selectedNode: HexNode | null = null;
    private playerPower = 50; // Resource to spend

    createScene(engine: Engine, canvas: HTMLCanvasElement) {
        this.scene = new Scene(engine);
        this.scene.clearColor = new Color4(0.1, 0.1, 0.15, 1);

        // Camera
        this.camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 3, 15, Vector3.Zero(), this.scene);
        this.camera.attachControl(canvas, true);
        this.camera.lowerRadiusLimit = 5;
        this.camera.upperRadiusLimit = 30;
        this.camera.wheelPrecision = 50;
        this.camera.panningSensibility = 50; // Make panning faster (lower is faster)

        // Light
        new HemisphericLight("light", new Vector3(0, 1, 0), this.scene);

        // UI
        this.ui = AdvancedDynamicTexture.CreateFullscreenUI("UI", true, this.scene);
        this.statusText = new TextBlock();
        this.statusText.text = "Goal: Indoctrinate the Hierarchy (All Blue)";
        this.statusText.color = "white";
        this.statusText.fontSize = 24;
        this.statusText.top = "-45%";
        this.ui.addControl(this.statusText);

        // Details Panel (Right Side)
        this.detailsPanel = new Rectangle();
        this.detailsPanel.width = "300px";
        this.detailsPanel.height = "100%";
        this.detailsPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.detailsPanel.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
        this.detailsPanel.background = "#222222DD";
        this.detailsPanel.thickness = 0;
        this.detailsPanel.isVisible = false;
        this.ui.addControl(this.detailsPanel);

        const stack = new StackPanel();
        this.detailsPanel.addControl(stack);

        this.detailsText = new TextBlock();
        this.detailsText.text = "";
        this.detailsText.color = "white";
        this.detailsText.fontSize = 16;
        this.detailsText.height = "200px";
        this.detailsText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.detailsText.paddingLeft = "20px";
        stack.addControl(this.detailsText);

        this.actionPanel = new StackPanel();
        stack.addControl(this.actionPanel);

        // Generate Honeycomb Hierarchy
        this.generateHierarchy();

        // Interaction
        this.scene.onPointerObservable.add((pointerInfo) => {
            if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
                const ray = new Ray(Vector3.Zero(), Vector3.Zero());
                this.scene.createPickingRayToRef(this.scene.pointerX, this.scene.pointerY, Matrix.Identity(), ray, this.camera);
                const pickResult = this.scene.pickWithRay(ray);

                if (pickResult && pickResult.hit && pickResult.pickedMesh) {
                    const node = this.nodes.find(n => n.mesh === pickResult.pickedMesh);
                    if (node) {
                        this.handleNodeClick(node);
                    }
                }
            }
        });
    }

    generateHierarchy() {
        const hexRadius = 1.2;
        const levels = 3;

        // Helper: Axial to World
        const hexToWorld = (q: number, r: number) => {
            const x = hexRadius * (3/2 * q);
            const z = hexRadius * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);
            return new Vector3(x, 0, z);
        };

        // Generate Nodes
        // Level 0: Center (0,0)
        this.createNode(0, 0, 0, hexToWorld(0,0));

        // Level 1: Ring 1 (1 to 6)
        // Level 2: Ring 2 (7 to 18)
        for (let q = -2; q <= 2; q++) {
            for (let r = -2; r <= 2; r++) {
                const s = -q - r;
                const dist = Math.max(Math.abs(q), Math.abs(r), Math.abs(s));
                
                if (dist > 0 && dist <= 2) {
                    this.createNode(q, r, dist, hexToWorld(q, r));
                }
            }
        }

        // Build Connections (Neighbors)
        const directions = [
            {q: 1, r: 0}, {q: 1, r: -1}, {q: 0, r: -1},
            {q: -1, r: 0}, {q: -1, r: 1}, {q: 0, r: 1}
        ];

        this.nodes.forEach(node => {
            directions.forEach(dir => {
                const nQ = node.q + dir.q;
                const nR = node.r + dir.r;
                const neighbor = this.nodes.find(n => n.q === nQ && n.r === nR);
                if (neighbor) {
                    node.neighbors.push(neighbor);
                    // Visual Connection
                    if (node.q < neighbor.q || (node.q === neighbor.q && node.r < neighbor.r)) {
                        this.createConnection(node.mesh.position, neighbor.mesh.position);
                    }
                }
            });
        });
    }

    createNode(q: number, r: number, level: number, pos: Vector3) {
        const id = `node_${q}_${r}`;
        const mesh = MeshBuilder.CreateCylinder(id, { diameter: 2, height: 0.5, tessellation: 6 }, this.scene);
        mesh.position = pos;
        
        const mat = new StandardMaterial(`${id}_mat`, this.scene);
        // Initial State: Random Influence
        const influence = Math.floor(Math.random() * 50); 
        mat.diffuseColor = this.getInfluenceColor(influence);
        mesh.material = mat;

        // Label
        const label = new TextBlock();
        label.text = `${influence}%`;
        label.color = "white";
        label.fontSize = 14;
        label.isHitTestVisible = false;
        this.ui.addControl(label);
        label.linkWithMesh(mesh);
        label.linkOffsetY = -30;

        // Store
        const node: HexNode = {
            id, q, r, level, influence, mesh, material: mat, neighbors: [],
            name: `District ${q},${r}`,
            leader: this.getRandomLeaderName(),
            defense: 10 + Math.floor(Math.random() * 50),
            wealth: 100 + Math.floor(Math.random() * 500)
        };
        
        // Attach label update to node for easy access
        (node as any).label = label;
        
        this.nodes.push(node);
    }

    getRandomLeaderName() {
        const names = ["Viper", "Baron", "Duke", "Warlord", "Mayor", "General", "Bishop"];
        return names[Math.floor(Math.random() * names.length)] + " " + String.fromCharCode(65 + Math.floor(Math.random() * 26));
    }

    createConnection(p1: Vector3, p2: Vector3) {
        const line = MeshBuilder.CreateLines("line", { points: [p1, p2] }, this.scene);
        line.color = new Color3(0.3, 0.3, 0.3);
    }

    handleNodeClick(node: HexNode) {
        // Focus Camera
        const targetPos = node.mesh.position.clone();
        Animation.CreateAndStartAnimation("camFocus", this.camera, "target", 60, 30, this.camera.target, targetPos, Animation.ANIMATIONLOOPMODE_CONSTANT);
        Animation.CreateAndStartAnimation("camRadius", this.camera, "radius", 60, 30, this.camera.radius, 8, Animation.ANIMATIONLOOPMODE_CONSTANT);

        this.selectedNode = node;
        this.updateDetailsPanel();
    }

    updateDetailsPanel() {
        if (!this.selectedNode) return;
        const n = this.selectedNode;

        this.detailsPanel.isVisible = true;
        this.detailsText.text = `
DISTRICT: ${n.name}
LEADER: ${n.leader}
----------------
INFLUENCE: ${Math.round(n.influence)}%
DEFENSE: ${n.defense}
WEALTH: ${n.wealth}
----------------
PLAYER POWER: ${this.playerPower}
        `;

        // Clear old buttons
        this.actionPanel.clearControls();

        // Add Actions
        this.createActionButton("Propaganda (Cost: 10)", () => {
            if (this.playerPower >= 10) {
                this.playerPower -= 10;
                this.modifyInfluence(n, 20);
                n.neighbors.forEach(nb => this.modifyInfluence(nb, -5));
                this.updateDetailsPanel();
                this.checkWinCondition();
            }
        });

        this.createActionButton("Bribe (Cost: 25)", () => {
            if (this.playerPower >= 25) {
                this.playerPower -= 25;
                n.defense = Math.max(0, n.defense - 20);
                this.modifyInfluence(n, 10);
                this.updateDetailsPanel();
            }
        });
    }

    createActionButton(text: string, onClick: () => void) {
        const btn = Button.CreateSimpleButton("btn", text);
        btn.width = "280px";
        btn.height = "40px";
        btn.color = "white";
        btn.background = "#444444";
        btn.onPointerUpObservable.add(onClick);
        this.actionPanel.addControl(btn);
    }

    modifyInfluence(node: HexNode, amount: number) {
        node.influence = Math.max(0, Math.min(100, node.influence + amount));
        node.material.diffuseColor = this.getInfluenceColor(node.influence);
        (node as any).label.text = `${Math.round(node.influence)}%`;
        
        // Visual Pop
        const anim = new Animation("pop", "scaling", 60, Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CONSTANT);
        const keys = [
            { frame: 0, value: new Vector3(1, 1, 1) },
            { frame: 10, value: new Vector3(1.2, 1.2, 1.2) },
            { frame: 20, value: new Vector3(1, 1, 1) }
        ];
        anim.setKeys(keys);
        node.mesh.animations = [anim];
        this.scene.beginAnimation(node.mesh, 0, 20, false);
    }

    getInfluenceColor(val: number): Color3 {
        // Red (0) -> Purple (50) -> Blue (100)
        return Color3.Lerp(Color3.Red(), Color3.Blue(), val / 100);
    }

    checkWinCondition() {
        const allIndoctrinated = this.nodes.every(n => n.influence === 100);
        if (allIndoctrinated) {
            this.statusText.text = "HIERARCHY INDOCTRINATED! YOU WIN!";
            this.statusText.color = "#00FF00";
        } else {
            const avg = this.nodes.reduce((acc, n) => acc + n.influence, 0) / this.nodes.length;
            this.statusText.text = `Global Influence: ${Math.round(avg)}%`;
        }
    }

    render() {
        if (this.scene) {
            this.scene.render();
        }
    }
}