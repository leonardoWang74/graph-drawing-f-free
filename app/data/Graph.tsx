import Vector2 from "@/app/data/Vector2";
import {Vertex, VertexData, VertexStyle, VertexStyleClone} from "@/app/data/Vertex";
import Subsets from "@/app/util/Subsets";
import {ArrayEquals, ArrayShuffleInPlace, IterableMaxima} from "@/app/util/ArrayUtils";
import {SortNumberDescending} from "@/app/util/SortUtils";
import {BijectionsCombination, BijectionsGraph} from "@/app/util/Bijections";
import {ViewData} from "@/app/page";

export interface GraphData {
    id: number;
    name: string;
    savedLast: string;
    vertices: VertexData[];
    edgeStyle: Record<number, Record<number, LineStyle>>;
    viewData: ViewData|undefined;
}

export type LineType = "solid" | "dashed" | "dotted";

export interface LineStyle {
    color: string;
    type: LineType;
    weight: number;
}
export interface LineStyleSave {
    color?: string;
    type?: LineType;
    weight?: number;
}
export function LineStyleClone(style: LineStyle): LineStyle {
    return JSON.parse(JSON.stringify(style));
}

export function LineStyleDefault(): LineStyle {
    return {
        color: "#000000",
        weight: 1,
        type: "solid"
    };
}

export function LineStyleEdgeAdded(): LineStyle {
    return {
        color: "#00cc00",
        weight: 3,
        type: "solid"
    };
}

export function LineStyleEdgeRemoved(): LineStyle {
    return {
        color: "#ff0000",
        weight: 3,
        type: "dashed"
    };
}

export function LineStyleToSave(style: LineStyle): LineStyleSave {
    const result: LineStyleSave = {};
    if(!style) return result;
    const styleDefault = LineStyleDefault();

    if(style.color !== styleDefault.color) result.color = style.color;
    if(style.type !== styleDefault.type) result.type = style.type;
    if(style.weight !== styleDefault.weight) result.weight = style.weight;

    return result;
}
export function LineStyleFromSave(style: LineStyleSave): LineStyle {
    const result = LineStyleDefault();
    if(!style) return result;

    if(style.color) result.color = style.color;
    if(style.type) result.type = style.type;
    if(style.weight) result.weight = style.weight;

    return result;
}
export function VertexStyleDefault(): VertexStyle {
    return {
        radius: 18,
        textColor: '#000000',
        textSize: 14,
        bgColor: '#ffffff',
        lineStyle: LineStyleDefault(),
    };
}

export interface SubgraphWithHull {
    clique: Set<number>;
    hull: Vector2[];
}

export interface BoundingVertices {
    leftMost: Vertex;
    rightMost: Vertex;

    upperMost: Vertex;
    bottomMost: Vertex;
}

type CellKey = string;

class SpatialGrid {
    private readonly cellSize: number;
    private vertices: Set<number> = new Set<number>();
    public cells = new Map<CellKey, Set<Vertex>>();
    private cellKeys = new Map<number, { key: CellKey, version: number }>();

    constructor(cellSize = 1000) {
        this.cellSize = cellSize;
    }

    private key(position: Vector2): CellKey {
        return `${position.x},${position.y}`;
    }

    private cellCoords(position: Vector2) {
        return new Vector2(Math.floor(position.x / this.cellSize), Math.floor(position.y / this.cellSize));
    }

    /** insert a vertex if not already contained. Else, check if the version was increased -> update */
    public insertOrUpdate(v: Vertex) {
        if(!this.insert(v)) return;

        // do not update if vertex version is the same
        const oldCell = this.cellKeys.get(v.id);
        if(oldCell) {
            if(oldCell.version === v.version) return;
        }

        this.update(v);
    }

    /** returns TRUE if the grid already contained the vertex. Else false */
    public insert(v: Vertex): boolean {
        if(this.vertices.has(v.id)) return true;
        this.vertices.add(v.id);

        const cellCoords = this.cellCoords(v.position);
        const k = this.key(cellCoords);
        if (!this.cells.has(k)) this.cells.set(k, new Set());
        this.cells.get(k)!.add(v);
        this.cellKeys.set(v.id, {key: k, version: v.version}); // store for fast updates
        return false;
    }

    public update(v: Vertex) {
        const cellCoords = this.cellCoords(v.position);
        const newKey = this.key(cellCoords);

        // remove from old cell
        const oldCell = this.cellKeys.get(v.id);
        if(oldCell) {
            if (newKey === oldCell) return;
            this.cells.get(oldCell.key)?.delete(v);
        }

        // add to new cell
        if (!this.cells.has(newKey)) this.cells.set(newKey, new Set());
        this.cells.get(newKey)!.add(v);
        this.cellKeys.set(v.id, {key: newKey, version: v.version});
    }

    public query(from: Vector2, to: Vector2): Vertex[] {
        const minX = Math.floor(from.x / this.cellSize) -1;
        const minY = Math.floor(from.y / this.cellSize) -1;

        const maxX = Math.ceil(to.x / this.cellSize) +1;
        const maxY = Math.ceil(to.y / this.cellSize) +1;

        const result: Vertex[] = [];

        // only check the cells inside the viewport
        for (let x = minX; x <= maxX; x++) {
            for (let y = minY; y <= maxY; y++) {
                const k = this.key(new Vector2(x,y));
                const cell = this.cells.get(k);
                if (!cell) continue;
                for (const v of cell) {
                    if(!v.isVisible(from, to)) continue;
                    result.push(v);
                }
            }
        }
        return result;
    }
}

interface CliqueWithIndex {
    index: number;
    clique: Set<number>;
}

interface CliqueWithIndexAndMaxima {
    index: number;
    clique: Set<number>;

    lowestVertexId: number;
    highestVertexId: number;
}

interface EdgeEdit {
    from: Vertex;
    to: Vertex;

    /** TRUE if the edge should be added. FALSE if the edge should be removed */
    add: boolean;
}

export default class Graph {
    public id: number;
    public name: string = 'A graph';
    public savedLast: string = '';
    public viewData: ViewData|undefined;

    public active: boolean = false;

    public vertices: Map<number, Vertex> = new Map<number, Vertex>();
    public edgeStyle: Map<number, Map<number, LineStyle>> = new Map<number, Map<number, LineStyle>>();
    public edgesForbidden: Map<number, Set<number>> = new Map<number, Set<number>>();

    public savedSelection: number[] = [];
    public activeVertices: number[] = [];
    public forbiddenInduced: number[][] = [];
    public forbiddenVersion: number = 0;

    public cliquesMaximal: SubgraphWithHull[] = [];
    public cliqueVertexCounts: Map<number, number> = new Map<number, number>();
    public cliquesVersion: number = 0;

    public cliquesCritical: SubgraphWithHull[] = [];
    public cliquesCriticalVersion: number = 0;

    public edgeAdds: Vector2[] = [];
    public edgeRemoves: Vector2[] = [];

    //////////////////////////////////////////
    // region complex functions
    // list induced subgraphs, get degeneracy, find maximal cliques
    //////////////////////////////////////////

    private static overlappingSolutionsFilterForbiddenEdits(forbidden: Map<number, Map<number, boolean>>, edits: EdgeEdit[]) {
        for(let i=edits.length-1; i>=0; --i) {
            const edit = edits[i];

            // swap so from always has a smaller id
            if(edit.from.id > edit.to.id) {
                const swap = edit.from;
                edit.from = edit.to;
                edit.to = swap;
            }

            const map = forbidden.get(edit.from.id);
            if(!map) continue;
            if(!map.has(edit.to.id)) continue;

            // if edit was done already OR edit would contradict forbidden, we don't branch on it anymore
            edits.splice(i, 1);
        }
    }

    public *overlappingSolutionsSEqualsTwoBranchAndBound(
        k: number,
        forbidden: Map<number, Map<number, boolean>>|undefined = undefined,
    ): Generator<Graph> {
        // budget empty
        if(k < 0) return;

        const s = 2;

        // initial call
        if(forbidden === undefined) {
            forbidden = new Map<number, Map<number, boolean>>();
            this.edgeAdds = [];
            this.edgeRemoves = [];
        }

        const maximalCliques = this.getMaximalCliques();

        /** count of cliques overlapping vertex. smallest number of cliques > s */
        let vertexCount = s * this.n();
        /** vertex with count of cliques */
        let vertexCandidate: Vertex | undefined = undefined;

        /** max count of cliques overlapping vertex */
        let maxCount = 0;

        const vertexCliques: Map<number, CliqueWithIndex[]> = new Map<number, CliqueWithIndex[]>();

        // count number of maximal cliques per vertex
        for(let i=0; i<maximalCliques.length; ++i) {
            const clique = maximalCliques[i];

            for(const vId of clique) {
                const v = this.vertexGet(vId)!;

                // add clique to list
                if(!vertexCliques.has(vId)) vertexCliques.set(vId, []);
                const list = vertexCliques.get(vId)!;

                list.push({clique: clique, index: i});

                // set best vertex (smallest degree vertex in above s cliques)
                if(list.length > s && v.degree() < vertexCount) {
                    vertexCount = v.degree();
                    vertexCandidate = v;
                }

                // count max
                if(list.length > maxCount) {
                    maxCount = list.length;
                }
            }
        }

        // no vertex in more than s cliques: no edits needed
        if(maxCount <= s) {
            const solution = this.cloneAlgorithm();
            solution.edgeAdds = [...this.edgeAdds];
            solution.edgeRemoves = [...this.edgeRemoves];
            console.log("Found solution with edgeAdds", solution.edgeAdds, " edgeRemoves:", solution.edgeRemoves);
            yield solution;
            return;
        }

        // cannot find a solution since we have no budget left
        if(k <= 0) return;

        if(!vertexCandidate) return;
        const uVertex = vertexCandidate;
        // const cliques = vertexCliques.get(uVertex.id)!;

        let branchingEdits: EdgeEdit[] | undefined = undefined;

        // try to find a forbidden subgraph in $u$ (preferred claw, since there are fewer branches)
        const neighborList = Array.from(uVertex.neighbors);
        const degree = uVertex.neighbors.size;
        for(let vIndex=0; vIndex<degree; ++vIndex) {
            const vVertex = this.vertexGet(neighborList[vIndex])!;
            for(let wIndex=vIndex+1; wIndex<degree; ++wIndex) {
                const wVertex = this.vertexGet(neighborList[wIndex])!;

                const edgeVW = vVertex.edgeHas(wVertex);

                for(let xIndex= wIndex+1; xIndex<degree; ++xIndex) {
                    const xVertex = this.vertexGet(neighborList[xIndex])!;

                    const edgeVX = vVertex.edgeHas(xVertex);
                    const edgeWX = wVertex.edgeHas(xVertex);

                    // found a claw
                    if(!edgeVW && !edgeVX && !edgeWX) {
                        const edits: EdgeEdit[] = [
                            // remove edges from u
                            {from: uVertex, to: vVertex, add: false},
                            {from: uVertex, to: wVertex, add: false},
                            {from: uVertex, to: xVertex, add: false},

                            // add edges
                            {from: vVertex, to: wVertex, add: true},
                            {from: vVertex, to: xVertex, add: true},
                            {from: wVertex, to: xVertex, add: true},
                        ];
                        Graph.overlappingSolutionsFilterForbiddenEdits(forbidden!, edits);
                        if(edits.length > 0 && (branchingEdits===undefined || edits.length < branchingEdits.length)) {
                            branchingEdits = edits;
                        }

                        // cannot find F2 or F3 when there is a claw
                        // continue; // but could find another F1
                    }

                    // F1,F2,F3 don't have a triangle
                    if(edgeVW && edgeWX && edgeVX) continue;

                    for(let yIndex= xIndex+1; yIndex<degree; ++yIndex) {
                        const yVertex = this.vertexGet(neighborList[yIndex])!;

                        const subgraph = this.getSubgraphAlgorithm([vVertex.id, wVertex.id, xVertex.id, yVertex.id]);
                        const vSub = subgraph.vertexGet(vVertex.id)!;
                        const wSub = subgraph.vertexGet(wVertex.id)!;
                        const xSub = subgraph.vertexGet(xVertex.id)!;
                        const ySub = subgraph.vertexGet(yVertex.id)!;

                        // too many edges
                        const edgeCount = subgraph.m();
                        if(edgeCount < 3 || edgeCount > 4) {
                            continue;
                        }

                        // check degrees
                        const vDegree = vSub.degree();
                        const wDegree = wSub.degree();
                        const xDegree = xSub.degree();
                        const yDegree = ySub.degree();

                        if(vDegree===0 || wDegree===0 || xDegree===0 || yDegree===0) {
                            console.log("Skipping: one degree 0 ", subgraph);
                            continue;
                        }

                        let edits: EdgeEdit[];

                        // F1: found a claw in the 4 vertices if edgeCount = 3
                        if(vDegree===3) {
                            if(edgeCount > 3) {
                                continue;
                            }
                            edits = [
                                // remove edges from claw center
                                {from: vVertex, to: wVertex, add: false},
                                {from: vVertex, to: xVertex, add: false},
                                {from: vVertex, to: yVertex, add: false},

                                // add edges between claw leaves
                                {from: wVertex, to: xVertex, add: true},
                                {from: wVertex, to: yVertex, add: true},
                                {from: xVertex, to: yVertex, add: true},
                            ];
                        }
                        else if(wDegree===3) {
                            if(edgeCount > 3) {
                                continue;
                            }
                            edits = [
                                // remove edges from claw center
                                {from: wVertex, to: vVertex, add: false},
                                {from: wVertex, to: xVertex, add: false},
                                {from: wVertex, to: yVertex, add: false},

                                // add edges between claw leaves
                                {from: vVertex, to: xVertex, add: true},
                                {from: vVertex, to: yVertex, add: true},
                                {from: xVertex, to: yVertex, add: true},
                            ];
                        }
                        else if(xDegree===3) {
                            if(edgeCount > 3) {
                                continue;
                            }
                            edits = [
                                // remove edges from claw center
                                {from: xVertex, to: vVertex, add: false},
                                {from: xVertex, to: wVertex, add: false},
                                {from: xVertex, to: yVertex, add: false},

                                // add edges between claw leaves
                                {from: vVertex, to: wVertex, add: true},
                                {from: vVertex, to: yVertex, add: true},
                                {from: wVertex, to: yVertex, add: true},
                            ];
                        }
                        else if(yDegree===3) {
                            if(edgeCount > 3) {
                                continue;
                            }
                            edits = [
                                // remove edges from claw center
                                {from: yVertex, to: vVertex, add: false},
                                {from: yVertex, to: wVertex, add: false},
                                {from: yVertex, to: xVertex, add: false},

                                // add edges between claw leaves
                                {from: vVertex, to: wVertex, add: true},
                                {from: vVertex, to: xVertex, add: true},
                                {from: wVertex, to: xVertex, add: true},
                            ];
                        }

                        // F2: 3 edges, no vertices with degree = 0 or degree = 3
                        else if(edgeCount === 3) {
                            // get the P_4 path: have to start at a vertex with degree = 1
                            let walk: Vertex[];
                            if(vDegree===1) {
                                walk = subgraph.getAnyWalk(vSub, 4);
                            }
                            else if(wDegree===1) {
                                walk = subgraph.getAnyWalk(wSub, 4);
                            }
                            else if(xDegree===1) {
                                walk = subgraph.getAnyWalk(xSub, 4);
                            }
                            else if(yDegree===1) {
                                walk = subgraph.getAnyWalk(ySub, 4);
                            }

                            if(walk.length < 4) {
                                console.error("walk length less than 4", walk);
                            }

                            edits = [
                                // remove edges from u
                                {from: uVertex, to: vVertex, add: false},
                                {from: uVertex, to: wVertex, add: false},
                                {from: uVertex, to: xVertex, add: false},
                                {from: uVertex, to: yVertex, add: false},

                                // remove center bottom edge
                                {from: this.vertexGet(walk[1].id)!, to: this.vertexGet(walk[2].id)!, add: false},

                                // add edges between P4
                                {from: this.vertexGet(walk[0].id)!, to: this.vertexGet(walk[2].id)!, add: true},
                                {from: this.vertexGet(walk[1].id)!, to: this.vertexGet(walk[3].id)!, add: true},
                            ];
                        }

                        // F3: all degrees are exactly 2
                        else {
                            let walk = subgraph.getAnyWalk(vSub, 4);
                            if(walk.length < 4) {
                                console.error("walk length less than 4", walk);
                            }
                            edits = [
                                // remove edges from u
                                {from: uVertex, to: vVertex, add: false},
                                {from: uVertex, to: wVertex, add: false},
                                {from: uVertex, to: xVertex, add: false},
                                {from: uVertex, to: yVertex, add: false},

                                // add edges between C4
                                {from: this.vertexGet(walk[0].id)!, to: this.vertexGet(walk[2].id)!, add: true},
                                {from: this.vertexGet(walk[1].id)!, to: this.vertexGet(walk[3].id)!, add: true},
                            ];
                        }

                        // filter edits, fix order from < to
                        Graph.overlappingSolutionsFilterForbiddenEdits(forbidden!, edits);
                        if(edits.length > 0 && (branchingEdits===undefined || edits.length < branchingEdits.length)) {
                            branchingEdits = edits;
                        }
                    }
                }
            }
        }

        // did not find a forbidden subgraph in $u$ with non-forbidden edits = cannot solve
        if(branchingEdits===undefined) {
            return;
        }

        console.log(branchingEdits)

        // branch on all possible edits
        for(const edit of branchingEdits) {
            if(!forbidden.has(edit.from.id)) forbidden.set(edit.from.id, new Map<number, boolean>());

            const forbiddenCopy = Graph.overlappingForbiddenCopy(forbidden);

            // change forbidden
            forbiddenCopy.get(edit.from.id)!.set(edit.to.id, edit.add);

            // do the edit
            if(edit.add) {
                this.edgeAdd(edit.from, edit.to);
                this.edgeAdds.unshift(new Vector2(edit.from.id, edit.to.id));
            } else {
                this.edgeRemove(edit.from, edit.to);
                this.edgeRemoves.unshift(new Vector2(edit.from.id, edit.to.id));
            }

            // branch
            yield* this.overlappingSolutionsSEqualsTwoBranchAndBound(k-1, forbiddenCopy);

            // undo the edit
            if(edit.add) {
                this.edgeRemove(edit.from, edit.to);
                this.edgeAdds.shift();
            } else {
                this.edgeAdd(edit.from, edit.to);
                this.edgeRemoves.shift();
            }

            // forbid the opposite for other branches
            forbidden.get(edit.from.id)!.set(edit.to.id, !edit.add);
        }
    }

    private static overlappingForbiddenCopy(forbidden: Map<number, Map<number, boolean>>|undefined): Map<number, Map<number, boolean>> {
        const forbiddenCopy: Map<number, Map<number, boolean>> = new Map<number, Map<number, boolean>>();
        if(!forbidden) return forbiddenCopy;

        for(const [from, map] of forbidden.entries()) {
            forbiddenCopy.set(from, new Map<number, boolean>());
            const mapCopy = forbiddenCopy.get(from)!;
            for(const [to, value] of map.entries()) {
                mapCopy.set(to, value);
            }
        }
        return forbiddenCopy;
    }

    private static overlappingForbiddenCliquesCopy(forbiddenCliques: Set<string>|undefined): Set<string> {
        if(!forbiddenCliques) return new Set<string>();
        return new Set<string>(forbiddenCliques);
    }

    /** forbidden is a map of {vertexIdFrom (smaller ID): { vertexIdTo: value } } with value being TRUE if permanent and FALSE if forbidden */
    private *overlappingSolutions(
        s: number,
        k: number,
        forbidden: Map<number, Map<number, boolean>>|undefined = undefined,
        forbiddenCliques: Set<string>|undefined = undefined,
    ): Generator<Graph> {
        // initial call
        if(forbidden === undefined) {
            forbidden = new Map<number, Map<number, boolean>>();
            this.edgeAdds = [];
            this.edgeRemoves = [];
        }

        const maximalCliques = this.getMaximalCliques();

        /** count of cliques overlapping vertex. smallest number of cliques > s */
        let vertexCount = s * this.n();
        /** vertex with count of cliques */
        let vertexCandidate: Vertex | undefined = undefined;

        /** max count of cliques overlapping vertex */
        let maxCount = 0;

        const vertexCliques: Map<number, CliqueWithIndexAndMaxima[]> = new Map<number, CliqueWithIndexAndMaxima[]>();

        // count number of maximal cliques per vertex
        for(let i=0; i<maximalCliques.length; ++i) {
            const clique = maximalCliques[i];

            for(const vId of clique) {
                const v = this.vertexGet(vId)!;

                // add clique to list
                if(!vertexCliques.has(vId)) vertexCliques.set(vId, []);
                const list = vertexCliques.get(vId)!;

                const maxima = IterableMaxima(clique)!;
                list.push({clique: clique, index: i, lowestVertexId: maxima.lowest, highestVertexId: maxima.highest});

                // set best vertex
                if(list.length > s && list.length < vertexCount) {
                    vertexCount = list.length;
                    vertexCandidate = v;
                }

                // count max
                if(list.length > maxCount) {
                    maxCount = list.length;
                }
            }
        }

        // no vertex in more than s cliques: no edits needed
        if(maxCount <= s) {
            yield this;
            return;
        }

        if(!vertexCandidate) return;
        const vertex = vertexCandidate;

        // some vertex in >k cliques - cannot solve (?)
        /*if(maxCount > k) {
            return;
        }*/

        // prevent some clique merges (also in children of sibling branches)
        // because e.g. merging A,B then B,C is the same as merging B,C then A,B
        const forbiddenCliquesCopy = Graph.overlappingForbiddenCliquesCopy(forbiddenCliques);

        // otherwise: branch on possible merges / removals
        const cliques = vertexCliques.get(vertex.id)!;
        for(let i=0; i<cliques.length; ++i) {
            const clique = cliques[i];

            /////////////////////////////////////////////////
            // merge pairs of cliques
            for(let j=i+1; j<cliques.length; ++j) {
                // copy graph & forbidden for each branch
                const graph = this.cloneAlgorithm();
                graph.edgeAdds = [...this.edgeAdds];
                graph.edgeRemoves = [...this.edgeRemoves];
                const forbiddenCopy = Graph.overlappingForbiddenCopy(forbidden);

                const clique2 = cliques[j];

                // prevent A+B, B+C and B+C, A+B merges
                if(clique.lowestVertexId > clique2.lowestVertexId) continue;
                if(clique.lowestVertexId === clique2.lowestVertexId && clique.highestVertexId > clique2.highestVertexId) continue;

                // need to only add edges between vertex pairs not overlapping both cliques = symmetrical difference
                const symmVertices = Array.from(clique.clique.symmetricDifference(clique2.clique));

                /** if the edits contain a forbidden edge */
                let containsForbidden = false;

                let cost = 0;

                // add all edges in-between
                for(let vi=0; vi<symmVertices.length; ++vi) {
                    for(let vj=vi+1; vj<symmVertices.length; ++vj) {
                        const vertexI = graph.vertexGet( symmVertices[vi] )!;
                        const vertexJ = graph.vertexGet( symmVertices[vj] )!;

                        const [fromId, toId] = vertexI.id < vertexJ.id ? [vertexI.id, vertexJ.id] : [vertexJ.id, vertexI.id];

                        // check if to-add edge is forbidden
                        if(forbidden!.get(fromId)?.get(toId) === false) {
                            containsForbidden = true;
                            vi=symmVertices.length;
                            break;
                        }

                        // edge already exists in the graph (cannot happen since using the symmetric difference)
                        if(graph.edgeHas(vertexI, vertexJ)) continue;

                        ++cost;
                        if(cost > k) {
                            vi=symmVertices.length;
                            break;
                        }

                        graph.edgeAdds.push(new Vector2(fromId, toId));
                        graph.edgeAdd(vertexI, vertexJ);

                        // update forbidden
                        if(!forbiddenCopy.has(fromId)) forbiddenCopy.set(fromId, new Map<number, boolean>());
                        forbiddenCopy.get(fromId)!.set(toId, true);
                    }
                }

                // contains a forbidden edit - do not branch
                if(containsForbidden) continue;

                // did nothing - do not branch
                if(cost === 0) continue;

                // only doing one single edit - can forbid this edit in other branches
                if(cost === 1) {
                    for(let vi=0; vi<symmVertices.length; ++vi) {
                        for(let vj=vi+1; vj<symmVertices.length; ++vj) {
                            const vertexI = graph.vertexGet( symmVertices[vi] )!;
                            const vertexJ = graph.vertexGet( symmVertices[vj] )!;

                            const [fromId, toId] = vertexI.id < vertexJ.id ? [vertexI.id, vertexJ.id] : [vertexJ.id, vertexI.id];

                            // update forbidden: forbid edge
                            if(!forbidden!.has(fromId)) forbidden!.set(fromId, new Map<number, boolean>());
                            forbidden!.get(fromId)!.set(toId, false);
                        }
                    }
                }

                // cost too high - do not branch
                if(cost > k) continue;

                yield* graph.overlappingSolutions(s, k-cost, forbiddenCopy, forbiddenCliquesCopy);
            }

            /////////////////////////////////////////////////
            // remove from clique

            // find edges not in other cliques: get all edges in clique then remove overlapping ones
            const edgesNotInOtherCliques: Map<number, Set<number>> = new Map<number, Set<number>>();
            for(const fromId of clique.clique) {
                for(const toId of clique.clique) {
                    if(fromId >= toId) continue;
                    if(!edgesNotInOtherCliques.has(fromId)) edgesNotInOtherCliques.set(fromId, new Set<number>());
                    edgesNotInOtherCliques.get(fromId)!.add(toId);
                }
            }
            // remove overlapping edges
            for(let j=0; j<maximalCliques.length; ++j) {
                // do not remove edges of the same clique
                if(clique.index === j) continue;
                const clique2 = maximalCliques[j];

                for(const fromId of clique2) {
                    for(const toId of clique2) {
                        if(fromId >= toId) continue;
                        edgesNotInOtherCliques.get(fromId)?.delete(toId);
                    }
                }
            }

            // copy graph & forbidden for each branch
            const graph = this.cloneAlgorithm();
            graph.edgeAdds = [...this.edgeAdds];
            graph.edgeRemoves = [...this.edgeRemoves];
            const forbiddenCopy = Graph.overlappingForbiddenCopy(forbidden);

            // remove edges adjacent to `vertex`
            let cost = 0;
            let containsForbidden = false;
            for(const [fromId, toIdSet] of edgesNotInOtherCliques.entries()) {
                // filter edgesNotInOtherCliques to only edges adjacent to `vertex`.
                // Cases:
                // 1. fromId < vertex.id -> check neighbors.has(vertex.id), if TRUE then remove edge
                // 2. fromId === vertex.id -> remove all in toIdSet
                // 3. fromId > vertex.id -> toIdSet cannot contain vertex.id
                if(fromId > vertex.id) continue;

                if(fromId < vertex.id) {
                    if(!toIdSet.has(vertex.id)) continue;
                    const from = graph.vertexGet(fromId)!;
                    const to = graph.vertexGet(vertex.id)!;
                    const toId = vertex.id;

                    // check if to-removed edge is fixed
                    if(forbidden!.get(fromId)?.get(toId) === true) {
                        containsForbidden = true;
                        break;
                    }

                    ++cost;
                    if(cost > k) {
                        break;
                    }

                    graph.edgeRemoves.push(new Vector2(fromId, toId));
                    graph.edgeRemove(from, to);

                    // update forbidden
                    if(!forbiddenCopy.has(fromId)) forbiddenCopy.set(fromId, new Map<number, boolean>());
                    forbiddenCopy.get(fromId)!.set(toId, false);
                }
                else if(fromId === vertex.id) {
                    for(const toId of toIdSet) {
                        const from = graph.vertexGet(vertex.id)!;
                        const to = graph.vertexGet(toId)!;

                        // check if to-removed edge is fixed
                        if(forbidden!.get(fromId)?.get(toId) === true) {
                            containsForbidden = true;
                            break;
                        }

                        ++cost;
                        if(cost > k) {
                            break;
                        }

                        graph.edgeRemoves.push(new Vector2(fromId, toId));
                        graph.edgeRemove(from, to);

                        // update forbidden
                        if(!forbiddenCopy.has(fromId)) forbiddenCopy.set(fromId, new Map<number, boolean>());
                        forbiddenCopy.get(fromId)!.set(toId, false);
                    }

                    if(cost > k) {
                        break;
                    }
                }
            }

            // contains fixed edges: do not branch
            if(containsForbidden) continue;

            // cost too high: do not branch
            if(cost > k) continue;

            // removed at least one edge
            if(cost > 0) {
                yield* graph.overlappingSolutions(s, k-cost, forbiddenCopy, forbiddenCliquesCopy);
                continue;
            }

            // removed no edge - try to remove the whole clique
            // all variables are as initialized (cost = 0, containsForbidden=false) since no edge was removed
            for(const [fromId, toIdSet] of edgesNotInOtherCliques.entries()) {
                for(const toId of toIdSet) {
                    const from = graph.vertexGet(fromId)!;
                    const to = graph.vertexGet(toId)!;

                    // check if to-removed edge is fixed
                    if(forbidden!.get(fromId)?.get(toId) === true) {
                        containsForbidden = true;
                        break;
                    }

                    ++cost;
                    if(cost > k) {
                        break;
                    }

                    graph.edgeRemoves.push(new Vector2(fromId, toId));
                    graph.edgeRemove(from, to);

                    // update forbidden
                    if(!forbiddenCopy.has(fromId)) forbiddenCopy.set(fromId, new Map<number, boolean>());
                    forbiddenCopy.get(fromId)!.set(toId, false);
                }
                if(cost > k) {
                    break;
                }
            }

            // contains fixed edges: do not branch
            if(containsForbidden) continue;

            // cost too high: do not branch
            if(cost > k) continue;

            // removed at least one edge
            if(cost > 0) {
                yield* graph.overlappingSolutions(s, k-cost, forbiddenCopy, forbiddenCliquesCopy);
                continue;
            }

            // did nothing: remove edges not overlapping other overlapping cliques
            edgesNotInOtherCliques.clear();
            for(const fromId of clique.clique) {
                for(const toId of clique.clique) {
                    if(fromId >= toId) continue;
                    if(!edgesNotInOtherCliques.has(fromId)) edgesNotInOtherCliques.set(fromId, new Set<number>());
                    edgesNotInOtherCliques.get(fromId)!.add(toId);
                }
            }
            // remove overlapping edges
            for(let j=0; j<cliques.length; ++j) {
                // do not remove edges of the same clique
                if(clique.index === j) continue;
                const clique2 = cliques[j];

                for(const fromId of clique2.clique) {
                    for(const toId of clique2.clique) {
                        if(fromId >= toId) continue;
                        edgesNotInOtherCliques.get(fromId)?.delete(toId);
                    }
                }
            }

            // removed no edge - try to remove the whole clique
            // all variables are as initialized (cost = 0, containsForbidden=false) since no edge was removed
            for(const [fromId, toIdSet] of edgesNotInOtherCliques.entries()) {
                for(const toId of toIdSet) {
                    const from = graph.vertexGet(fromId)!;
                    const to = graph.vertexGet(toId)!;

                    // check if to-removed edge is fixed
                    if(forbidden!.get(fromId)?.get(toId) === true) {
                        containsForbidden = true;
                        break;
                    }

                    ++cost;
                    if(cost > k) {
                        break;
                    }

                    graph.edgeRemoves.push(new Vector2(fromId, toId));
                    graph.edgeRemove(from, to);

                    // update forbidden
                    if(!forbiddenCopy.has(fromId)) forbiddenCopy.set(fromId, new Map<number, boolean>());
                    forbiddenCopy.get(fromId)!.set(toId, false);
                }
                if(cost > k) {
                    break;
                }
            }

            // contains fixed edges: do not branch
            if(containsForbidden) continue;

            // cost too high: do not branch
            if(cost > k) continue;

            // removed at least one edge
            if(cost > 0) {
                yield* graph.overlappingSolutions(s, k-cost, forbiddenCopy, forbiddenCliquesCopy);
            }
        }
    }

    /** enumerate solutions for s-overlapping cluster editing */
    public overlappingClusterEditingEnumerate(s: number, k: number): Graph[] {
        const list: Graph[] = [];
        for(const solution of this.overlappingSolutions(s, k)) {
            list.push(solution);
        }
        return list;
    }

    /** enumerate solutions for s-overlapping cluster editing */
    public overlappingClusterEditingSolution(s: number, k: number): Graph|undefined {
        const generator = this.overlappingSolutions(s, k);

        const result = generator.next();
        if(result) return result.value;

        return undefined;
    }

    /** find critical cliques in the graph
     * function Lexicographic(G) in [Hsu and Ma 1991, Substitution decomposition on chordal graphs and applications]
     * with the closed neighborhood instead of the open neighborhood to find all type I modules:
     * "All type I module[s] can be located in $\mathcal O (n+m)$ time by partitioning the vertices
     * using the augmented neighborhoods of all vertices. If there is a set with more than one vertex
     * at the end of the partitioning process, it is a type I module."*/
    public getCriticalCliques(): Set<number>[] {
        let map: Map<string, Set<number>> = new Map<string, Set<number>>();

        for(const vertex of this.vertices.values()) {
            const closedNeighborhood = vertex.neighbors.union(new Set<number>([vertex.id]));
            const key = JSON.stringify(Array.from(closedNeighborhood).sort());

            if(!map.has(key)) map.set(key, new Set<number>());
            map.get(key)!.add(vertex.id);
        }

        return map.values().toArray();

        /*
        // initial set of all vertex IDs in the graph
        // S := { V };
        let S: Set<number>[] = [ new Set<number>(this.vertices.keys()) ];

        const n = this.n();
        for(let i=1; i<=n; ++i) {
            if(S.length === 0) break;

            // v := the first element of the first set in S
            const v = SetGetAny(S[0]);
            if(v === undefined) break;
            const vertex = this.vertexGet(v)!;

            console.log(i, v);

            // remove v
            // ignore this step since otherwise all sets are empty
            // S[0].delete(v);

            // \pi(i) := v
            // ignore this step as we don't need the ordering

            const closedNeighborhood = vertex.neighbors.union(new Set<number>([v]));

            // split each S_j \in S into S_j \cap N[v] and S_j \setminus N[v]
            // (use the closed neighborhood)
            // discard empty sets
            const SNew: Set<number>[] = [];
            for(const set of S) {
                const intersection = set.intersection(closedNeighborhood);
                const difference = set.difference(closedNeighborhood);
                if(intersection.size > 0) SNew.push(intersection);
                if(difference.size > 0) SNew.push(difference);

                console.log(intersection, difference);
            }
            S = SNew;
        }

        console.log(S);

        return S;*/
    }

    /** find maximal cliques in the graph */
    public getMaximalCliques(): Set<number>[] {
        const list: Set<number>[] = [];

        // find maximal cliques for each component
        const components = this.getComponents();
        for(const c of components) {
            // could first calculate the degeneracy and choose which algorithm to run
            // e.g. if degeneracy is high, use the matrix multiplication algorithm
            list.push(...c.BronKerboschDegeneracyByEppsteinLoefflerStrash());
        }

        return list;
    }

    /** get maximal cliques using Bron-Kerbosch based on degeneracy by Eppstein, Loeffller and Strash.
     * [Eppstein et al. 2010 - Listing All Maximal Cliques in Sparse Graphs in Near-optimal Time, Figure 4: BronKerboschDegeneracy]
     */
    public BronKerboschDegeneracyByEppsteinLoefflerStrash(): Set<number>[] {
        const list: Set<number>[] = [];

        const degeneracyInfo = this.getDegeneracyOrdering();
        // console.log('degeneracy of '+this.vertices.values().map(v => v.id).toArray().join(',')+ ": ", degeneracyInfo.degeneracy)

        // for each vertex vi in a degeneracy ordering $v_0, v_1, v_2, \dots$ of $(V,E)$ do
        for(let i = 0; i < degeneracyInfo.ordering.length; ++i) {
            const vId = degeneracyInfo.ordering[i];
            const v = this.vertexGet(vId)!;

            // const previous = new Set<number>(degeneracyInfo.ordering.slice(0, i));
            const next = new Set<number>(degeneracyInfo.ordering.slice(i+1, degeneracyInfo.ordering.length));

            // $ P \leftarrow N(v_i) \cap \{v_{i+1}, \dots, v_{n-1}\}$
            // P = Neighborhood intersected with neighbors later in the ordering
            const P = v.neighbors.intersection(next);

            // $ X \leftarrow N(v_i) \cap \{v_0, \dots, v_{i-1}\}$
            // X = Neighborhood intersected with neighbors earlier in the ordering

            // $P \cup X = N(v_i)$ holds therefore also $X = N(v_i) \setminus P$
            // so we don't need to calculate the slice of the previous vertices in the ordering
            // const X = v.neighbors.difference(P);
            const X = v.neighbors.difference(next);
            // const X = v.neighbors.intersection(previous);

            this.BronKerboschPivot(list, P, new Set<number>([vId]), X);
        }

        return list;
    }

    /** Bron-Kerbosch with Pivot.
     * [Eppstein et al. 2010 - Listing All Maximal Cliques in Sparse Graphs in Near-optimal Time, Figure 2: BronKerboschPivot]
     */
    public BronKerboschPivot(result: Set<number>[], P: Set<number>, R: Set<number>, X: Set<number>) {
        const pivotCandidates = P.union(X);

        // if $P \cup X = \emptyset$
        if(pivotCandidates.size === 0) {
            // report R as a maximal clique
            result.push(R);
            return;
        }

        // choose a pivot $u \in P \cup X$. Tomita et al. 2006: choose $u$ to maximize $|P \cap N(u)|$ with $N(u)$ being the neighborhood of $u$
        // [Tomita et al. 2006 - The worst-case time complexity for generating all maximal cliques and computational experiments]
        let pivot: Vertex|undefined = undefined;
        let pivotValue = -1;
        for(const vId of pivotCandidates) {
            const v = this.vertexGet(vId)!;
            const value = P.intersection(v.neighbors).size;
            if(value > pivotValue) {
                pivot = v;
                pivotValue = value;
            }
        }
        if(!pivot) {
            console.error("pivot empty")
            return;
        }

        // for each vertex $v \in P \setminus N(u)$ do
        const loopSet= P.difference(pivot.neighbors);
        for(const vId of loopSet) {
            const v = this.vertexGet(vId)!;

            // BronKerboschPivot($P \cap N(v)$, $R \cup \{v\}$, $X \cap N(v)$)
            this.BronKerboschPivot(result,
                P.intersection(v.neighbors),
                R.union(new Set<number>([vId])),
                X.intersection(v.neighbors)
            );

            // P \leftarrow P \setminus \{v\}
            P.delete(vId);
            // X \leftarrow X \cup \{v\}
            X.add(vId);
        }
    }

    /** calculate a degeneracy + degeneracy ordering of the graph.
     * [Eppstein et al. 2010 - Listing All Maximal Cliques in Sparse Graphs in Near-optimal Time, Section 2.1 before Lemma 1]
     */
    public getDegeneracyOrdering(): { degeneracy: number, ordering: number[] } {
        const n = this.n();
        let smallestDegree = this.vertices.size;
        /** map of vertexId -> degree. Need to save degree separately since we change it */
        const verticesMap: Map<number, number> = new Map<number, number>();
        /** map of degree -> list of vertices */
        const degreesMap: Map<number, Vertex[]> = new Map<number, Vertex[]>();

        // build map of degree -> list of vertices with that degree
        const vertices = this.getVerticesAsArray();
        ArrayShuffleInPlace(vertices);
        for(const v of vertices) {
            const degree = v.degree();
            smallestDegree = Math.min(smallestDegree, degree);

            if(!degreesMap.has(degree)) degreesMap.set(degree, []);
            degreesMap.get(degree)!.push(v);

            verticesMap.set(v.id, degree);
        }

        const degeneracyOrdering: number[] = [];
        let degeneracy = 0;
        while(verticesMap.size > 0) {
            // get a vertex with the smallest degree
            const listSmallest = degreesMap.get(smallestDegree);
            if(!listSmallest) break;
            const v = listSmallest.shift();
            if(!v) break;

            // remove empty list from map, update smallest Degree
            if(listSmallest.length === 0) {
                degreesMap.delete(smallestDegree);

                if(verticesMap.size > 0) {
                    while(smallestDegree < n) {
                        ++smallestDegree;
                        if(degreesMap.has(smallestDegree)) break;
                    }
                }
            }

            // remove from the graph
            verticesMap.delete(v.id);

            // remove neighbors
            let degeneracyHere = 0;
            for(const neighbor of v.neighbors) {
                const neighborVertex = this.vertexGet(neighbor)!;

                const degreePrevious = verticesMap.get(neighbor);
                if(degreePrevious===undefined) continue;
                const degreeNew = degreePrevious - 1;

                // count how many were removed = degeneracy
                ++degeneracyHere;

                // decrease degree of neighbor
                verticesMap.set(neighbor, degreeNew);

                // remove neighbor from old list
                const previousList = degreesMap.get(degreePrevious);
                if(previousList) {
                    for(let i=0; i<previousList.length; ++i) {
                        if(previousList[i].id !== neighbor) continue;
                        previousList.splice(i, 1);
                        break;
                    }
                    if(previousList.length === 0) {
                        degreesMap.delete(degreePrevious);
                    }
                }

                // put neighbor into new list
                if(!degreesMap.has(degreeNew)) degreesMap.set(degreeNew, []);
                degreesMap.get(degreeNew)?.push(neighborVertex);

                // maybe change smallest degree
                if(degreeNew < smallestDegree) {
                    smallestDegree = degreeNew;
                }
            }

            // add to ordering
            degeneracyOrdering.push(v.id);

            // increase degeneracy
            degeneracy = Math.max(degeneracy, degeneracyHere);
        }
        return {degeneracy: degeneracy, ordering: degeneracyOrdering};
    }

    /** find induced subgraphs of `subgraph` (must be a connected graph). Returns a list of `list of subgraph vertices` */
    public inducedSubgraphs(subgraph: Graph): number[][] {
        // simple algorithm idea: only check subgraphs where the degree of the vertices fit, starting with the largest (in the given subgraph)
        const inducedList: number[][] = [];

        // get degrees of the subgraph (including duplicates): descending
        const subgraphDegreesDesc = subgraph.getDegreesDescending();

        // empty subgraph: return nothing
        if(subgraphDegreesDesc.length === 0) return inducedList;
        // largest degree 0 -> every vertex is an induced subgraph
        if(subgraphDegreesDesc[0] === 0) {
            for(const vertex of this.vertices.values()) {
                const graph = new Graph();
                const v = vertex.clone();
                v.neighbors.clear();
                graph.vertexAdd(v);
                inducedList.push([v.id]);
            }
            return inducedList;
        }

        // build a map of the degrees in the subgraph
        const subgraphVerticesByDegree: Map<number, Set<Vertex>> = new Map<number, Set<Vertex>>();
        // build a sorted list of the degrees of the subgraph sorted by lowest first
        const subgraphDegreeAscByCount: number[] = [];
        for(const vertex of subgraph.vertices.values()) {
            const degree = vertex.degree();
            if(!subgraphVerticesByDegree.has(degree)) {
                const set = new Set<Vertex>();
                subgraphVerticesByDegree.set(degree, set);
                subgraphDegreeAscByCount.push(degree);
            }
            subgraphVerticesByDegree.get(degree)?.add(vertex);
        }
        subgraphDegreeAscByCount.sort((a, b) => subgraphVerticesByDegree.get(a)?.size - subgraphVerticesByDegree.get(b)?.size);

        // build a map of the degrees in the current graph
        const graphDegreesDesc: number[] = this.getDegreesDescendingNoDuplicates(); // (does not contain duplicates)
        const verticesByDegree: Map<number, Set<Vertex>> = new Map<number, Set<Vertex>>();
        for(const vertex of this.vertices.values()) {
            const degree = vertex.degree();
            if(!verticesByDegree.has(degree)) verticesByDegree.set(degree, new Set<Vertex>());
            verticesByDegree.get(degree)?.add(vertex);
        }

        // empty graph: return nothing
        if(graphDegreesDesc.length === 0) return inducedList;

        // starting with the highest degree, find subsets of neighbors we can include
        this.subgraphSearch(inducedList, subgraph, subgraphDegreesDesc, subgraphVerticesByDegree, subgraphDegreeAscByCount,
            graphDegreesDesc, verticesByDegree, []);

        return inducedList;
    }

    public static timeGettingSubgraphSearch: number = 0;
    public static timeGettingSubgraphCheck: number = 0;

    private subgraphSearch(
        inducedList: number[][],
        subgraph: Graph,
            subgraphDegreesDesc: number[],
            subgraphVerticesByDegree: Map<number, Set<Vertex>>,
            subgraphDegreeAscByCount: number[],
        graphDegreesDesc: number[],
            verticesByDegree: Map<number, Set<Vertex>>,
        foundIDs: number[],
        forbidden: Set<number> = new Set<number>() // cannot add these vertices
    ): void {
        if(foundIDs.length > subgraphDegreesDesc.length) {
            return;
        }

        // found enough vertices - add to preliminary list of subgraph
        if(foundIDs.length === subgraphDegreesDesc.length) {
            // create subgraph
            const now = new Date();
            const subgraphFound = this.getSubgraphAlgorithm(foundIDs);
            Graph.timeGettingSubgraphCheck += new Date()-now;

            // degrees don't match - discard
            if(!ArrayEquals(subgraphDegreesDesc, subgraphFound.getDegreesDescending())) return;
            /*console.log('subgraphFound', subgraphFound)
            console.log('subgraphDegreesDesc', subgraphDegreesDesc)
            console.log('subgraphFound.getDegreesDescending()', subgraphFound.getDegreesDescending(true))*/

            // get vertices by degree of found subgraph
            const verticesByDegreeFound: Map<number, Set<Vertex>> = new Map<number, Set<Vertex>>();
            for(const vertex of subgraphFound.vertices.values()) {
                const degree = vertex.degree();
                if(!verticesByDegreeFound.has(degree)) {
                    verticesByDegreeFound.set(degree, new Set<Vertex>());
                }
                verticesByDegreeFound.get(degree)?.add(vertex);
            }

            // check if there is a bijective function: found -> subgraph
            const bijection : Map<number, number> = new Map<number, number>();
            const subgraphVerticesUsed : Set<number> = new Set<number>();

            // degree <=1 is a clear bijective map: assign any
            for(let degree=0; degree<=1; ++degree) {
                const verticesOfDegree = verticesByDegreeFound.get(degree);
                const subgraphOfDegree = subgraphVerticesByDegree.get(degree);
                if(!verticesOfDegree || !subgraphOfDegree) continue;

                for(const vFound of verticesOfDegree) {
                    for(const vSub of subgraphOfDegree) {
                        if(subgraphVerticesUsed.has(vSub.id)) continue;
                        subgraphVerticesUsed.add(vSub.id);
                        bijection.set(vFound.id, vSub.id);
                        break;
                    }
                }
            }

            // otherwise: start with the smallest set (e.g. only 1 vertex with degree 4 -> know which one it has to be)
            const generators: Generator<Map<number, number>>[] = [];
            for(const degree of subgraphDegreeAscByCount) {
                if(degree <= 1) continue;
                const verticesOfDegree = verticesByDegreeFound.get(degree);
                const subgraphsOfDegree = subgraphVerticesByDegree.get(degree);
                if(!verticesOfDegree || !subgraphsOfDegree) continue;
                if(verticesOfDegree.size === 0 || subgraphsOfDegree.size === 0) continue;

                /*console.log('degree', degree)
                console.log('verticesOfDegree', verticesOfDegree)
                console.log('subgraphsOfDegree', subgraphsOfDegree)*/

                // unique
                if(verticesOfDegree.size === 1) {
                    let v: Vertex|undefined = undefined;
                    let s: Vertex|undefined = undefined;
                    for(const vertex of verticesOfDegree) v = vertex;
                    for(const vertex of subgraphsOfDegree) s = vertex;

                    if(v && s) {
                        subgraphVerticesUsed.add(v.id);
                        bijection.set(v.id, s.id);
                        continue;
                    }
                }

                // non-unique: create a generator for the degree
                const verticesIds: number[] = [];
                const subgraphIds: number[] = [];
                for(const v of verticesOfDegree) verticesIds.push(v.id);
                for(const s of subgraphsOfDegree) subgraphIds.push(s.id);
                generators.push(BijectionsGraph(subgraphFound, subgraph, verticesIds, subgraphIds));
            }

            // all unique: already have the mapping
            if(generators.length === 0) {
                // console.log('bijection final', bijection);

                // check edges fit using the bijection
                if (subgraphFound.subgraphCheckEdgesWithBijection(subgraph, bijection)) {
                    // found a real induced subgraph: add to list
                    inducedList.push(foundIDs);
                }
            }
            // non-unique: try mappings
            else {
                // try if partial mapping is possible
                if (subgraphFound.subgraphCheckEdgesWithBijection(subgraph, bijection) === false) {
                    return;
                }

                // try all mappings
                for (const mapping of BijectionsCombination(generators)) {
                    const fullBijection = new Map(bijection);
                    for (const [k, v] of mapping) {
                        fullBijection.set(k, v);
                    }

                    // console.log('bijection from generators', fullBijection, 'generators', generators);

                    // check edges fit using the bijection
                    if (subgraphFound.subgraphCheckEdgesWithBijection(subgraph, fullBijection)) {
                        // found a real induced subgraph: add to list
                        inducedList.push(foundIDs);
                        break;
                    }
                }
            }
            return;
        }

        // base case: add high degree vertex and neighbors to found IDs
        if(foundIDs.length === 0) {
            const degreeWant = subgraphDegreesDesc[0];
            const forbiddenStart: Set<number> = new Set<number>();

            // branch on all possible vertices (based on degree)
            for(const degreeIs of graphDegreesDesc) {
                if(degreeIs < degreeWant) break;

                const verticesOfDegree = verticesByDegree.get(degreeIs);
                if(!verticesOfDegree) continue;

                // for a specific vertex with degree > want degree
                for(const vertex of verticesOfDegree) {

                    // get subsets of neighbors
                    for(const neighbors of Subsets(vertex.neighbors, degreeWant)) {
                        const foundIDsNew: number[] = [vertex.id];

                        forbiddenStart.add(vertex.id); // do not try to add this vertex in other branches
                        const forbiddenNew = new Set<number>(forbiddenStart);

                        for(const id of neighbors) {
                            foundIDsNew.push(id);
                            forbiddenNew.add(id);
                        }

                        this.subgraphSearch(inducedList, subgraph, subgraphDegreesDesc, subgraphVerticesByDegree, subgraphDegreeAscByCount,
                            graphDegreesDesc, verticesByDegree, foundIDsNew, forbiddenNew);
                    }
                }
            }
        }
        // recursion: branch on possible vertices to add (don't know which of the low degree vertices should be which low degree)
        else {
            const first = foundIDs[0];

            // find first vertex that could have more neighbors (not the first, since that is always fulfilled)
            const verticesByDegreeDescending: Vertex[] = [];

            const now = new Date();
            const subgraphFound = this.getSubgraphAlgorithm(foundIDs);
            Graph.timeGettingSubgraphSearch += new Date() - now;

            // get degrees in the currently found subgraph
            for(const vertex of subgraphFound.vertices.values()) {
                verticesByDegreeDescending.push(vertex);
            }
            verticesByDegreeDescending.sort(Vertex.SortByDegreeDescending);

            // find first degree that is smaller
            for(let i=0; i<verticesByDegreeDescending.length; ++i) {
                const vertex = verticesByDegreeDescending[i];
                const degreeIs = vertex.degree();
                const degreeWant = subgraphDegreesDesc[i];

                // degree larger - cannot fix (should not happen)
                if(degreeIs > degreeWant) {
                    // console.error('degree of a subgraph is LARGER. Not expected to happen');
                    return;
                }

                // degree already fine
                if(degreeIs == degreeWant) continue;

                // degree smaller - branch on adding a neighbor (or none: another vertex might be the next largest degree instead)
                for(const neighborID of vertex.neighbors) {
                    // do not try forbidden vertices
                    if(forbidden.has(neighborID)) continue;

                    forbidden.add(neighborID);

                    // do not try this vertex - would increase degree of first
                    if (this.vertexGet(neighborID)?.neighbors.has(first)) {
                        continue; // TODO: could try to also keep a set of "maximal" vertices which we never add neighbors to
                    }

                    foundIDs.push(neighborID);

                    // TODO: check that adding this vertex does not increase degrees of existing vertices by too much

                    // recurse
                    this.subgraphSearch(inducedList, subgraph, subgraphDegreesDesc, subgraphVerticesByDegree, subgraphDegreeAscByCount,
                        graphDegreesDesc, verticesByDegree, foundIDs, forbidden);

                    foundIDs.pop();
                }
            }
        }
    }

    public static timeCheckingEdges: number = 0;
    public subgraphCheckEdgesWithBijection(subgraph: Graph, bijection: Map<number, number>): boolean|undefined {
        const now = new Date();
        const value = this.subgraphCheckEdgesWithBijectionNotTimed(subgraph, bijection);
        Graph.timeCheckingEdges += new Date() - now;
        return value;
    }
    public subgraphCheckEdgesWithBijectionNotTimed(subgraph: Graph, bijection: Map<number, number>): boolean|undefined {
        // this = found subgraph (large IDs). subgraph = looking for this subgraph (small IDs)
        let partial = false;

        // for each pair
        for(const fromVertex of this.vertices.values()) {
            for(const toVertex of this.vertices.values()) {
                // edge exists?
                const edgeHere = fromVertex.neighbors.has(toVertex.id);

                // use bijection to get the subgraph numbers
                const fromMapped = bijection.get(fromVertex.id);
                const toMapped = bijection.get(toVertex.id);
                if(!fromMapped || !toMapped) {
                    // in a partial mapping
                    partial = true;
                    continue;
                }

                // get mapped vertices in the subgraph
                const fromSubgraph = subgraph.vertexGet(fromMapped);
                const toSubgraph = subgraph.vertexGet(toMapped);
                if(!fromSubgraph || !toSubgraph) return false;

                // console.log('from-to', fromVertex.id, toVertex.id,'mapped from-to', fromMapped, toMapped, 'edgeHere', edgeHere, 'subgraph edgeHas', subgraph.edgeHas(fromSubgraph, toSubgraph));

                // edge "exists / doesn't exist" is the same
                if(edgeHere !== subgraph.edgeHas(fromSubgraph, toSubgraph)) return false;
            }
        }

        if(partial) return undefined;
        return true;
    }

    // endregion complex functions

    //////////////////////////////////////////
    // region advanced functions
    // subgraph, components, list of vertex degrees
    //////////////////////////////////////////

    /** apply force to the vertices. Vertices with edges in-between them attract each other.
     * Vertices without edges in-between them push each other away. All Vertices are assumed
     * to have a mass of 1kg */
    public forceApply(timeDelta: number = 0.01, timeSteps: number = 150, forceAttract: number = 1.5, forcePush: number = 0.5): void {
        const velocityMap: Map<number, Vector2> = new Map<number, Vector2>();

        for(let t=0; t<timeSteps; ++t) {
            const forceMap: Map<number, Vector2> = new Map<number, Vector2>();

            // sum up forces
            for(const v of this.vertices.values()) {
                for(const w of this.vertices.values()) {
                    if(v.id >= w.id) continue;

                    const delta = w.position.minus(v.position).unit();
                    const distance = delta.length();
                    const unit = delta.unit();
                    // let forceAdd = (this.edgeHas(v, w) ? forceAttract : -forcePush) / (distance * distance);
                    let forceAdd = (this.edgeHas(v, w) ? forceAttract : -forcePush) / (distance * distance);

                    if(forceAdd > 0 && delta.length() < 20) forceAdd = -forcePush*0.1;

                    // add forces
                    forceMap.set(v.id, (forceMap.get(v.id) ?? new Vector2(0,0)).plus(unit.mult(forceAdd)));
                    forceMap.set(w.id, (forceMap.get(w.id) ?? new Vector2(0,0)).plus(unit.mult(-forceAdd)));
                }
            }

            // apply forces, move
            for(const v of this.vertices.values()) {
                const force = forceMap.get(v.id) ?? new Vector2(0,0);
                const velocityNew = (velocityMap.get(v.id) ?? new Vector2(0,0)).plus(force);
                velocityMap.set(v.id, velocityNew);

                v.position = v.position.plus(velocityNew.mult(timeDelta));
            }
        }
    }

    /** parse a graph6 string and return the graph */
    public static parseGraph6(g6: string): Graph {
        const graph = new Graph();
        let idx = 0;

        // number of vertices = first character
        const n = g6.charCodeAt(idx++) - 63;
        const radius = 20;
        for(let i=0; i<n; ++i) {
            const angle = i * 2 * Math.PI / n;
            const v = Vertex.Vertex(new Vector2(radius * Math.cos(angle), radius * Math.sin(angle)));
            v.id = i;
            v.label = "" + i;
            graph.vertexAdd(v);
        }

        // adjacency bits = other characters
        let bitBuffer = 0;
        let bitCount = 0;
        for (let i=0; i<n; i++) {
            for (let j=0; j<i; j++) {
                // every character = 6 bits
                if (bitCount === 0) {
                    bitBuffer = g6.charCodeAt(idx++) - 63;
                    bitCount = 6;
                }
                bitCount--;
                const bit = (bitBuffer >> bitCount) & 1;

                if(bit === 0) continue;
                const v = graph.vertexGet(i)!;
                const w = graph.vertexGet(j)!;
                graph.edgeAdd(v, w);
            }
        }

        return graph;
    }

    /** set edge styles based on this.eggeAdds and this.edgeRemove */
    public styleEdgesOnAddedAndRemoved() {
        for(const edge of this.edgeAdds) {
            const [from, to] = [edge.x, edge.y];
            if(!this.edgeStyle.has(from)) this.edgeStyle.set(from, new Map<number, LineStyle>());
            this.edgeStyle.get(from)!.set(to, LineStyleEdgeAdded());
        }

        for(const edge of this.edgeRemoves) {
            const [from, to] = [edge.x, edge.y];
            this.vertexGet(from)?.neighborsRemoved.add(to);
        }
    }

    /** this = subgraph, copy info (label), styles of parent `graph` */
    public subgraphCopyInfo(graph: Graph) {
        for(const v of this.vertices.values()) {
            const vParent = graph.vertexGet(v.id);
            if(!vParent) continue;
            v.position = vParent.position;
            v.label = vParent.label;
            v.style = VertexStyleClone(vParent.style);

            for(const nId of v.neighbors) {
                if(v.id >= nId) continue;
                const lineStyle = graph.edgeStyle.get(v.id)?.get(nId);
                if(!lineStyle) continue;

                if(!this.edgeStyle.has(v.id)) this.edgeStyle.set(v.id, new Map<number, LineStyle>());
                this.edgeStyle.get(v.id)!.set(nId, LineStyleClone(lineStyle));
            }
        }
    }

    public getBoundingVerticesSubgraph(vertexIDs: number[]): BoundingVertices|undefined {
        let leftMost: Vertex|undefined = undefined;
        let rightMost: Vertex|undefined = undefined;
        let upperMost: Vertex|undefined = undefined;
        let bottomMost: Vertex|undefined = undefined;

        for(const vId of vertexIDs) {
            const v = this.vertexGet(vId);
            if(!v) continue;

            if(!leftMost || v.position.x < leftMost.position.x) leftMost = v;
            if(!rightMost || v.position.x > rightMost.position.x) rightMost = v;

            if(!upperMost || v.position.y < upperMost.position.y) upperMost = v;
            if(!bottomMost || v.position.y > bottomMost.position.y) bottomMost = v;
        }

        if(!leftMost || !rightMost || !upperMost || !bottomMost) return undefined;

        return {
            leftMost,
            rightMost,
            upperMost,
            bottomMost,
        };
    }

    public setHulls(list: SubgraphWithHull[], radiusAdd = 6) {
        // count number of cliques per vertex
        for(const subgraphWithHull of list) {
            const points: Vector2[] = [];
            for(const vId of subgraphWithHull.clique) {
                const v = this.vertexGet(vId);
                if(!v) continue;
                const style = v.style ?? VertexStyleDefault();
                const radius = (style.radius ?? 14) + radiusAdd;
                points.push(v.position);

                for(let i=0; i<15; ++i) {
                    points.push(v.position.plus(Vector2.fromAngleAndLength(i * 2 * Math.PI / 15, radius)));
                }
            }
            subgraphWithHull.hull = Vector2.concaveHull(points);
        }
    }

    private visiblePanFrom: Vector2 = new Vector2(100,100);
    private visiblePanTo: Vector2 = new Vector2(100,100);
    private grid: SpatialGrid = new SpatialGrid();
    public verticesVisible: Vertex[] = [];

    public visibleUpdateGrid() {
        this.grid = new SpatialGrid();
        for(const v of this.vertices.values()) {
            this.grid.insertOrUpdate(v);
        }
    }

    /** sets `vertex.visible` for all vertices overlapping the viewport `from` - `to` */
    public setVisible(from?: Vector2, to?: Vector2, forceUpdate = false): void {
        if(from && to) {
            if(!forceUpdate && from.minus(this.visiblePanFrom).length() < 15) return;

            this.visiblePanFrom = from;
            this.visiblePanTo = to;
        }

        const visibleNow = this.grid.query(this.visiblePanFrom, this.visiblePanTo);

        const visibleIDs = new Set<number>();

        // mark visible
        for (const v of visibleNow) {
            if (!v.visible) {
                v.visible = true;
                ++v.version;
            }
            visibleIDs.add(v.id);
        }

        // mark previously visible as invisible
        for (const v of this.verticesVisible) {
            if (!visibleIDs.has(v.id)) {
                v.visible = false;
                ++v.version;
            }
        }

        this.verticesVisible = visibleNow;
    }

    /** checks whether this graph contains the vertex IDs */
    public containsVertices(selection: number[]): boolean {
        for(const vid of selection) {
            if(!this.vertices.has(vid)) return false;
        }
        return true;
    }

    /** check whether the given `graph` has the same count and IDs of vertices */
    public hasSameVertexIDs(graph: Graph): boolean {
        if(this.vertices.size !== graph.vertices.size) return false;
        for(const vid of this.vertices.keys()) {
            if(!graph.vertices.has(vid)) return false;
        }
        return true;
    }

    /** get the maximally connected components of this graph */
    public getComponents(): Graph[] {
        return this.getComponentsOfVertices(this.getVertexIDs());
    }

    /** get the maximally connected components that are connected to the given vertices */
    public getComponentsOfVertices(vertexIDs: number[]): Graph[] {
        const components: Graph[] = [];

        const found: Set<number> = new Set<number>();
        for(const vId of vertexIDs) {
            if(found.has(vId)) continue;
            const vertex = this.vertexGet(vId);
            if(!vertex) continue;

            // component IDs
            const ids: number[] = [];
            // will add neighbors
            const notYetAdded: number[] = [];

            // add one vertex and its neighborhood
            found.add(vertex.id);
            notYetAdded.push(vertex.id);

            // add neighborhoods until nothing was added
            while(notYetAdded.length > 0) {
                const vId = notYetAdded.shift();
                if(!vId) continue;

                ids.push(vId);
                const v = this.vertexGet(vId);
                if(!v) continue;

                // add neighbors
                for(const nId of v.neighbors) {
                    if(found.has(nId)) continue;
                    found.add(nId);
                    notYetAdded.push(nId);
                }
            }

            components.push(this.getSubgraphAlgorithm(ids));
        }

        return components;
    }

    /** get a subgraph of this graph without disabled vertices */
    public getSubgraphWithoutDisabled(): Graph {
        const nonDisabled: number[] = [];
        for(const vertex of this.vertices.values()) {
            if(vertex.disabled) continue;
            nonDisabled.push(vertex.id);
        }
        return this.getSubgraph(nonDisabled);
    }

    /** get a clone (new graph copy). Creates new vertices with the same IDs (doesn't use the same vertex objects) */
    public cloneAlgorithm(): Graph {
        const graph = new Graph();
        for(const vertex of this.vertices.values()) {
            graph.vertexAdd(vertex.cloneAlgorithm());
        }
        return graph;
    }

    /** get any walk with at most `path_size_max` vertices, starting in `vertex_start`.
     * Prevents v,w,v from happening but v,w,x,v could happen. O(path_size_max) */
    public getAnyWalk(startVertex: Vertex, pathMaxLength: number): Vertex[] {
        const path = [startVertex];

        let vertex = startVertex;
        for(let i=1; i<pathMaxLength; ++i) {
            let next: Vertex|undefined = undefined;

            // find first neighbor that is not `vertex`
            for(const neighborId of vertex.neighbors) {
                const v = this.vertexGet(neighborId);
                if(neighborId === vertex.id || !v) continue;
                next = v;
                break;
            }

            // did not find a new neighbor
            if(!next) break;
            vertex = next;
            path.push(vertex);
        }

        return path;
    }

    /** get a subgraph (reduced set of vertices, with the same edges). Creates new vertices with the same IDs (doesn't use the same vertex objects) */
    public getSubgraphAlgorithm(vertices: number[]): Graph {
        const graph = new Graph();

        for(const vid of vertices) {
            const vertex = this.vertexGet(vid);
            if(!vertex) continue;
            const v = vertex.clone();
            v.subgraphFilter(vertices);
            graph.vertexAdd(v);
        }

        return graph;
    }

    /** get a subgraph (reduced set of vertices, with the same edges). Creates new vertices with the same IDs (doesn't use the same vertex objects) */
    public getSubgraph(vertices: number[]): Graph {
        const graph = new Graph();

        for(const vertex of this.vertices.values()) {
            if(!vertices.includes(vertex.id)) continue;
            const v = vertex.clone();
            v.subgraphFilter(vertices);
            v.style = VertexStyleClone(vertex.style);
            graph.vertexAdd(v);

            // copy edge style to neighbors
            for(const to of v.neighbors) {
                const style = this.edgeStyle.get(v.id)?.get(to);
                if(!style) continue;
                if(!graph.edgeStyle.has(v.id)) graph.edgeStyle.set(v.id, new Map<number, LineStyle>());
                graph.edgeStyle.get(v.id)?.set(to, LineStyleClone(style));
            }
        }
        return graph;
    }

    /** add a `subgraph` to this graph. The vertices are placed at `targetPosition` + vertex.originalPosition - `referencePosition`  */
    public addSubgraph(subgraph: Graph, referencePosition: Vector2, targetPosition: Vector2): number[] {
        const insertedVertices: number[] = [];
        const bijection: Map<number, number> = new Map<number, number>();

        // copy vertices, save IDs in the bijection
        for(const original of subgraph.vertices.values()) {
            const v = Vertex.VertexFromData(original.VertexToData());
            v.id = -1;
            v.position = new Vector2(
                targetPosition.x + original.position.x - referencePosition.x,
                targetPosition.y + original.position.y - referencePosition.y
            );

            this.vertexAdd(v);
            v.style = VertexStyleClone(original.style);

            insertedVertices.push(v.id);
            bijection.set(original.id, v.id);
        }

        // add edges: the same as the original
        for(const fromOriginal of subgraph.vertices.values()) {
            for (const toOriginal of fromOriginal.neighbors) {
                if(fromOriginal.id >= toOriginal) continue;

                const from = this.vertexGet(bijection.get(fromOriginal.id) ?? -1);
                const to = this.vertexGet(bijection.get(toOriginal) ?? -1);
                if(!from || !to) continue;

                this.edgeAdd(from, to);

                // copy edge style
                const style = subgraph.edgeStyle.get(fromOriginal.id)?.get(toOriginal) ?? LineStyleDefault();
                if (!this.edgeStyle.has(from.id)) this.edgeStyle.set(from.id, new Map<number, LineStyle>());
                this.edgeStyle.get(from.id)?.set(to.id, LineStyleClone(style));
            }

            for (const toOriginal of fromOriginal.neighborsRemoved) {
                if(fromOriginal.id >= toOriginal) continue;

                const from = this.vertexGet(bijection.get(fromOriginal.id) ?? -1);
                const to = this.vertexGet(bijection.get(toOriginal) ?? -1);
                if(!from || !to) continue;

                from.neighborsRemoved.add(to.id);
            }
        }

        return insertedVertices;
    }

    /** get the degrees of all vertices sorted ascending (choose to include `duplicates` or not) */
    public getDegreesDescending(): number[] {
        const degrees: number[] = [];
        for(const vertex of this.vertices.values()) {
            const degree = vertex.degree();

            degrees.push(degree);
        }
        degrees.sort(SortNumberDescending);
        return degrees;
    }

    public getDegreesDescendingNoDuplicates(): number[] {
        const degrees: number[] = [];
        for(const vertex of this.vertices.values()) {
            const degree = vertex.degree();

            // skip: already in list
            if(degrees.includes(degree)) continue;

            degrees.push(degree);
        }
        degrees.sort(SortNumberDescending);
        return degrees;
    }

    // endregion advanced functions

    //////////////////////////////////////////
    // region basic functions
    // vertex/edge: get/add/remove
    //////////////////////////////////////////

    public getVertexIDs() {
        return this.getVerticesAsArray().map(v => v.id);
    }
    public getVerticesAsArray() {
        return this.vertices.values().toArray();
    }

    public savedVerticesSet(vertexIDs: number[]) {
        this.incrementVersion(this.savedSelection);
        this.savedSelection = vertexIDs;
        this.incrementVersion(this.savedSelection);
    }
    public activeVerticesSet(vertexIDs: number[]) {
        this.incrementVersion(this.activeVertices);
        this.activeVertices = vertexIDs;
        this.incrementVersion(this.activeVertices);
    }
    public incrementVersion(vertexIDs: number[]) {
        for (const vId of vertexIDs) {
            const v = this.vertexGet(vId);
            if (!v) continue;
            ++v.version;
        }
    }

    /** returns the number of vertices (n) in the graph */
    public n(): number {
        return this.vertices.size;
    }
    /** returns the number of vertices (n) in the graph */
    public numberOfVertices(): number {
        return this.n();
    }

    /** returns the number of edges (m) in the graph */
    public m(): number {
        let m = 0;
        for(const v of this.vertices.values()) {
            m += v.degree();
        }
        return m / 2;
    }
    /** returns the number of edges (m) in the graph */
    public numberOfEdges(): number {
        return this.m();
    }

    /** get a vertex by id */
    public vertexGet(vertexId: number): Vertex | undefined {
        return this.vertices.get(vertexId);
    }

    /** add a new vertex */
    public vertexAdd(vertex: Vertex): Vertex {
        // set an id for a new vertex (id<0)
        if(vertex.id < 0) {
            let id = 1;
            // get new id (=largest current id+1)
            for (let vid of this.vertices.keys()) {
                id = Math.max(id, vid + 1);
            }
            vertex.id = id;
        }

        this.vertices.set(vertex.id, vertex);

        // add to visible vertices for rendering
        if(vertex.visible) {
            this.verticesVisible.push(vertex);
        }

        return vertex;
    }

    /** remove a vertex */
    public vertexRemove(vertex: Vertex): void {
        this.vertices.delete(vertex.id);

        // remove edges to this vertex
        for(const neighborId of vertex.neighbors) {
            const v = this.vertexGet(neighborId);
            if(!v) continue;
            v.neighbors.delete(vertex.id);
        }
        this.setVisible(this.visiblePanFrom, this.visiblePanTo, true);

        // remove from visible vertices for rendering
        if(vertex.visible) {
            const index = this.verticesVisible.indexOf(vertex);
            if(index>=0) this.verticesVisible.splice(index, 1);
        }
    }

    /** returns TRUE iff vertex with `from` id has `to` as a neighbor */
    public edgeHas(from: Vertex, to: Vertex): boolean {
        return from.edgeHas(to);
    }

    /** add an edge. from/to: vertexId's of the vertices */
    public edgeAdd(from: Vertex, to: Vertex): void {
        from.edgeAdd(to);
        to.edgeAdd(from);
    }

    /** remove an edge. from/to: vertexId's of the vertices */
    public edgeRemove(from: Vertex, to: Vertex): void {
        from.edgeRemove(to);
        to.edgeRemove(from);
    }

    // endregion basic functions

    //////////////////////////////////////////
    // region initialization functions
    // constructor, load/save json
    //////////////////////////////////////////

    /** load a graph from json */
    public static loadFromData(data: GraphData): Graph {
        const graph = new Graph();

        graph.id = data.id;
        graph.name = data.name;
        graph.savedLast = data.savedLast;
        graph.viewData = data.viewData;

        for(const from in data.edgeStyle) {
            if(!Object.hasOwn(data.edgeStyle, from)) continue;

            graph.edgeStyle.set(+from, new Map<number, LineStyle>());
            const map = data.edgeStyle[from];
            for(const to in map) {
                if(!Object.hasOwn(map, to)) continue;
                graph.edgeStyle.get(+from)?.set(+to, map[to]);
            }
        }

        graph.vertices.clear();

        // add vertices
        for (const vertexData of data.vertices) {
            const v = graph.vertexAdd(Vertex.VertexFromData(vertexData));
            v.visible = false;
        }

        // add edges
        for (const v of data.vertices) {
            const from = graph.vertices.get(v.id);
            if (!from) continue;

            for (const neighborId of v.neighbors) {
                const to = graph.vertices.get(neighborId);
                if (!to) continue;

                graph.edgeAdd(from, to);
            }

            if(v.neighborsRemoved) for (const neighborId of v.neighborsRemoved) {
                from.neighborsRemoved.add(neighborId);
            }
        }

        return graph;
    }

    /** convert the graph to json */
    public saveToData(): GraphData {
        this.savedLast = new Date().toISOString();

        const data: GraphData = {
            id: this.id,
            name: this.name,
            savedLast: this.savedLast,
            vertices: [],
            edgeStyle: {},
            viewData: this.viewData,
        };
        for(const [from, map] of this.edgeStyle.entries()) {
            data.edgeStyle[from] = {};
            for(const [to, style] of map.entries()) {
                data.edgeStyle[from][to] = style;
            }
        }

        for (const v of this.vertices.values()) {
            data.vertices.push(v.VertexToData());
        }

        return data;
    }

    private constructor() {
    }

    /** create a new graph */
    public static Graph(): Graph {
        // const graph = new Graph();
        return new Graph();
    }
    // endregion initialization functions
}
