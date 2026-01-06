import Vector2 from "@/app/data/Vector2";
import {LineStyle} from "@/app/data/Graph";

export interface VertexData {
    id: number;
    label: string;

    x: number;
    y: number;

    neighbors: number[];

    color: string;
    lineStyle: LineStyle;
}

export class Vertex {
    public id: number = -1;
    public label: string;
    public position: Vector2;

    public color: string = 'white';
    public lineStyle: LineStyle = {color: "black", weight: 'normal', type: 'solid'};

    public neighbors: Set<number> = new Set<number>();

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
    public subgraphFilter(vertices: Set<number>): void {
        // remove neighbors not in the vertices set
        for(const n of this.neighbors) {
            if(vertices.has(n)) continue;
            this.neighbors.delete(n);
        }
    }

    /** filter edges based on subgraph vertices */
    public subgraphFilterArray(vertices: number[]): void {
        // remove neighbors not in the vertices set
        for(const n of this.neighbors) {
            if(vertices.includes(n)) continue;
            this.neighbors.delete(n);
        }
    }

    public static Vertex(position: Vector2): Vertex {
        const vertex = new Vertex();
        vertex.position = position;
        return vertex;
    }

    public static VertexFromData(data: VertexData): Vertex {
        const vertex = new Vertex();
        vertex.id = data.id;
        vertex.label = data.label;
        vertex.position = new Vector2(data.x, data.y);
        return vertex;
    }

    public VertexToData(): VertexData {
        return {
            id: this.id,
            label: this.label,
            x: this.position.x,
            y: this.position.y,

            neighbors: Array.from(this.neighbors).filter(to => to >= this.id),

            color: this.color,
            lineStyle: this.lineStyle,
        };
    }
}