import Vector2 from "@/app/data/Vector2";
import {LineStyle, VertexStyleDefault} from "@/app/data/Graph";

export interface VertexData {
    id: number;
    label: string;
    disabled: boolean;

    x: number;
    y: number;

    neighbors: number[];

    style: VertexStyle;
}

export type VertexShowOptions = 'id:label' | 'id' | 'label' | 'none';

export interface VertexStyle {
    show: VertexShowOptions;
    radius: number;
    textColor: string;
    bgColor: string;
    lineStyle: LineStyle;
}
export function VertexStyleClone(style: VertexStyle): VertexStyle {
    if(style === undefined) return VertexStyleDefault();
    return JSON.parse(JSON.stringify(style));
}

export class Vertex {
    public id: number = -1;
    public label: string;
    public position: Vector2;
    public disabled: boolean;

    public style: VertexStyle;

    public neighbors: Set<number> = new Set<number>();

    /** version number. Only visually update the vertex if version changed */
    public version: number = 0;

    public static SortByDegreeDescending(a: Vertex, b: Vertex): number {
        return b.degree() - a.degree();
    }

    /** returns the degree of a vertex (number of neighbors) */
    public degree(): number {
        return this.neighbors.size;
    }

    /** returns TRUE iff this vertex has `to` as a neighbor */
    public edgeHas(to: Vertex): boolean {
        return this.neighbors.has(to.id);
    }

    /** add an edge. to: vertexId of the end point */
    public edgeAdd(to: Vertex): void {
        this.neighbors.add(to.id);
    }

    /** remove an edge. to: vertexId of the end point */
    public edgeRemove(to: Vertex): void {
        this.neighbors.delete(to.id);
    }

    private constructor() {
    }

    public equals(to: Vertex): boolean {
        return this.id === to?.id;
    }

    /** make a copy of a vertex */
    public clone(): Vertex {
        const vertex = new Vertex();

        vertex.id = this.id;
        vertex.label = this.label;
        vertex.position = this.position;

        for(const n of this.neighbors) {
            vertex.neighbors.add(n);
        }

        return vertex;
    }

    /** filter edges based on subgraph vertices */
    public subgraphFilter(vertices: number[]): void {
        // remove neighbors not in the vertices set
        for(const n of this.neighbors) {
            if(vertices.includes(n)) continue;
            this.neighbors.delete(n);
        }
    }

    public static Vertex(position: Vector2): Vertex {
        const vertex = new Vertex();
        vertex.position = position;
        vertex.style = VertexStyleDefault();
        return vertex;
    }

    public static VertexFromData(data: VertexData): Vertex {
        const vertex = new Vertex();
        vertex.id = data.id;
        vertex.label = data.label;
        vertex.disabled = data.disabled ?? false;
        vertex.position = new Vector2(data.x, data.y);
        vertex.style = data.style ?? VertexStyleDefault();
        return vertex;
    }

    public VertexToData(): VertexData {
        return {
            id: this.id,
            label: this.label,
            disabled: this.disabled,

            x: this.position.x,
            y: this.position.y,

            neighbors: Array.from(this.neighbors).filter(to => to >= this.id),

            style: VertexStyleClone(this.style)
        };
    }
}