/*
Test something on a nauty stream

Run using nauty geng
nauty-geng -c 14 | ./testWithNauty
*/

#include <iostream>
#include <string>
#include <vector>
#include <cstdlib>
#include <algorithm>
#include "Graph.h"

void testThreeCliquesOverlappingTest(int graphsCount, std::string& line, Graph* G, std::vector<std::unordered_set<int>>& cliques,
    std::unordered_set<int>& intersection, std::unordered_set<int>& diff1, std::unordered_set<int>& diff2
) {
    bool found = false;
    for(auto v : intersection) {
        found = false;
        for(auto w : diff1) {
            for(auto x : diff2) {
                if(!G->edge_has(v,w) && !G->edge_has(v,x)) {
                    found = true;
                    /*std::cout << "\t" <<__FILE__<<":"<<__LINE__<<" graph "<<graphsCount<<": "<<line<<" found v,w,x."
                        <<"cliques="<<Graph::vector_tostring(cliques)
                        <<"\n\tintersection="<<Graph::vector_tostring(intersection)
                        <<", diff1="<<Graph::vector_tostring(diff1)
                        <<", diff2="<<Graph::vector_tostring(diff2)
                        <<", v="<<v
                        <<", w="<<w
                        <<", x="<<x
                        <<"\n";*/
                    break;
                }
            }
            if(found) break;
        }
        
        // try to see if this holds for every v
        if(!found) {
            std::cout << "########### "<<__FILE__<<":"<<__LINE__<<" New graph "<<graphsCount<<": "<<line<<" is a counterexample."
                <<"cliques="<<Graph::vector_tostring(cliques)
                <<"\n\tintersection="<<Graph::vector_tostring(intersection)
                <<", diff1="<<Graph::vector_tostring(diff1)
                <<", diff2="<<Graph::vector_tostring(diff2)
                <<"\n";
            exit(1);
        }
    }

    /*if(!found) {
        auto cliques = Graph::vector_slice(cliqueInfo.cliqueList, 0, 3);
        std::cout << "########### "<<__FILE__<<":"<<__LINE__<<" New graph "<<graphsCount<<": "<<line<<" is a counterexample."
            <<"cliques="<<Graph::vector_tostring(cliques)
            <<"\n\tintersection="<<Graph::vector_tostring(intersection)
            <<", diff1="<<Graph::vector_tostring(diff1)
            <<", diff2="<<Graph::vector_tostring(diff2)
            <<"\n";
        exit(1);
    }*/
}

void testThreeCliquesOverlapping(int graphsCount, std::string line) {
    Graph GraphValue = Graph::parse_graph6(line);
    Graph* G = &GraphValue;

    // get all cliques
    auto cliqueInfo = G->getMaximalCliques();

    // std::cout << "########### New graph "<<graphsCount<<": "<<line<<"\n";

    // only want three cliques
    if(cliqueInfo.cliqueList.size() <= 3) {
        // std::cout << "########### New graph "<<graphsCount<<": "<<line<<" has "<<cliqueInfo.cliqueList.size()<<" cliques - skipping.\n";
        return;
    }

    size_t cliqueCount = cliqueInfo.cliqueList.size();
    size_t indicesSize = 3;
    std::vector<size_t> indices = std::vector<size_t>(indicesSize);
    size_t lastIndexIndex = indices.size() - 1;

    // cliques
    std::vector<std::unordered_set<int>> chosenCliques = std::vector<std::unordered_set<int>>(indicesSize);
    for(size_t i=0; i<indices.size(); ++i) {
        indices[i] = i;
        chosenCliques[i] = std::unordered_set<int>(cliqueInfo.cliqueList[i].begin(), cliqueInfo.cliqueList[i].end());
    }

    // try with every triple of cliques
    bool loop = true;
    while(loop) {
        auto& clique1 = chosenCliques[0];
        auto& clique2 = chosenCliques[1];
        auto& clique3 = chosenCliques[2];

        // check if cliques can overlap in the specific way
        auto diff12 = Graph::set_difference(clique1, clique2);
        auto diff21 = Graph::set_difference(clique2, clique1);

        auto diff13 = Graph::set_difference(clique1, clique3);
        auto diff31 = Graph::set_difference(clique3, clique1);

        auto diff23 = Graph::set_difference(clique2, clique3);
        auto diff32 = Graph::set_difference(clique3, clique2);

        // i = 1
        auto intersection1 = Graph::set_intersection(diff12, diff13);
        // i = 2
        auto intersection2 = Graph::set_intersection(diff21, diff23);
        // i = 3
        auto intersection3 = Graph::set_intersection(diff31, diff32);

        if(intersection1.size() == 0 && intersection2.size() == 0 && intersection3.size() == 0) {
            std::cout << "########### New graph "<<graphsCount<<": "<<line<<" is a counterexample i=1 "<<intersection1.size()
                <<" i=2 "<<intersection2.size()
                <<" i=3 "<<intersection3.size()
                <<".\n";
            exit(1);
        }

        // check if non-edges exist between the relevant vertices
        if(intersection1.size() > 0) {
            testThreeCliquesOverlappingTest(graphsCount, line, G, chosenCliques, intersection1, diff21, diff31);
        }
        if(intersection2.size() > 0) {
            testThreeCliquesOverlappingTest(graphsCount, line, G, chosenCliques, intersection2, diff12, diff32);
        }
        if(intersection3.size() > 0) {
            testThreeCliquesOverlappingTest(graphsCount, line, G, chosenCliques, intersection3, diff13, diff23);
        }

        // increment indices
        size_t incrementIndex = lastIndexIndex;
        while(true) {
            auto newValue = indices.at(incrementIndex) + 1;

            // first index can only go up to (degree - (s+2 - 1))
            // since the other indices need space
            const auto indexBound = cliqueCount - lastIndexIndex + incrementIndex;

            // wrap-around: also increment next index
            if(newValue >= indexBound) {
                // first index reached the last value: stop the outer loop
                if(incrementIndex == 0) {
                    loop = false;
                    break;
                }
                // other index reached the last value: set to value at previous index + 2 since previous will also be incremented
                else {
                    indices.at(incrementIndex) = indices.at(incrementIndex-1) + 2;
                }
                --incrementIndex;
            }
            // otherwise: only increment last index
            else {
                indices[incrementIndex] = newValue;
                break;
            }
        }
        
        // set new subgraph vertex for smallest incrementIndex
        auto clique = cliqueInfo.cliqueList[indices[incrementIndex]];
        chosenCliques[incrementIndex] = std::unordered_set<int>(clique.begin(), clique.end());

        // set new subgraph vertex for other incrementIndex and
        // adjust other indices. Example degree=8, increment [0,1,5,6,7] -> [0,2,3,7,8] -> [0,2,3,4,5]
        while(++incrementIndex < indicesSize) {
            indices[incrementIndex] = indices[incrementIndex-1] + 1;
            clique = cliqueInfo.cliqueList[indices[incrementIndex]];
            chosenCliques[incrementIndex] = std::unordered_set<int>(clique.begin(), clique.end());
        }
    }

    std::cout << "New graph "<<graphsCount<<": "<<line<<" is not a counterexample.\n";
}

int main() {
    // std::ios::sync_with_stdio(false);
    // std::cin.tie(nullptr);

    std::string line;

    long graphsCount = 0;
    while (std::getline(std::cin, line)) {
        if (line.empty()) continue;
        ++graphsCount;
        /*if(graphsCount > 100) {
            std::cout << "Stopping after 1000 graphs for debugging\n";
            break;
        }*/

        testThreeCliquesOverlapping(graphsCount, line);
    }

    return 0;
}
