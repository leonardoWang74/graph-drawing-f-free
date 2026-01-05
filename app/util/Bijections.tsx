import Graph from "@/app/data/Graph";

export function* Bijections(
    foundVertices: number[],
    subVertices: number[]
): Generator<Map<number, number>> {
    const used = new Set<number>();
    const current = new Map<number, number>();

    function* backtrack(index: number): Generator<Map<number, number>> {
        if (index === foundVertices.length) {
            yield new Map(current);
            return;
        }

        const foundVertex = foundVertices[index];

        for (const subgraphVertex of subVertices) {
            if (used.has(subgraphVertex)) continue;

            used.add(subgraphVertex);
            current.set(foundVertex, subgraphVertex);

            yield* backtrack(index + 1);

            used.delete(subgraphVertex);
            current.delete(foundVertex);
        }
    }

    yield* backtrack(0);
}

export function* BijectionsGraph(
    foundGraph: Graph,
    subgraph: Graph,
    foundVertices: number[],
    subVertices: number[]
): Generator<Map<number, number>> {
    const used = new Set<number>();
    const current = new Map<number, number>();

    function* backtrack(index: number): Generator<Map<number, number>> {
        if (index === foundVertices.length) {
            yield new Map(current);
            return;
        }

        const foundVertex = foundVertices[index];

        for (const subgraphVertex of subVertices) {
            if (used.has(subgraphVertex)) continue;

            used.add(subgraphVertex);
            current.set(foundVertex, subgraphVertex);

            // check partial mapping
            const edgesConsistent = foundGraph.subgraphCheckEdgesWithBijection(subgraph, current);
            if(edgesConsistent || edgesConsistent===undefined) {
                yield* backtrack(index + 1);
            }

            used.delete(subgraphVertex);
            current.delete(foundVertex);
        }
    }

    yield* backtrack(0);
}

export function* BijectionsCombination(
    generators: Generator<Map<number, number>>[]
): Generator<Map<number, number>> {
    function* backtrack(
        index: number,
        current: Map<number, number>
    ): Generator<Map<number, number>> {
        if (index === generators.length) {
            yield new Map(current);
            return;
        }

        for (const partial of generators[index]) {
            // merge maps (degree classes are disjoint)
            for (const [k, v] of partial) {
                current.set(k, v);
            }

            yield* backtrack(index + 1, current);

            for (const k of partial.keys()) {
                current.delete(k);
            }
        }
    }

    yield* backtrack(0, new Map());
}
