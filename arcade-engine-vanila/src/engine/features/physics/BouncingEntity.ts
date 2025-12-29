export interface Entity {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
}

export class BouncingEntity {
    static update(entity: Entity, dt: number) {
        entity.x += entity.vx * dt;
        entity.y += entity.vy * dt;
    }

    static bounceBounds(entity: Entity, width: number, height: number, offset: number = 0): boolean {
        let bounced = false;
        const r = entity.radius + offset;

        if (entity.x < r) { entity.x = r; entity.vx = Math.abs(entity.vx); bounced = true; }
        if (entity.x > width - 1 - r) { entity.x = width - 1 - r; entity.vx = -Math.abs(entity.vx); bounced = true; }
        
        if (entity.y < r) { entity.y = r; entity.vy = Math.abs(entity.vy); bounced = true; }
        if (entity.y > height - 1 - r) { entity.y = height - 1 - r; entity.vy = -Math.abs(entity.vy); bounced = true; }

        return bounced;
    }
}