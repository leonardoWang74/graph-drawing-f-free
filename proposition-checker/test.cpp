#include <iostream>
#include <string>
#include <vector>
#include <cstdlib>
#include <algorithm>
#include "Graph.h"

#ifndef DEBUG
#define DEBUG
#endif

void testGraph() {
    OverlappingEditingOptions options = {
        .useFellowsForbidden = true,
        .useForbiddenCliques = false,
        .forbidCriticalCliques = false,
        .noSharedNeighborProposition = false,
        .forbiddenTakeFirst = true,
    };

    // normal solution k=3: Solution: Edges Added:[[2,3,3],[0,9,2]], Edges Removed:[[1,9,1]]

    Graph G = Graph::parse_graph6("I?`DdfKQw");

    /*Graph G = Graph(12);
    // add clique on the first 3 vertices
    G.edge_add(0, 1);
    G.edge_add(0, 2);
    G.edge_add(1, 2);
    // add star edges
    for(int i=3; i<G.n(); ++i) {
        G.edge_add(0, i);
        G.edge_add(1, i);
        G.edge_add(2, i);
    }*/

    std::cout << "Parsing graph success with " << G.n() << " vertices and " << G.m() << " edges \n";
    std::cout << "Edges"<<Graph::vector_tostring(G.edges)<<"\n";

    auto ordering = G.getDegeneracyOrdering();

    std::cout << "Degeneracy: " << ordering.degeneracy << "\n";
    std::cout << "Ordering: "<<Graph::vector_tostring(ordering.ordering)<<"\n";
    std::cout << "\n";

    auto cliques = G.getMaximalCliques();

    std::cout << "Maximal cliques: " << cliques.cliqueList.size() << "\n";
    for(auto clique : cliques.cliqueList) {
        std::cout << "Clique: " << Graph::vector_tostring(clique) << "\n";
    }
    std::cout << "\n";

    auto cliqueInfo = G.getMaximalCliques(2);
    std::cout << "vertex in more than 2 cliques: "<<cliqueInfo.vertexInMoreThanSCliques<<"\n";
    std::cout << "vertex clique maps: "<<Graph::vector_tostring(cliqueInfo.vertexCliques)<<"\n";
    std::cout << "\n";

    const int kBound = 3;
    // const int kBound = G.n() * G.n();

    auto bound = G.overlappingClusterEditingLowerBound(2, -1, options);
    std::cout << "Lower bound="<<bound<<"\n";

    for(int k=0; k<=kBound; ++k) {
        std::cout << "k="<<k<<"\n";
        auto overlappingSolutions = G.overlappingClusterEditingSolutionsBranchAndBound(2, k, options, 0);
        if(overlappingSolutions.size() == 0) {
            std::cout << "k="<<k<<": No solutions found in "<<OverlappingEditingOptionsToString(options)<<"\n";
            std::cout << "#########################################################\n";
            std::cout << "#########################################################\n";
            std::cout << "#########################################################\n";
            continue;
        }

        std::cout << "k="<<k<<": Found "<<overlappingSolutions.size()<<" solutions in "<<OverlappingEditingOptionsToString(options)<<"\n";
        for(auto solution : overlappingSolutions) {
            std::cout << "\tSolution: ";
            std::cout << "Edges Added:"<<Graph::vector_tostring(solution.edgesAdded)<<"";
            std::cout << ", Edges Removed:"<<Graph::vector_tostring(solution.edgesRemoved)<<"\n";
        }
        break;
    }
}

void testStars() {
    OverlappingEditingOptions options = {
        .noSharedNeighborProposition = false,
        .forbiddenTakeFirst = true,
    };

    int s = 2;

    for(int leaves=450; leaves<1000; ++leaves) {
        int n = 1 + leaves;
        Graph G = Graph(n);

        // add star edges
        for(int vid=1; vid<n; ++vid) {
            G.edge_add(0, vid);
        }

        for(int k=n-3; k<=n; ++k) {
            // std::cout << "n="<<n<<", k="<<k<<"\n";
            auto overlappingSolutions = G.overlappingClusterEditingSolutionsBranchAndBound(2, k, options, 1);
            if(overlappingSolutions.size() == 0) {
                /*std::cout << "n="<<n<<", k="<<k<<": No solutions found in "<<OverlappingEditingOptionsToString(options)<<"\n";
                std::cout << "#########################################################\n";
                std::cout << "#########################################################\n";
                std::cout << "#########################################################\n";*/
                continue;
            }

            std::cout << "leaves="<<leaves<<", k="<<k<<"\n";
            if(k != leaves - s) {
                std::cout << "\tsolution is not k = leaves-s\n";
            }
            /*for(auto solution : overlappingSolutions) {
                std::cout << "\tSolution: ";
                std::cout << "Edges Added:"<<Graph::vector_tostring(solution.edgesAdded)<<"";
                std::cout << ", Edges Removed:"<<Graph::vector_tostring(solution.edgesRemoved)<<"\n";
            }*/
            break;
        }
    }
}

int main() {
    std::cout << "Starting\n";

    testGraph();

    std::cout << "Success!\n";
    return 0;
}
