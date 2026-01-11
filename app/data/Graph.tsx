import Vector2 from "@/app/data/Vector2";
import {Vertex, VertexData, VertexStyle, VertexStyleClone} from "@/app/data/Vertex";
import Subsets from "@/app/util/Subsets";
import {ArrayEquals} from "@/app/util/ArrayUtils";
import {SortNumberDescending} from "@/app/util/SortUtils";
import {BijectionsCombination, BijectionsGraph} from "@/app/util/Bijections";

export interface GraphData {
    id: number;
    name: string;
    savedLast: string;
    vertices: VertexData[];
    edgeStyle: Record<number, Record<number, LineStyle>>;
}

export type LineType = "solid" | "dashed" | "dotted";

export interface LineStyle {
    color: string;
    type: LineType;
    weight: number;
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

export function VertexStyleDefault(): VertexStyle {
    return {
        show: 'id:label',
        radius: 18,
        textColor: '#000000',
        bgColor: '#ffffff',
        lineStyle: LineStyleDefault(),
    };
}

export default class Graph {
    public id: number;
    public name: string = 'A graph';
    public savedLast: string = '';

    public active: boolean = false;

    public vertices: Map<number, Vertex> = new Map<number, Vertex>();
    public edgeStyle: Map<number, Map<number, LineStyle>> = new Map<number, Map<number, LineStyle>>();
    public edgesForbidden: Map<number, Set<number>> = new Map<number, Set<number>>();

    public activeVertices: number[] = [];
    public forbiddenInduced: number[][] = [];

    public cliquesMaximal: Set<number>[] = [];
    public cliqueVertexCounts: Map<number, number> = new Map<number, number>();

    //////////////////////////////////////////
    // region complex functions
    // list induced subgraphs, get degeneracy, find maximal cliques
    //////////////////////////////////////////

    /** find maximal cliques in the graph */
    public getMaximalCliques(): Set<number>[] {
        // could first calculate the degeneracy and choose which algorithm to run
        // e.g. if degeneracy is high, use the matrix multiplication algorithm
        return this.BronKerboschDegeneracyByEppsteinLoefflerStrash();
    }

    /** Bron-Kerbosch based on degeneracy by Eppstein, Loeffller and Strash.
     * [Eppstein et al. 2010 - Listing All Maximal Cliques in Sparse Graphs in Near-optimal Time, Figure 4: BronKerboschDegeneracy]
     */
    public BronKerboschDegeneracyByEppsteinLoefflerStrash(): Set<number>[] {
        const list: Set<number>[] = [];

        const degeneracyInfo = this.getDegeneracyOrdering();

        // for each vertex vi in a degeneracy ordering $v_0, v_1, v_2, \dots$ of $(V,E)$ do
        for(let i = 0; i < degeneracyInfo.ordering.length; ++i) {
            const vId = degeneracyInfo.ordering[i];
            const v = this.vertexGet(vId);
            if(!v) continue;

            // const previous = new Set<number>(degeneracyInfo.ordering.slice(0, i));
            const next = new Set<number>(degeneracyInfo.ordering.slice(i+1, degeneracyInfo.ordering.length));

            // $ P \leftarrow N(v_i) \cap \{v_{i+1}, \dots, v_{n-1}\}$
            // P = Neighborhood intersected with neighbors later in the ordering
            const P = v.neighbors.intersection(next);

            // $ X \leftarrow N(v_i) \cap \{v_0, \dots, v_{i-1}\}$
            // X = Neighborhood intersected with neighbors earlier in the ordering

            // $P \cup X = N(v_i)$ holds therefore also $X = N(v_i) \setminus P$
            // so we don't need to calculate the slice of the previous vertices in the ordering
            const X = v.neighbors.difference(P);

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
            const v = this.vertexGet(vId);
            if(!v) continue;
            const value = P.intersection(v.neighbors).size;
            if(value > pivotValue) {
                pivot = v;
                pivotValue = value;
            }
        }
        if(!pivot) return;

        // for each vertex $v \in P \setminus N(u)$ do
        const loopSet= P.difference(pivot.neighbors);
        for(const vId of loopSet) {
            const v = this.vertexGet(vId);
            if(!v) return;

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
        for(const v of this.vertices.values()) {
            const degree = v.degree();
            smallestDegree = Math.min(smallestDegree, degree);

            if(!degreesMap.has(degree)) degreesMap.set(degree, []);
            degreesMap.get(degree)?.push(v);

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
                        if(verticesMap.has(smallestDegree)) break;
                    }
                }
            }

            // remove from the graph
            verticesMap.delete(v.id);

            // remove neighbors
            let degeneracyHere = 0;
            for(const neighbor of v.neighbors) {
                const neighborVertex = this.vertexGet(neighbor);
                if(!neighborVertex) continue;

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
                if(degreePrevious <= smallestDegree) {
                    smallestDegree = degreePrevious - 1;
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
        // found enough vertices - add to preliminary list of subgraph
        if(foundIDs.length >= subgraphDegreesDesc.length) {
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

            // branch on all possible vertices (based on degree)
            for(const degreeIs of graphDegreesDesc) {
                if(degreeIs < degreeWant) break;

                const verticesOfDegree = verticesByDegree.get(degreeIs);
                if(!verticesOfDegree) continue;

                // for a specific vertex with degree > want degree
                for(const vertex of verticesOfDegree) {

                    // get subsets of neighbors
                    for(const neighbors of Subsets(vertex.neighbors, degreeWant)) {
                        const foundSubgraph: number[] = [vertex.id];
                        const forbidden: Set<number> = new Set<number>();
                        forbidden.add(vertex.id);

                        for(const id of neighbors) {
                            foundSubgraph.push(id);
                            forbidden.add(id);
                        }

                        this.subgraphSearch(inducedList, subgraph, subgraphDegreesDesc, subgraphVerticesByDegree, subgraphDegreeAscByCount,
                            graphDegreesDesc, verticesByDegree, foundSubgraph, forbidden);
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
        const components: Graph[] = [];

        const found: Set<number> = new Set<number>();
        for(const vertex of this.vertices.values()) {
            if(found.has(vertex.id)) continue;

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

    /** get a subgraph (reduced set of vertices, with the same edges). Creates new vertices with the same IDs (doesn't use the same vertex objects) */
    public getSubgraphAlgorithm(vertices: number[]): Graph {
        const graph = new Graph();

        for(const vertex of this.vertices.values()) {
            if(!vertices.includes(vertex.id)) continue;
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
                const style = subgraph.edgeStyle.get(fromOriginal.id)?.get(toOriginal);
                if(style) {
                    if (!this.edgeStyle.has(from.id)) this.edgeStyle.set(from.id, new Map<number, LineStyle>());
                    this.edgeStyle.get(from.id)?.set(to.id, LineStyleClone(style));
                }
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

    //////////////////////////////////////////
    // region basic functions
    // vertex/edge: get/add/remove
    //////////////////////////////////////////

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
        return m;
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
            graph.vertexAdd(Vertex.VertexFromData(vertexData));
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
        const graph = new Graph();

        const v1 = graph.vertexAdd(Vertex.Vertex(new Vector2(50,50 )));
        const v2 = graph.vertexAdd(Vertex.Vertex(new Vector2(100,50 )));
        graph.edgeAdd(v1, v2);

        return graph;
    }
    // endregion initialization functions
}
