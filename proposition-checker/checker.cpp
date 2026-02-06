/*
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

    OverlappingEditingOptions optionsProposition = {
        .useFellowsForbidden = false,
        .forbidCriticalCliques = true, // even if every one works, the "random" selection of forbidden subgraph doesn't guarantee this always works
        .forbidCliques = false, // counterexample: "2"-star triangles I???CB{{w - maybe this will never work
        .noNeighborProposition = false,
    };
    OverlappingEditingOptions optionsNormal = {
        .useFellowsForbidden = false,
        .noNeighborProposition = false,
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
        /*if(G.n()==10 && graphsCount < 1548011 && optionsProposition.forbidCriticalCliques) {
            std::cout << "Skipping graph: already did it\n";
            continue;
        }*/
        // critical cliques skip
        if(G.n()==10 && graphsCount < 2196214 && optionsProposition.forbidCriticalCliques && !optionsProposition.useFellowsForbidden) {
            std::cout << "Skipping graph: already did it\n";
            continue;
        }
        // fellows forbidden skip
        if(G.n()==10 && graphsCount < 45 && optionsProposition.useFellowsForbidden) {
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
            auto overlappingSolutions = G.overlappingClusterEditingSolutionsBranchAndBound(2, k, optionsProposition, 1);
            totalTime += optionsProposition.timeTotal;

            if(optionsProposition.forbidCriticalCliques && optionsProposition.criticalCliqueEdges == 0) {
                checkNormal = false;
                break;
            }
            if(optionsProposition.forbidCliques && optionsProposition.cliqueEdges == 0) {
                checkNormal = false;
                break;
            }

            if(overlappingSolutions.size() == 0) {
                // std::cout << "k="<<k<<": No proposition solutions found graph="<< line<<" in "<<OverlappingEditingOptionsToString(optionsProposition)<<"\n";
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

        // e.g. if 
        if(!checkNormal) {
            std::cout << "Skipping trying to find a solution since there were no critical clique edges added\n";
            continue;
        }

        // try to find a solution with the normal algorithm (check if proposition is optimal)
        int kFound = -1;
        long totalTimeNormal = 0;
        for(int k=kProposition-1; k<=kProposition+5; ++k) {
            auto overlappingSolutions = G.overlappingClusterEditingSolutionsBranchAndBound(2, k, optionsNormal, 1);
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
