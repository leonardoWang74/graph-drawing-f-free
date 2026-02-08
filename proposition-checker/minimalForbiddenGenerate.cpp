/*
Checks a proposition algorithm vs. a base algorithm.

Run using nauty geng
nauty-geng -c 14 | ./checker
*/

#include <iostream>
#include <string>
#include <vector>
#include <cstdlib>
#include <algorithm>
#include "Graph.h"

int main() {
    // std::ios::sync_with_stdio(false);
    // std::cin.tie(nullptr);

    std::string line;
    size_t s = 3;

    OverlappingEditingOptions options = {
        .useFellowsForbidden = false,
        .useForbiddenCliques = true,
    };
    std::vector<std::vector<int>> edgesAdded = std::vector<std::vector<int>>();
    std::vector<std::vector<int>> edgesRemoved = std::vector<std::vector<int>>();

    long graphsCount = 0;
    long forbiddenFound = 0;
    while (std::getline(std::cin, line)) {
        if (line.empty()) continue;
        ++graphsCount;
        /*if(graphsCount > 50) {
            std::cerr << "Stopping after 50 graphs for debugging\n";
            break;
        }*/

        Graph GraphValue = Graph::parse_graph6(line);
        Graph* G = &GraphValue;
        // n=9, graphCount=261080

        std::vector<std::vector<int>> forbidden = options.forbiddenMatrix ? 
            std::vector<std::vector<int>>(G->n(), std::vector<int>(G->n()))
            : std::vector<std::vector<int>>(G->n(), std::vector<int>());
    
        /*
        // test to_graph6 function
        if(G->to_graph6() != line) {
            exit(1);
        }*/

        // find vertex $u$ in s+1 cliques, output $u$ + smallest separating set
        auto cliqueInfo = G->getMaximalCliques(s);
        int forbiddenSizeMax = (s+1)*s+1;
        auto uVertex = cliqueInfo.vertexInMoreThanSCliques;
        if(uVertex < 0) {
            // std::cerr << line << ": No vertex in s+1 cliques\n";
            continue;
        }

        // the found forbidden subgraph
        std::vector<int> forbiddenVertices = std::vector<int>();
        forbiddenVertices.reserve(forbiddenSizeMax);
        forbiddenVertices.push_back(uVertex);

        std::unordered_set<int> forbiddenVerticesSet = std::unordered_set<int>(forbiddenSizeMax);
        forbiddenVerticesSet.insert(uVertex);

        // the clique indices overlapping the vertex
        const auto cliquesIndicesOverlappingU = cliqueInfo.vertexCliques[uVertex];
        // if there are more than s+1 cliques, we only care about at most s+1
        const auto cliqueCount = std::min(cliquesIndicesOverlappingU.size(), s+1);

        // for every pair of cliques, find one separating pair
        for(size_t i=0; i<cliqueCount; ++i) { // O(s * s * (|cliqueA| + |cliqueB| + |cliqueA|)) = O(s^n * n)) = O(s^2 * n)
            const auto cliqueA = cliqueInfo.cliqueList.at(cliquesIndicesOverlappingU[i]);

            // find separating vertices: O(s * 3n)
            for(size_t j=i+1; j<cliqueCount; ++j) {
                const auto cliqueB = cliqueInfo.cliqueList.at(cliquesIndicesOverlappingU[j]);

                // vertices in cliqueA but not in cliqueB. Copy in O(|cliqueA|)
                std::unordered_set<int> verticesCliquesInA = 
#ifndef GRAPH_H_MATRIX_AND_LIST
                    std::unordered_set<int>(cliqueA);
#else
                    std::unordered_set<int>(cliqueA.begin(), cliqueA.end());
#endif

                // vertex in $cliqueB \setminus cliqueA$
                int separatorB = -1;
                // FALSE if separatorB is a new vertex added to the forbidden subgraph, otherwise TRUE
                bool separatorBalreadyContains = false;

                // increment overlapping vertices in O(|cliqueB|)
                for(const auto v : cliqueB) {
                    // TRUE if v is in cliqueA
                    const auto inA = verticesCliquesInA.erase(v) > 0;

                    // does not overlap clique A
                    if(!inA) {
                        // take if no separator found yet OR found separator doesn't exist in the found subgraph already and this one does
                        // (minimize the size of the forbidden subgraph by choosing the same vertex multiple times if possible)
                        auto alreadyContains = forbiddenVerticesSet.find(v) != forbiddenVerticesSet.end();
                        if(separatorB < 0 || (!separatorBalreadyContains && alreadyContains)) {
                            separatorB = v;
                            separatorBalreadyContains = alreadyContains;
                        }
                    }
                }

                // vertex in $cliqueA \setminus cliqueB$
                int separatorA = -1;
                // FALSE if separatorA is a new vertex added to the forbidden subgraph, otherwise TRUE
                bool separatorAalreadyContains = false;

                // find separatorA: vertex in cliqueA and not in cliqueB in O(|cliqueA|)
                for(const auto v : verticesCliquesInA) {
                    if(G->edge_has(v, separatorB)) continue;

                    // take if no separator found yet OR found separator doesn't exist in the found subgraph already and this one does
                    // (minimize the size of the forbidden subgraph by choosing the same vertex multiple times if possible)
                    auto alreadyContains = forbiddenVerticesSet.find(v) != forbiddenVerticesSet.end();
                    if(separatorA < 0 || alreadyContains) {
                        separatorA = v;
                        separatorAalreadyContains = alreadyContains;
                        if(alreadyContains) break;
                    }
                }

                // did not find separator vertices - should never happen
                if(separatorA<0 || separatorB<0) {
                    std::cout << "\t" << __FILE__<<":"<<__LINE__<<" s="<<s<<" DID NOT FIND ANY SEPARATOR for u="<<uVertex
                        <<" cliqueA="<<Graph::vector_tostring(cliqueA)
                        <<" cliqueB="<<Graph::vector_tostring(cliqueB)
#ifndef GRAPH_H_MATRIX_AND_LIST
                        <<"\n\tgraph edges="<<Graph::vector_tostring(G->edges_list)
#else
                        <<"\n\tgraph edges="<<Graph::vector_tostring(G->edges)
#endif
                        <<"\n\tcliques="<<Graph::vector_tostring(cliqueInfo.cliqueList)
                        <<"\n";
                    exit(1);

                    // original
                    // [[9,7,6,5],[9,7,6],[8,7],[8,7],[9],[9,8,0],[9,8,1,0],[3,2,1,0],[6,5,3,2],[6,5,4,1,0]]

                    // changed
                    // [[7,9,6,5],[7,9,6],[5,8],[8,7,6],[9],[2,8,9,0],[8,3,9,1,0],[1,0,3],[3,5,6,2],[6,5,4,1,0]]
                }

                // save separator vertices
                if(!separatorAalreadyContains) forbiddenVertices.push_back(separatorA);
                forbiddenVerticesSet.insert(separatorA);
                if(!separatorBalreadyContains) forbiddenVertices.push_back(separatorB);
                forbiddenVerticesSet.insert(separatorB);

                /*std::cout << __FILE__<<":"<<__LINE__<<" s="<<s<<" k="<<k<<" u="<<uVertex
                    <<" separatorA="<<separatorA
                    <<" separatorB="<<separatorB
                    <<" cliqueA index="<<i
                    <<" cliqueB index="<<j
                    <<" cliqueA real index="<<cliquesIndicesOverlappingU[i]
                    <<" cliqueB real index="<<cliquesIndicesOverlappingU[j]
                    <<"\n\tcliqueA="<<Graph::vector_tostring(cliqueA)
                    <<" cliqueB="<<Graph::vector_tostring(cliqueB)
                    <<"\n";*/
            }
        }
    
        const auto subgraph = G->getSubgraph(forbiddenVertices);
        const auto graph6notNormalized = subgraph.to_graph6();

        // check if we can find one of our own forbidden subgraphs
        bool branchingEditsFoundSubgraph = false;
        bool branchingEditsFound = false;
        std::vector<EdgeEdit> branchingEdits;
        overlappingClusterEditingFindForbiddenInU(G, s, 0, options, uVertex, forbidden, edgesAdded, edgesRemoved, 
            branchingEditsFoundSubgraph, branchingEditsFound, branchingEdits
        );
        if(branchingEditsFoundSubgraph) continue;

        ++forbiddenFound;
        // if(graphsCount % 10000 == 0) std::cerr << "Found "<<forbiddenFound<<" forbidden\n";
        std::cout << graph6notNormalized << "\n";
        // const auto graph6 = normalize_with_nauty_external(graph6notNormalized);

        // did not yet find this graph - insert
        /* if(foundForbiddenGraph6.find(graph6) == foundForbiddenGraph6.end()) {
            foundForbidden.push_back(G->getSubgraph(forbiddenVertices));
            foundForbiddenGraph6.insert(graph6);
        }*/
    }

    /*for(auto g : foundForbidden) {
        std::cout << Graph::vector_tostring(g.edges) << "\n";
    }*/

    return 0;
}
