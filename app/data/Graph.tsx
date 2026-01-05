import Vector2 from "@/app/data/Vector2";
import {Vertex} from "@/app/data/Vertex";
import Subsets from "@/app/util/Subsets";
import {ArrayEquals} from "@/app/util/ArrayUtils";
import {SortNumberDescending} from "@/app/util/SortUtils";

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
        const subgraphDegreesDescending = subgraph.getDegreesDescending();

        // empty subgraph: return nothing
        if(subgraphDegreesDescending.length === 0) return inducedList;
        // largest degree 0 -> every vertex is an induced subgraph
        if(subgraphDegreesDescending[0] === 0) {
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
        for(const vertex of subgraph.vertices.values()) {
            const degree = vertex.degree();
            if(!subgraphVerticesByDegree.has(degree)) subgraphVerticesByDegree.set(degree, new Set<Vertex>());
            subgraphVerticesByDegree.get(degree)?.add(vertex);
        }

        // build a map of the degrees in the current graph
        const graphDegreesDescending: number[] = this.getDegreesDescending(false); // (does not contain duplicates)
        const verticesByDegree: Map<number, Set<Vertex>> = new Map<number, Set<Vertex>>();
        for(const vertex of this.vertices.values()) {
            const degree = vertex.degree();
            if(!verticesByDegree.has(degree)) verticesByDegree.set(degree, new Set<Vertex>());
            verticesByDegree.get(degree)?.add(vertex);
        }

        // empty graph: return nothing
        if(graphDegreesDescending.length === 0) return inducedList;

        // starting with the highest degree, find subsets of neighbors we can include
        this.subgraphSearch(inducedList, subgraph, subgraphDegreesDescending, subgraphVerticesByDegree, graphDegreesDescending, verticesByDegree, []);

        return inducedList;
    }

    private subgraphSearch(
        inducedList: Graph[],
        subgraph: Graph,
            subgraphDegreesDescending: number[],
            subgraphVerticesByDegree: Map<number, Set<Vertex>>,
        graphDegreesDescending: number[],
            verticesByDegree: Map<number, Set<Vertex>>,
        foundIDs: number[],
        forbidden: Set<number> = new Set<number>() // cannot add these vertices
    ): void {
        // found enough vertices - add to preliminary list of subgraph (still have to check bijective mapping)
        if(foundIDs.length >= subgraphDegreesDescending.length) {
            // create subgraph
            const subgraphFound = this.getSubgraphArray(foundIDs);

            // degrees don't match - discard
            if(!ArrayEquals(subgraphDegreesDescending, subgraphFound.getDegreesDescending())) return;

            // check if there is a bijective function: for smallest degree
            throw new Error("not implemented");

            // found a real induced subgraph: add to list
            inducedList.push(subgraphFound);
            return;
        }

        // base case: add high degree vertex and neighbors to found IDs
        if(foundIDs.length === 0) {
            const degreeWant = subgraphDegreesDescending[foundIDs.length];

            // branch on all possible vertices (based on degree)
            for(const degreeIs of graphDegreesDescending) {
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

                        this.subgraphSearch(inducedList, subgraph, subgraphDegreesDescending, subgraphVerticesByDegree,
                            graphDegreesDescending, verticesByDegree, foundSubgraph, forbidden);
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
                const degreeWant = subgraphDegreesDescending[i];

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
                    this.subgraphSearch(inducedList, subgraph, subgraphDegreesDescending, subgraphVerticesByDegree,
                        graphDegreesDescending, verticesByDegree, foundIDs, forbidden);

                    foundIDs.pop();
                }
            }
        }
    }

    private subgraphCreateAndCheck(inducedList: Graph[], subgraph: Graph, subgraphDegreesDescending: number[], foundIDs: number[]): boolean {
        // create subgraph
        const subgraphFound = this.getSubgraphArray(foundIDs);

        // degrees don't match - discard
        if(!ArrayEquals(subgraphDegreesDescending, subgraphFound.getDegreesDescending())) return false;

        // check if there is a bijective function: for smallest degree
        throw new Error("not implemented");

        // found a real induced subgraph: add to list
        inducedList.push(subgraphFound);
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
            let id = 0;
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
        throw new Error("not implemented");
    }

    /** convert the graph to json */
    public saveToJson(json: string): void {
        throw new Error("not implemented");
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
