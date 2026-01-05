import Vector2 from "@/app/data/Vector2";
import {Vertex, VertexData} from "@/app/data/Vertex";
import Subsets from "@/app/util/Subsets";
import {ArrayEquals} from "@/app/util/ArrayUtils";
import {SortNumberDescending} from "@/app/util/SortUtils";
import {BijectionsCombination, BijectionsGraph} from "@/app/util/Bijections";

export default class Graph {
    private vertices: Map<number, Vertex> = new Map<number, Vertex>();

    //////////////////////////////////////////
    // region complex functions
    // list induced subgraphs, add a clique
    //////////////////////////////////////////

    /** find induced subgraphs of `subgraph` (must be a connected graph). The returned subgraphs retain the vertex IDs but not the object identity */
    public inducedSubgraphs(subgraph: Graph): Graph[] {
        // simple algorithm idea: only check subgraphs where the degree of the vertices fit, starting with the largest (in the given subgraph)
        const inducedList: Graph[] = [];

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
                inducedList.push(graph);
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
        const graphDegreesDesc: number[] = this.getDegreesDescending(false); // (does not contain duplicates)
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

    private subgraphSearch(
        inducedList: Graph[],
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
            const subgraphFound = this.getSubgraphArray(foundIDs);

            // degrees don't match - discard
            if(!ArrayEquals(subgraphDegreesDesc, subgraphFound.getDegreesDescending())) return;

            // check if there is a bijective function: found -> subgraph
            const bijection : Map<number, number> = new Map<number, number>();
            const subgraphVerticesUsed : Set<number> = new Set<number>();

            // get vertices by degree of found subgraph
            const verticesByDegreeFound: Map<number, Set<Vertex>> = new Map<number, Set<Vertex>>();
            for(const vertex of subgraphFound.vertices.values()) {
                const degree = vertex.degree();
                if(!verticesByDegreeFound.has(degree)) verticesByDegreeFound.set(degree, new Set<Vertex>());
                verticesByDegreeFound.get(degree)?.add(vertex);
            }

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

                // unique
                if(verticesOfDegree.size === 1) {
                    subgraphVerticesUsed.add(subgraphsOfDegree[0].id);
                    bijection.set(verticesOfDegree[0].id, subgraphsOfDegree[0].id);
                    continue;
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
                // check edges fit using the bijection
                if (this.subgraphCheckEdgesWithBijection(subgraphFound, bijection)) {
                    // found a real induced subgraph: add to list
                    inducedList.push(subgraphFound);
                }
            }
            // non-unique: try mappings
            else {
                for (const mapping of BijectionsCombination(generators)) {
                    const fullBijection = new Map(bijection);
                    for (const [k, v] of mapping) {
                        fullBijection.set(k, v);
                    }

                    // check edges fit using the bijection
                    if (this.subgraphCheckEdgesWithBijection(subgraphFound, fullBijection)) {
                        // found a real induced subgraph: add to list
                        inducedList.push(subgraphFound);
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
            const subgraphFound = this.getSubgraphArray(foundIDs);

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

    public subgraphCheckEdgesWithBijection(subgraph: Graph, bijection: Map<number, number>): boolean|undefined {
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

                // edge "exists / doesn't exist" is the same
                if(edgeHere !== subgraph.edgeHas(fromSubgraph, toSubgraph)) return false;
            }
        }

        if(partial) return undefined;
        return true;
    }

    /** add a clique to the graph. The `count` vertices are placed in a circle around `position` with `radius` */
    public addClique(position: Vector2, count: number, radius: number = 50): Vertex[] {
        const cliqueVertices: Vertex[] = [];
        if(count <= 0) return cliqueVertices;

        // add vertices in a circle
        let angle = 0;
        const angleDelta = 2 * Math.PI / count;
        for(let i=0; i<count; ++i) {
            const vertex = this.vertexAdd(Vertex.Vertex(new Vector2(
                position + radius * Math.cos(angleDelta),
                position + radius * Math.sin(angleDelta)
            )));
            cliqueVertices.push(vertex);

            angle += angleDelta;
        }

        // add edges between all clique vertices
        for(const v1 of cliqueVertices) {
            for (const v2 of cliqueVertices) {
                if(v1.equals(v2)) continue;
                this.edgeAdd(v1, v2);
            }
        }

        return cliqueVertices;
    }

    // endregion complex functions

    //////////////////////////////////////////
    // region advanced functions
    // subgraph, list of vertex degrees
    //////////////////////////////////////////

    /** get a subgraph (reduced set of vertices, with the same edges). Creates new vertices with the same IDs (doesn't use the same vertex objects) */
    public getSubgraphArray(vertices: number[]): Graph {
        const graph = new Graph();

        for(const vertex of this.vertices.values()) {
            if(!vertices.includes(vertex.id)) continue;
            const v = vertex.clone();
            v.subgraphFilterArray(vertices);
            graph.vertexAdd(v);
        }

        return graph;
    }

    /** get a subgraph (reduced set of vertices, with the same edges). Creates new vertices with the same IDs (doesn't use the same vertex objects) */
    public getSubgraph(vertices: Set<number>): Graph {
        const graph = new Graph();

        for(const vertex of this.vertices.values()) {
            if(!vertices.has(vertex.id)) continue;
            const v = vertex.clone();
            v.subgraphFilter(vertices);
            graph.vertexAdd(v);
        }

        return graph;
    }

    /** get the degrees of all vertices sorted ascending (choose to include `duplicates` or not) */
    public getDegreesDescending(duplicates: boolean = false): number[] {
        const degrees: number[] = [];
        for(const vertex of this.vertices.values()) {
            const degree = vertex.degree();

            // skip if: want no duplicates && already in list
            if(!duplicates && degrees.includes(degree)) continue;

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
    public loadFromJson(json: string): void {
        const data = JSON.parse(json) as { vertices: VertexData[] };

        this.vertices.clear();

        // add vertices
        for (const vertexData of data.vertices) {
            this.vertexAdd(Vertex.Vertex(vertexData));
        }

        // add edges
        for (const v of data.vertices) {
            const from = this.vertices.get(v.id);
            if (!from) continue;

            for (const neighborId of v.neighbors) {
                const to = this.vertices.get(neighborId);
                if (!to) continue;

                this.edgeAdd(from, to);
            }
        }
    }

    /** convert the graph to json */
    public saveToJson(): string {
        const vertices: VertexData[] = [];

        for (const v of this.vertices.values()) {
            vertices.push({
                id: v.id,
                label: v.label,
                x: v.position.x,
                y: v.position.y,
                neighbors: Array.from(v.neighbors).filter(to => to >= v.id),
            });
        }

        return JSON.stringify({ vertices: vertices });
    }

    private constructor() {
    }

    /** create a new graph */
    public static Graph(): Graph {
        const graph = new Graph();

        const v1 = graph.vertexAdd(Vertex.Vertex(new Vector2(0,0 )));
        const v2 = graph.vertexAdd(Vertex.Vertex(new Vector2(50,0 )));
        graph.edgeAdd(v1, v2);

        return graph;
    }
    // endregion initialization functions
}
