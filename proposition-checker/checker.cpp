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

    // even if every non-isomorphic graph works, the "random" selection of forbidden subgraph doesn't guarantee it will always work

    size_t s = 3;
    OverlappingEditingOptions optionsProposition = {
        .useFellowsForbidden = false,
        .useForbiddenCliques = true,
        .forbidCriticalCliques = true, 
        .forbidCliques = false, // counterexample: "2"-star triangles I???CB{{w - maybe this will never work
        .noSharedNeighborProposition = false, // found counterexample
        .isolateProposition = true,
    };
    OverlappingEditingOptions optionsNormal = {
        .useFellowsForbidden = false,
        .noSharedNeighborProposition = false,
    };

    long graphsCount = 0;
    bool foundGraph = false;
    while (std::getline(std::cin, line)) {
        if (line.empty()) continue;
        ++graphsCount;
        /*if(graphsCount > 1000) {
            std::cout << "Stopping after 1000 graphs for debugging\n";
            break;
        }*/

        std::cout << "########### New graph "<<graphsCount<<": "<<line<<"\n";
        Graph G = Graph::parse_graph6(line);
        // n=9, graphCount=261080

        // skip until graph number
        if(G.n()==10 && graphsCount < 1996 && optionsProposition.isolateProposition) {
            std::cout << "Skipping graph: already did it\n";
            continue;
        }
        // critical cliques skip
        /*if(G.n()==10 && graphsCount < 5536519 && optionsProposition.forbidCriticalCliques && !optionsProposition.useFellowsForbidden) {
            std::cout << "Skipping graph: already did it\n";
            continue;
        }*/
        if(G.n()==14 && graphsCount < 0 && optionsProposition.forbidCriticalCliques && !optionsProposition.useFellowsForbidden) {
            std::cout << "Skipping graph: already did it\n";
            continue;
        }
        // fellows forbidden skip
        if(G.n()==10 && graphsCount < 50 && optionsProposition.useFellowsForbidden) {
            std::cout << "Skipping graph: already did it\n";
            continue;
        }
        // skip until specific graph
        /*if(G.n()==10 && !foundGraph) {
            if(line != "I????B_vo") {
                std::cout << "Skipping graph: already did it\n";
                continue;
            }
        }*/

        int kBound = G.n() * G.n();

        // try to find a solution with the proposition algorithm (assumed to be faster - so find k here first)
        int kProposition = -1;
        long totalTime = 0;
        bool checkNormal = true;
        for(int k=0; k<=kBound; ++k) {
            auto overlappingSolutions = G.overlappingClusterEditingSolutionsBranchAndBound(s, k, optionsProposition, 1);
            totalTime += optionsProposition.timeTotal;

            /*if(optionsProposition.forbidCriticalCliques && optionsProposition.criticalCliqueEdges == 0) {
                checkNormal = false;
                break;
            }
            if(optionsProposition.forbidCliques && optionsProposition.cliqueEdges == 0) {
                checkNormal = false;
                break;
            }*/

            if(overlappingSolutions.size() == 0) {
                std::cout << "k="<<k<<": No proposition solutions found. Time until now ="<<totalTime<<" µs\n";
                continue;
            }

            std::cout << "k="<<k<<": graph "<<line<<" Found "<<overlappingSolutions.size()<<" proposition solution(s) in\n\ttotalTime="<<totalTime<<"µs "<<OverlappingEditingOptionsToString(optionsProposition)<<"\n";
            for(auto solution : overlappingSolutions) {
                std::cout << "\tProposition Solution: ";
                std::cout << "Edges Added:"<<Graph::vector_tostring(solution.edgesAdded)<<"";
                std::cout << ", Edges Removed:"<<Graph::vector_tostring(solution.edgesRemoved)<<"\n";
            }
            kProposition = k;
            break;
        }

        // e.g. if we know the proposition algorithm doesn't do anything different to the normal algorithm
        if(!checkNormal) {
            std::cout << "Skipping trying to find a solution since proposition = base algorithm (no special case occured)\n";
            continue;
        }

        // skipping base algorithm: finding forbidden subgraph check terminates if it doesn't find a forbidden subgraph
        std::cout << "Skipping base algorithm\n";
        continue;

        // try to find a solution with the normal algorithm (check if proposition is optimal)
        int kFound = -1;
        long totalTimeNormal = 0;
        for(int k=kProposition-1; k<=kProposition+5; ++k) {
            auto overlappingSolutions = G.overlappingClusterEditingSolutionsBranchAndBound(s, k, optionsNormal, 1);
            totalTimeNormal += optionsProposition.timeTotal;

            if(overlappingSolutions.size() == 0) {
                // std::cout << "k="<<k<<": No solutions found graph="<< line<<" "<<OverlappingEditingOptionsToString(optionsNormal)<<"\n";
                continue;
            }

            std::cout << "k="<<k<<": graph "<<line<<" Found "<<overlappingSolutions.size()<<" solution(s) in\n\ttotalTime="<<totalTimeNormal<<"µs "<<OverlappingEditingOptionsToString(optionsNormal)<<"\n";
            for(auto solution : overlappingSolutions) {
                std::cout << "\tSolution: ";
                std::cout << "Edges Added:"<<Graph::vector_tostring(solution.edgesAdded)<<"";
                std::cout << ", Edges Removed:"<<Graph::vector_tostring(solution.edgesRemoved)<<"\n";
            }
            kFound = k;
            break;
        }

        // check proposition algorithm finds a solution exactly when the original finds one
        if(kProposition != kFound) {
            std::cout << "Found a case where the normal algorithm finds a solution in k="<<kFound<<" and proposition k="<<kProposition<<" with graph="<<line<<"\n";
            break;
        }
    }

    return 0;
}
