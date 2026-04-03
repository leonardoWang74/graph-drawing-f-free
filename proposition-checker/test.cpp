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
    size_t s = 3;
    OverlappingEditingOptions options = {
        .useFellowsForbidden = false,
        .useForbiddenCliques = false,
        .forbidCriticalCliques = true,
        .noSharedNeighborProposition = false,
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

    auto bound = G.overlappingClusterEditingLowerBound(s, -1, options);
    std::cout << "Lower bound="<<bound<<"\n";

    for(int k=0; k<=kBound; ++k) {
        std::cout << "k="<<k<<"\n";
        auto overlappingSolutions = G.overlappingClusterEditingSolutionsBranchAndBound(s, k, options, 0);
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

int findAndRemoveTwoRandomEdgesBound(Graph* G, int n, int edges_removed=0) {
    int bound = G->m();

    // find triangle
    bool triangleFound = false;
    std::vector<int> triangle = std::vector<int>(3, 0);
    for(int i=0; i<n; ++i) {
        const auto neighbors = G->neighbors(i);
        for(auto j : neighbors) {
            for(auto k : neighbors) {
                if(j > k) continue;
                if(!G->edge_has(j,k)) continue;

                triangle[0] = i;
                triangle[1] = j;
                triangle[2] = k;
                triangleFound = true;

                // remove edges
                G->edge_remove(i, j);
                G->edge_remove(j, k);
                G->edge_remove(k, i);

                // recurse - remove another triangle
                // boundHere.push_back(findAndRemoveTwoRandomEdgesBound(G, n, edges_removed+2));
                bound = std::min(bound, findAndRemoveTwoRandomEdgesBound(G, n, edges_removed+3));

                // re-add edges
                G->edge_add(i, j);
                G->edge_add(j, k);
                G->edge_add(k, i);

                // first triangle doesn't matter how it looks, as all clique vertices are the same
                if(edges_removed == 0) break;
            }
            if(triangleFound) break;
        }
        if(triangleFound) break;
    }
    return bound;

    // go through all possible ways to delete two random edges = keep 1 edge
    /*std::vector<std::vector<int>> edges = {
        {triangle[0], triangle[1]},
        {triangle[1], triangle[2]},
        {triangle[0], triangle[2]},
    };

    std::vector<int> boundHere = {};
    for(int edgeKeep=0; edgeKeep<3; ++edgeKeep) {
        // remove edges
        for(int edgeDelete=0; edgeDelete<3; ++edgeDelete) {
            if(edgeDelete == edgeKeep) continue;
            G->edge_remove(edges[edgeDelete][0], edges[edgeDelete][1]);
        }

        // recurse - remove another triangle
        boundHere.push_back(findAndRemoveTwoRandomEdgesBound(G, n, edges_removed+2));
        // bound = std::max(bound, findAndRemoveTwoRandomEdgesBound(G, n, edges_removed+2));

        // re-add edges
        for(int edgeDelete=0; edgeDelete<3; ++edgeDelete) {
            if(edgeDelete == edgeKeep) continue;
            G->edge_add(edges[edgeDelete][0], edges[edgeDelete][1]);
        }
    }

    // we can choose the best of the two worst outcomes
    std::sort(boundHere.begin(), boundHere.end());
    bound = std::max(bound, boundHere[1]);

    return bound;*/
}


void cliqueSeparatorWorstCaseFindBranch(Graph* G, 
    int& numberOfCliquesToSeparatorSize, std::vector<std::unordered_set<int>>& cliques, int& minFound, int& propositionMinimum,
    std::vector<int> separators, int separatorCount, size_t indexA, size_t indexB
) {
    auto& A = cliques[indexA];
    auto& B = cliques[indexB];

    // try all possible separators separating clique indexA and clique indexB, then branch further for a different clique pair
    auto AwithoutB = Graph::set_difference(A, B);
    auto BwithoutA = Graph::set_difference(B, A);

    for(auto a : AwithoutB) {
        for(auto b : BwithoutA) {
            if(minFound <= propositionMinimum) return;

            // separators are not adjacent
            if(G->edge_has(a,b)) continue;

            // duplicate check by being a set
            auto aIsNew = separators[a] == 0;
            auto bIsNew = separators[b] == 0;

            auto separatorCountNew = separatorCount;
            // count separators, then bound
            if(aIsNew) ++separatorCountNew;
            if(bIsNew) ++separatorCountNew;

            // current found worse than already found solution
            if(separatorCountNew >= minFound) continue;

            // add to separators if bound is fine
            if(aIsNew) separators[a] = 1;
            if(bIsNew) separators[b] = 1;

            // branch by incrementing indexB
            if(indexB+1 < cliques.size()) {
                cliqueSeparatorWorstCaseFindBranch(G, numberOfCliquesToSeparatorSize, cliques, 
                    minFound, propositionMinimum, separators, separatorCountNew, indexA, indexB+1);
            }
            // branch by incrementing indexA
            else if(indexA + 2 < cliques.size()) {
                cliqueSeparatorWorstCaseFindBranch(G, numberOfCliquesToSeparatorSize, cliques, 
                    minFound, propositionMinimum, separators, separatorCountNew, indexA+1, indexA+2);
            }
            // finished with branching: check the separator size
            else {
                minFound = std::min(separatorCountNew, minFound);
                if(minFound <= propositionMinimum) {
                    std::cout << "######## Graph "<<G->to_graph6()<<" needs "<<separators.size()<<" separators for "<<Graph::vector_tostring(cliques)<<" - separators="<<Graph::vector_tostring(separators)<<"\n";
                    return;
                }
            }

            // reset vector for other branches
            if(aIsNew) separators[a] = 0;
            if(bIsNew) separators[b] = 0;
        }
    }

}

void cliqueSeparatorWorstCaseFind(Graph* G, int& numberOfCliquesToSeparatorSize, std::vector<std::unordered_set<int>>& cliques
) {
    if(cliques.size() < 2) return;

    // try all possible separators
    auto c = cliques.size();
    int minFound = c * (c - 1); // worst case upper bound is (c choose 2)
    int propositionMinimum = 6;
    auto separators = std::vector<int>(G->n(), 0);
    cliqueSeparatorWorstCaseFindBranch(G, numberOfCliquesToSeparatorSize, cliques, minFound, propositionMinimum, separators, 0, 0, 1);

    // set worst case as the minimum found
    numberOfCliquesToSeparatorSize = std::max(minFound, numberOfCliquesToSeparatorSize);

    if(minFound > propositionMinimum) {
        std::cout << "######## Graph "<<G->to_graph6()<<" needs "<<minFound<<" separators for "<<Graph::vector_tostring(cliques)<<"\n";
        // exit(0);
    }
}

int counter = 0;
// trying all separators, we look for the smallest set of separators. What is the MAXIMUM of that smallest set (depending on the number of cliques)?
void cliqueSeparatorWorstCase() {
    /* Results on connected and non-connected graphs:
         cliques: 2, separators: 2
    n=8: cliques: 3, separators: 4
    n=8: cliques: 4, separators: 6, example: 4 triangles (3-cliques)
        n=9: same
        n=10: same
        n=11: 
        n=12: 
    n=8: cliques: 5, separators: 8, example: 5 4-cliques
    n=8: cliques: 6, separators: 8 but probably not enough freedom to have hard instances
    */
    int numberOfCliquesToSeparatorSize = 0;
    size_t c = 5;

    // create graph
    Graph GraphValue = Graph(12);
    Graph* G = &GraphValue;
    int n = G->n();
    int nHalf = n / 2;
    for(int v=0; v<n; ++v) {
        for(int i=1; i<nHalf; ++i) {
            int w = (v + i) % n;
            G->edge_add(v, w);
        }
    }

    // get all cliques
    auto cliqueInfo = G->getMaximalCliques(999999);

    // create sets out of the cliques
    std::vector<std::unordered_set<int>> cliques = {};
    for(auto& clique : cliqueInfo.cliqueList) {
        cliques.push_back(std::unordered_set<int>(clique.begin(), clique.end()));
    }
    
    // lambda to receive the indices and call the solver function
    auto lambda = [G,&numberOfCliquesToSeparatorSize,&cliques](size_t n, std::vector<size_t> indices) {
        // make list of the chosen cliques
        std::vector<std::unordered_set<int>> chosenCliques = {};
        for(auto i : indices) {
            chosenCliques.push_back(cliques[i]);
        }
        cliqueSeparatorWorstCaseFind(G, numberOfCliquesToSeparatorSize, chosenCliques);
        return true;
    };

    // try ALL subsets of cliques: size at least 3, since for 2 cliques we need at most 2 separators
    // if(cliqueInfo.cliqueList.size() < 3) return;
    /*for(size_t s = 3; s <= cliqueInfo.cliqueList.size(); ++s) {
        SubsetsOfSizeLoop(cliques.size(), s, lambda);
    }*/

    // only care about =c cliques
    if(cliques.size() >= c) SubsetsOfSizeLoop(cliques.size(), c, lambda);
    std::cout << "Graph "<<G->to_graph6()<<" with n="<<n<<" nHalf="<<nHalf<<" c="<<c<<" current size="<< numberOfCliquesToSeparatorSize<<"\n";
    

    // numberOfCliquesToSeparatorSize[s] = std::min(countCliques, numberOfCliquesToSeparatorSize[s]);
}

// build cliques of fixed size, find the lower bound edges that are left after loop: finding a triangle and it.
void testForbiddenSizeRemovingTwoRandomEdgesOfTrianglesLowerBound(){
    for(size_t s=2; s<20; ++s) {
        int n = s+1;

        Graph GraphValue = Graph(n);
        Graph* G = &GraphValue;

        // create clique
        for(int i=0; i<n; ++i) {
            for(int j=i+1; j<n; ++j) {
                G->edge_add(i, j);
            }
        }

        /*
        For s=2, n=3 the max number of edges left is bound=1
        For s=3, n=4 the max number of edges left is bound=2
        For s=4, n=5 the max number of edges left is bound=4
        For s=5, n=6 the max number of edges left is bound=5
        For s=6, n=7 the max number of edges left is bound=7
        For s=7, n=8 the max number of edges left is bound=8
        For s=8, n=9 the max number of edges left is bound=10
        For s=9, n=10 the max number of edges left is bound=13
        */
        int bound = findAndRemoveTwoRandomEdgesBound(G, n);
        std::cout << "For s="<<s<<", n="<<n
            <<" the max number of edges left is bound="<<bound<<"\n";
    }
}

int main() {
    std::cout << "Starting\n";

    // testGraph();
    // testForbiddenSizeRemovingTwoRandomEdgesOfTrianglesLowerBound();
    cliqueSeparatorWorstCase();

    std::cout << "Success!\n";
    return 0;
}
