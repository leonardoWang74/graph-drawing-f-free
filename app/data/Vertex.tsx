import Vector2 from "@/app/data/Vector2";
import {LineStyle, LineStyleFromSave, LineStyleSave, LineStyleToSave, VertexStyleDefault} from "@/app/data/Graph";
import React from "react";

export interface VertexData {
    id: number;
    label?: string;
    disabled?: boolean;

    x: number;
    y: number;

    neighbors: number[];
    neighborsRemoved: number[];

    style: VertexStyleSave;
}

export interface VertexStyle {
    radius: number;
    textColor: string;
    textSize: number;
    bgColor: string;
    lineStyle: LineStyle;
}
export interface VertexStyleSave {
    radius?: number;
    textColor?: string;
    textSize?: number;
    bgColor?: string;
    lineStyle?: LineStyleSave;
}
export function VertexStyleClone(style: VertexStyle): VertexStyle {
    if(style === undefined) return VertexStyleDefault();
    return JSON.parse(JSON.stringify(style));
}
export function VertexStyleToSave(style: VertexStyle): VertexStyleSave {
    const result: VertexStyleSave = {};
    if(style === undefined) return result;
    const styleDefault = VertexStyleDefault();

    if(style.radius !== styleDefault.radius) result.radius = style.radius;
    if(style.textColor !== styleDefault.textColor && style.textColor!=="black") result.textColor = style.textColor;
    if(style.textSize !== styleDefault.textSize) result.textSize = style.textSize;
    if(style.bgColor !== styleDefault.bgColor && style.bgColor!=="white") result.bgColor = style.bgColor;

    const lineStyle = LineStyleToSave(style.lineStyle);
    if(lineStyle.color!==undefined || lineStyle.type!==undefined || lineStyle.weight!==undefined) {
        result.lineStyle = lineStyle;
    }
    return result;
}
export function VertexStyleFromSave(style: VertexStyleSave): VertexStyle {
    const result = VertexStyleDefault();
    if(style === undefined) return result;

    if(style.radius!==undefined) result.radius = style.radius;
    if(style.textColor!==undefined) result.textColor = style.textColor;
    if(style.textSize!==undefined) result.textSize = style.textSize;
    if(style.bgColor!==undefined) result.bgColor = style.bgColor;

    if(style.lineStyle!==undefined) result.lineStyle = LineStyleFromSave(style.lineStyle);
    return result;
}

export class Vertex {
    public id: number = -1;
    public label: string;
    public position: Vector2;
    public disabled: boolean;

    public style: VertexStyle;

    public neighbors: Set<number> = new Set<number>();
    public neighborsRemoved: Set<number> = new Set<number>();

    /** version number. Only visually update the vertex if version changed */
    public version: number = 0;
    /** if node currently is in the viewport */
    public visible = true;
    /** bounding box of this node (e.g. latex text) */
    public boundingBox: Vector2|undefined;

    public svg: {
        label: string,
        width: number,
        height: number,
        element: React.ReactElement,
    } | undefined;

    public static SortByDegreeDescending(a: Vertex, b: Vertex): number {
        return b.degree() - a.degree();
    }

    /** returns the degree of a vertex (number of neighbors) */
    public isVisible(from: Vector2, to: Vector2): boolean {
        const radius = this.style?.radius ?? 0;
        const scale = (this.style?.textSize ?? 14) / 14;

        const dx = 4 + radius + (this.boundingBox?.x ?? 0) * scale;
        const dy = 4 + radius + (this.boundingBox?.y ?? 0) * scale;

        return (from.x <= this.position.x + dx)
            && (to.x >= this.position.x - dx)

            && (from.y <= this.position.y + dy)
            && (to.y >= this.position.y - dy);
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

    /** make a copy of a vertex */
    public cloneAlgorithm(): Vertex {
        const vertex = new Vertex();

        vertex.id = this.id;
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
        vertex.label = data.label ?? "";
        vertex.disabled = data.disabled ?? false;
        vertex.position = new Vector2(data.x, data.y);
        vertex.style = VertexStyleFromSave(data.style);
        vertex.style.textSize ??= 14;
        return vertex;
    }

    public VertexToData(): VertexData {
        const data: VertexData = {
            id: this.id,

            x: Math.round(this.position.x*10)/10,
            y: Math.round(this.position.y*10)/10,

            neighbors: Array.from(this.neighbors).filter(to => to >= this.id),
            neighborsRemoved: Array.from(this.neighborsRemoved).filter(to => to >= this.id),

            style: VertexStyleToSave(this.style)
        };
        if(this.label!=="") data.label = this.label;
        if(this.disabled) data.disabled = true;
        return data;
    }
}