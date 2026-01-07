export default class Vector2 {
    public x: number;
    public y: number;

    constructor(x: number, y: number) {
        this.x = x;
        this.y = y;
    }

    public toString() : string {
        return `(${this.x}, ${this.y})`;
    }

    public toStringFraction(fractionDigits: number) : string {
        return `(${this.x.toFixed(fractionDigits)}, ${this.y.toFixed(fractionDigits)})`;
    }
}
