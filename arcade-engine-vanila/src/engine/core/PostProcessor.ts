import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { FilmPass } from 'three/examples/jsm/postprocessing/FilmPass.js';
import { GlitchPass } from 'three/examples/jsm/postprocessing/GlitchPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { RGBShiftShader } from 'three/examples/jsm/shaders/RGBShiftShader.js';
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js';

const CurvatureShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'curvature': { value: 0.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform float curvature;
        varying vec2 vUv;
        void main() {
            vec2 uv = vUv;
            uv = uv * 2.0 - 1.0;
            vec2 offset = uv.yx / 5.0;
            uv = uv + uv * offset * offset * curvature;
            uv = uv * 0.5 + 0.5;
            if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0)
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
            else
                gl_FragColor = texture2D(tDiffuse, uv);
        }
    `
};

const ColorDotScreenShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'tSize': { value: new THREE.Vector2(256, 256) },
        'center': { value: new THREE.Vector2(0.5, 0.5) },
        'angle': { value: 1.57 },
        'scale': { value: 1.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
    `,
    fragmentShader: `
        uniform vec2 center;
        uniform float angle;
        uniform float scale;
        uniform vec2 tSize;
        uniform sampler2D tDiffuse;
        varying vec2 vUv;

        float pattern() {
            float s = sin( angle ), c = cos( angle );
            vec2 tex = vUv * tSize - center;
            vec2 point = vec2( c * tex.x - s * tex.y, s * tex.x + c * tex.y ) * scale;
            return ( sin( point.x ) * sin( point.y ) ) * 4.0;
        }

        void main() {
            vec4 color = texture2D( tDiffuse, vUv );
            float p = pattern();
            vec3 c = color.rgb;
            vec3 colorPattern = c * 10.0 - 5.0 + p;
            gl_FragColor = vec4( colorPattern, color.a );
        }
    `
};

const ColorCorrectionShader = {
    uniforms: {
        'tDiffuse': { value: null },
        'tint': { value: new THREE.Color(0xffffff) },
        'grayscale': { value: 0.0 }
    },
    vertexShader: CurvatureShader.vertexShader, // Reuse simple vertex shader
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec3 tint;
        uniform float grayscale;
        varying vec2 vUv;
        void main() {
            vec4 color = texture2D( tDiffuse, vUv );
            float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
            vec3 finalColor = mix(color.rgb, vec3(gray), grayscale);
            finalColor *= tint;
            gl_FragColor = vec4( finalColor, color.a );
        }
    `
};

export class PostProcessor {
    private composer: EffectComposer;
    private renderPass: RenderPass;
    private bloomPass: UnrealBloomPass;
    private filmPass: FilmPass;
    private glitchPass: GlitchPass;
    private dotScreenPass: ShaderPass;
    private rgbShiftPass: ShaderPass;
    private afterimagePass: AfterimagePass;
    private curvaturePass: ShaderPass;
    private colorCorrectionPass: ShaderPass;
    private outputPass: OutputPass;

    constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, width: number, height: number) {
        this.composer = new EffectComposer(renderer);
        
        // 1. Render Pass (Base Scene)
        this.renderPass = new RenderPass(scene, camera);
        this.composer.addPass(this.renderPass);

        // 2. Bloom Pass
        this.bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height), 1.5, 0.4, 0.85);
        this.bloomPass.enabled = false; // Default off
        this.bloomPass.threshold = 0;
        this.bloomPass.strength = 1.5;
        this.bloomPass.radius = 0.5;
        this.composer.addPass(this.bloomPass);

        // 3. Film Pass (Grain/Scanlines)
        this.filmPass = new FilmPass(0.35, 0.05, height * 2, 0);
        this.filmPass.enabled = false; // Default off
        this.composer.addPass(this.filmPass);

        // 4. Glitch Pass
        this.glitchPass = new GlitchPass();
        this.glitchPass.enabled = false; // Default off
        this.composer.addPass(this.glitchPass);

        // 5. Dot Screen Pass
        this.dotScreenPass = new ShaderPass(ColorDotScreenShader);
        this.dotScreenPass.uniforms['scale'].value = 0.5;
        this.dotScreenPass.enabled = false;
        this.composer.addPass(this.dotScreenPass);

        // 6. RGB Shift Pass
        this.rgbShiftPass = new ShaderPass(RGBShiftShader);
        this.rgbShiftPass.uniforms['amount'].value = 0.005;
        this.rgbShiftPass.enabled = false;
        this.composer.addPass(this.rgbShiftPass);

        // 7. Afterimage Pass (Trails)
        this.afterimagePass = new AfterimagePass();
        this.afterimagePass.enabled = false;
        this.composer.addPass(this.afterimagePass);

        // 8. CRT Curvature Pass
        this.curvaturePass = new ShaderPass(CurvatureShader);
        this.curvaturePass.enabled = false;
        this.composer.addPass(this.curvaturePass);

        // 9. Color Correction Pass
        this.colorCorrectionPass = new ShaderPass(ColorCorrectionShader);
        this.colorCorrectionPass.enabled = true; // Always enabled for tint/gray
        this.composer.addPass(this.colorCorrectionPass);

        // 10. Output Pass (Tone Mapping / sRGB correction)
        this.outputPass = new OutputPass();
        this.composer.addPass(this.outputPass);

        // Pre-warm passes to ensure uniforms are created
        // This prevents "cannot set property of undefined" errors later
        const originalBloom = this.bloomPass.enabled;
        const originalFilm = this.filmPass.enabled;
        const originalGlitch = this.glitchPass.enabled;
        const originalDot = this.dotScreenPass.enabled;
        const originalRGB = this.rgbShiftPass.enabled;
        const originalAfter = this.afterimagePass.enabled;
        const originalCurve = this.curvaturePass.enabled;
        
        this.bloomPass.enabled = true;
        this.filmPass.enabled = true;
        this.glitchPass.enabled = true;
        this.dotScreenPass.enabled = true;
        this.rgbShiftPass.enabled = true;
        this.afterimagePass.enabled = true;
        this.curvaturePass.enabled = true;
        
        this.composer.render(0.01);
        
        this.bloomPass.enabled = originalBloom;
        this.filmPass.enabled = originalFilm;
        this.glitchPass.enabled = originalGlitch;
        this.dotScreenPass.enabled = originalDot;
        this.rgbShiftPass.enabled = originalRGB;
        this.afterimagePass.enabled = originalAfter;
        this.curvaturePass.enabled = originalCurve;
    }

    public setCamera(camera: THREE.Camera) {
        this.renderPass.camera = camera;
    }

    public setSize(width: number, height: number) {
        this.composer.setSize(width, height);
        // Update scanline count to match new height for 1:1 pixel mapping
        if (this.filmPass.uniforms.sCount) this.filmPass.uniforms.sCount.value = height * 2;
        if (this.dotScreenPass.uniforms.tSize) this.dotScreenPass.uniforms.tSize.value.set(width, height);
    }

    public render(deltaTime: number) {
        this.composer.render(deltaTime);
    }

    // --- Controls ---

    public setBloom(enabled: boolean, strength: number, radius: number, threshold: number) {
        this.bloomPass.enabled = enabled;
        this.bloomPass.strength = strength;
        this.bloomPass.radius = radius;
        this.bloomPass.threshold = threshold;
    }

    public setFilm(enabled: boolean, noise: number, scanlines: number) {
        this.filmPass.enabled = enabled;
        if (this.filmPass.uniforms.nIntensity) this.filmPass.uniforms.nIntensity.value = noise;
        if (this.filmPass.uniforms.sIntensity) this.filmPass.uniforms.sIntensity.value = scanlines;
    }

    public setGlitch(enabled: boolean) {
        this.glitchPass.enabled = enabled;
    }

    public setDotScreen(enabled: boolean, scale: number) {
        this.dotScreenPass.enabled = enabled;
        this.dotScreenPass.uniforms['scale'].value = scale;
    }

    public setRGBShift(enabled: boolean, amount: number) {
        this.rgbShiftPass.enabled = enabled;
        this.rgbShiftPass.uniforms['amount'].value = amount;
    }

    public setAfterimage(enabled: boolean, damp: number) {
        this.afterimagePass.enabled = enabled;
        this.afterimagePass.uniforms['damp'].value = damp;
    }

    public setCurvature(enabled: boolean, amount: number) {
        this.curvaturePass.enabled = enabled;
        this.curvaturePass.uniforms['curvature'].value = amount;
    }

    public setColorCorrection(tint: number, grayscale: number) {
        this.colorCorrectionPass.uniforms['tint'].value.setHex(tint);
        this.colorCorrectionPass.uniforms['grayscale'].value = grayscale;
    }
}