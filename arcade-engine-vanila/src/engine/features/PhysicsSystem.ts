export interface PhysicsBody {
    x: number;
    y: number;
    vx: number;
    vy: number;
}

export class PhysicsSystem {
    private bodies: PhysicsBody[] = [];

    add(body: PhysicsBody) {
        this.bodies.push(body);
    }

    remove(body: PhysicsBody) {
        const index = this.bodies.indexOf(body);
        if (index !== -1) {
            this.bodies.splice(index, 1);
        }
    }

    update(dt: number) {
        for (const body of this.bodies) {
            body.x += body.vx * dt;
            body.y += body.vy * dt;
        }
    }

    clear() {
        this.bodies = [];
    }
}