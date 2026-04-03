/*
Test something on a nauty stream

Run using nauty geng
nauty-geng -c 14 | ./testWithNauty
*/
#include <unistd.h>
#include <sys/wait.h>

#include <iostream>
#include <string>
#include <vector>
#include <cstdlib>
#include <algorithm>
#include <functional>
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

int intersectionsFoundMin = 100;
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
        int intersectionsFound = 0;
        if(intersection1.size() > 0) {
            testThreeCliquesOverlappingTest(graphsCount, line, G, chosenCliques, intersection1, diff21, diff31);
            ++intersectionsFound;
        }
        if(intersection2.size() > 0) {
            testThreeCliquesOverlappingTest(graphsCount, line, G, chosenCliques, intersection2, diff12, diff32);
            ++intersectionsFound;
        }
        if(intersection3.size() > 0) {
            testThreeCliquesOverlappingTest(graphsCount, line, G, chosenCliques, intersection3, diff13, diff23);
            ++intersectionsFound;
        }
        
        /*
        if(intersectionsFound == 2) {
            std::cout << "########### New graph "<<graphsCount<<": "<<line<<" has "<<intersectionsFound<<" intersections i=1 "<<intersection1.size()
                <<"cliques="<<Graph::vector_tostring(chosenCliques)
                <<".\n";
            exit(1);
        }*/
        intersectionsFoundMin = std::min(intersectionsFoundMin, intersectionsFound);

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


// tested on n=8, n=9
bool testFourCliquesOverlappingTestSingle(Graph* G,
    std::unordered_set<int>& X, std::unordered_set<int>& Y, std::unordered_set<int>& Z, std::unordered_set<int>& A
) {
    auto setOne = Graph::set_difference(Graph::set_intersection(X, Y), Graph::set_union(Z, A));
    auto setTwo = Graph::set_difference(Graph::set_intersection(Z, A), Graph::set_union(X, Y));
    
    if(setOne.empty()) {
        /*std::cout << "########### Graph "<<graphsCount<<": "<<line<<" is a counterexample "
            <<" X="<<Graph::vector_tostring(X)<<" Y="<<Graph::vector_tostring(Y)<<" Z="<<Graph::vector_tostring(Z)<<" A="<<Graph::vector_tostring(A)
            <<" "<<__FILE__<<":"<<__LINE__
            <<".\n";
        exit(1);*/
        return false;
    }
    if(setTwo.empty()) {
        /*std::cout << "########### Graph "<<graphsCount<<": "<<line<<" is a counterexample "
            <<" X="<<Graph::vector_tostring(X)<<" Y="<<Graph::vector_tostring(Y)<<" Z="<<Graph::vector_tostring(Z)<<" A="<<Graph::vector_tostring(A)
            <<" "<<__FILE__<<":"<<__LINE__
            <<".\n";
        exit(1);*/
        return false;
    }

    bool found = false;
    for(auto v : setOne) {
        // if(I.find(v) != I.end()) continue;

        for(auto w : setTwo) {
            if(G->edge_has(v,w)) continue;
            found = true;
            break;
            // if(G->edge_has(v,w)) return false;
        }
        if(found) break;
    }

    /*if(!found) {
        std::cout << "########### Graph "<<graphsCount<<": "<<line<<" is a counterexample "
            <<" X="<<Graph::vector_tostring(X)<<" Y="<<Graph::vector_tostring(Y)<<" Z="<<Graph::vector_tostring(Z)<<" A="<<Graph::vector_tostring(A)
            <<" "<<__FILE__<<":"<<__LINE__
            <<".\n";
        exit(1);
    }*/
    return found;
    //return true;
}

void testFourCliquesOverlappingTest(int graphsCount, std::string& line, Graph* G,
    std::unordered_set<int>& X, std::unordered_set<int>& Y, std::unordered_set<int>& Z, std::unordered_set<int>& A
) {
    // test all orders
    auto found = true;
    found = found && testFourCliquesOverlappingTestSingle(G, X, Y, Z, A);
    found = found && testFourCliquesOverlappingTestSingle(G, Y, Z, A, X);
    found = found && testFourCliquesOverlappingTestSingle(G, Z, A, X, Y);
    found = found && testFourCliquesOverlappingTestSingle(G, A, X, Y, Z);

    // test all inverse orders
    found = found && testFourCliquesOverlappingTestSingle(G, A, Z, Y, X);
    found = found && testFourCliquesOverlappingTestSingle(G, Z, Y, X, A);
    found = found && testFourCliquesOverlappingTestSingle(G, Y, X, A, Z);
    found = found && testFourCliquesOverlappingTestSingle(G, X, A, Z, Y);

    if(!found) {
        std::cout << "########### Graph "<<graphsCount<<": "<<line<<" is a counterexample "
            <<" X="<<Graph::vector_tostring(X)<<" Y="<<Graph::vector_tostring(Y)<<" Z="<<Graph::vector_tostring(Z)<<" A="<<Graph::vector_tostring(A)
            <<" "<<__FILE__<<":"<<__LINE__
            <<".\n";
        exit(1);
    }
}

void testFourCliquesOverlapping(int graphsCount, std::string line) {
    Graph GraphValue = Graph::parse_graph6(line);

    Graph* G = &GraphValue;

    // get all cliques
    auto cliqueInfo = G->getMaximalCliques();

    // std::cout << "########### New graph "<<graphsCount<<": "<<line<<"\n";

    // only want three cliques
    if(cliqueInfo.cliqueList.size() < 4) {
        // std::cout << "########### New graph "<<graphsCount<<": "<<line<<" has "<<cliqueInfo.cliqueList.size()<<" cliques - skipping.\n";
        return;
    }

    size_t cliqueCount = cliqueInfo.cliqueList.size();
    size_t indicesSize = 4;
    std::vector<size_t> indices = std::vector<size_t>(indicesSize);
    size_t lastIndexIndex = indices.size() - 1;

    // cliques
    std::vector<std::unordered_set<int>> chosenCliques = std::vector<std::unordered_set<int>>(indicesSize);
    for(size_t i=0; i<indices.size(); ++i) {
        indices[i] = i;
        chosenCliques[i] = std::unordered_set<int>(cliqueInfo.cliqueList[i].begin(), cliqueInfo.cliqueList[i].end());
    }

    // try with every quartet of cliques
    bool loop = true;
    while(loop) {
        auto& clique1 = chosenCliques[0];
        auto& clique2 = chosenCliques[1];
        auto& clique3 = chosenCliques[2];
        auto& clique4 = chosenCliques[3];

        auto intersectionAll = Graph::set_intersection(Graph::set_intersection(Graph::set_intersection(clique1, clique2), clique3), clique4);

        // check if cliques can overlap in the specific way
        auto diff12 = Graph::set_difference(clique1, clique2);
        auto diff13 = Graph::set_difference(clique1, clique3);
        auto diff14 = Graph::set_difference(clique1, clique4);

        auto diff21 = Graph::set_difference(clique2, clique1);
        auto diff23 = Graph::set_difference(clique2, clique3);
        auto diff24 = Graph::set_difference(clique2, clique4);

        auto diff31 = Graph::set_difference(clique3, clique1);
        auto diff32 = Graph::set_difference(clique3, clique2);
        auto diff34 = Graph::set_difference(clique3, clique4);

        auto diff41 = Graph::set_difference(clique4, clique1);
        auto diff42 = Graph::set_difference(clique4, clique2);
        auto diff43 = Graph::set_difference(clique4, clique3);

        // i = 1
        auto intersection1 = Graph::set_difference(Graph::set_intersection(Graph::set_intersection(diff12, diff13), diff14), intersectionAll);
        // i = 2
        auto intersection2 = Graph::set_difference(Graph::set_intersection(Graph::set_intersection(diff21, diff23), diff24), intersectionAll);
        // i = 3
        auto intersection3 = Graph::set_difference(Graph::set_intersection(Graph::set_intersection(diff31, diff32), diff34), intersectionAll);
        // i = 4
        auto intersection4 = Graph::set_difference(Graph::set_intersection(Graph::set_intersection(diff41, diff42), diff43), intersectionAll);

        /*std::cout << "clique1="<<Graph::vector_tostring(clique1)
            <<" clique2="<<Graph::vector_tostring(clique2)
            <<" clique3="<<Graph::vector_tostring(clique3)
            <<" clique4="<<Graph::vector_tostring(clique4)

            <<"\n\t cliques="<<Graph::vector_tostring(cliqueInfo.cliqueList)

            <<"\n\t intersection1="<<Graph::vector_tostring(intersection1)
            <<"\n\t intersection2="<<Graph::vector_tostring(intersection2)
            <<"\n\t intersection3="<<Graph::vector_tostring(intersection3)
            <<"\n\t intersection4="<<Graph::vector_tostring(intersection4)

            <<"\n\t graph="<<G->to_graph6()<<"\n";*/

        // only care about cases without outside vertices
        if(intersection1.size() == 0 && intersection2.size() == 0 && intersection3.size() == 0 && intersection4.size() == 0) {
            auto overlaps12 = !Graph::set_difference(Graph::set_intersection(clique1, clique2), intersectionAll).empty();
            auto overlaps13 = !Graph::set_difference(Graph::set_intersection(clique1, clique3), intersectionAll).empty();
            auto overlaps14 = !Graph::set_difference(Graph::set_intersection(clique1, clique4), intersectionAll).empty();

            auto overlaps23 = !Graph::set_difference(Graph::set_intersection(clique2, clique3), intersectionAll).empty();
            auto overlaps24 = !Graph::set_difference(Graph::set_intersection(clique2, clique4), intersectionAll).empty();

            auto overlaps34 = !Graph::set_difference(Graph::set_intersection(clique3, clique4), intersectionAll).empty();

            /*auto overlaps13 = diff13.size() < clique1.size();
            auto overlaps14 = diff14.size() < clique1.size();

            auto overlaps23 = diff23.size() < clique2.size();
            auto overlaps24 = diff24.size() < clique2.size();

            auto overlaps34 = diff34.size() < clique3.size();*/

            // find cycle order
            bool ok = false;
            if(overlaps12) {
                if(overlaps23 && overlaps34) {
                    ok = true;
                    testFourCliquesOverlappingTest(graphsCount, line, G, chosenCliques[0], chosenCliques[1], chosenCliques[2], chosenCliques[3]);
                }
                if(overlaps24 && overlaps34) {
                    ok = true;
                    testFourCliquesOverlappingTest(graphsCount, line, G, chosenCliques[0], chosenCliques[1], chosenCliques[3], chosenCliques[2]);
                }
            }
            if(overlaps13) {
                if(overlaps23 && overlaps24) {
                    ok = true;
                    testFourCliquesOverlappingTest(graphsCount, line, G, chosenCliques[0], chosenCliques[2], chosenCliques[1], chosenCliques[3]);
                }
                if(overlaps34 && overlaps24) {
                    ok = true;
                    testFourCliquesOverlappingTest(graphsCount, line, G, chosenCliques[0], chosenCliques[2], chosenCliques[3], chosenCliques[1]);
                }
            }
            if(overlaps14) {
                if(overlaps24 && overlaps23) {
                    ok = true;
                    testFourCliquesOverlappingTest(graphsCount, line, G, chosenCliques[0], chosenCliques[3], chosenCliques[1], chosenCliques[2]);
                }
                if(overlaps34 && overlaps24) {
                    ok = true;
                    testFourCliquesOverlappingTest(graphsCount, line, G, chosenCliques[0], chosenCliques[3], chosenCliques[2], chosenCliques[1]);
                }
            }
            if(!ok) {
                std::cout << "########### Graph "<<graphsCount<<": "<<line<<" is a counterexample "
                    <<"cliques="<<Graph::vector_tostring(chosenCliques)<<" "<<__FILE__<<":"<<__LINE__
                    <<".\n";
                exit(1);
            }
        }

        // std::cout << "Test indices="<<Graph::vector_tostring(indices)<<"\n";

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
    /*std::cout << "New graph "<<graphsCount<<": "<<G->to_graph6()<<" is not a counterexample.\n";
    exit(1);*/
}


void testThreeCliquesSeparatorTest(int graphsCount, std::string& line, Graph* G, std::vector<std::unordered_set<int>>& cliques,
    std::unordered_set<int>& X, std::unordered_set<int>& Y, std::unordered_set<int>& Z,
    std::unordered_set<int>& X_outside, std::unordered_set<int>& Y_outside, std::unordered_set<int>& Z_minus_Y
) {
    bool found = false;
    for(auto v : X_outside) {
        found = false;
        for(auto w : Y_outside) {
            if(G->edge_has(v,w)) {
                continue;
            }

            for(auto x : Z_minus_Y) {
                if(!G->edge_has(v,x) && !G->edge_has(w,x)) {
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
        /*if(!found) {
            std::cout << "########### "<<__FILE__<<":"<<__LINE__<<" New graph "<<graphsCount<<": "<<line<<" is a counterexample."
                <<"cliques="<<Graph::vector_tostring(cliques)
                <<"\n\tX="<<Graph::vector_tostring(X)
                <<", Y="<<Graph::vector_tostring(Y)
                <<", Z="<<Graph::vector_tostring(Z)
                <<"\n";
            exit(1);
        }*/
    }

    // second case - is there another clique?
    if(!found) {
        auto A = Graph::set_union(X_outside, Y_outside);
        std::cout << "case where cycle "<<__FILE__<<":"<<__LINE__<<" New graph "<<graphsCount<<": "<<line
            <<" X="<<Graph::vector_tostring(X)
            <<", Y="<<Graph::vector_tostring(Y)
            <<", Z="<<Graph::vector_tostring(Z)
            <<", A="<<Graph::vector_tostring(A) <<"\n";

        auto intersectionAll = Graph::set_intersection(Graph::set_intersection(Graph::set_intersection(X, Y), Z), A);

        testFourCliquesOverlappingTest(graphsCount, line, G, X,Y,Z,A);
        
        /*std::cout << "case where cycle "<<__FILE__<<":"<<__LINE__<<" New graph "<<graphsCount<<": "<<line<<"."
            <<"cliques="<<Graph::vector_tostring(cliques)
            <<"\n\tX="<<Graph::vector_tostring(X)
            <<", Y="<<Graph::vector_tostring(Y)
            <<", Z="<<Graph::vector_tostring(Z)
            <<", A="<<Graph::vector_tostring(A)
            <<"\n";

        auto xy = Graph::set_intersection(X, Y);*/
    }

    if(false & !found) {
        std::cout << "########### "<<__FILE__<<":"<<__LINE__<<" New graph "<<graphsCount<<": "<<line<<" is a counterexample."
            <<"cliques="<<Graph::vector_tostring(cliques)
            /*<<"\n\tintersection="<<Graph::vector_tostring(intersection)
            <<", diff1="<<Graph::vector_tostring(diff1)
            <<", diff2="<<Graph::vector_tostring(diff2)*/
            <<"\n";
        exit(1);
    }
}
void testThreeCliquesSeparator(int graphsCount, std::string line) {
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
        int intersectionsFound = 0;
        if(intersection1.size() > 0) {
            if(intersection2.size() > 0) {
                testThreeCliquesSeparatorTest(graphsCount, line, G, chosenCliques, clique1, clique2, clique3, 
                    intersection1, intersection2, diff23);
                testThreeCliquesSeparatorTest(graphsCount, line, G, chosenCliques, clique2, clique1, clique3, 
                    intersection2, intersection1, diff13);
                ++intersectionsFound;
            }
            if(intersection3.size() > 0) {
                testThreeCliquesSeparatorTest(graphsCount, line, G, chosenCliques, clique1, clique3, clique2, 
                    intersection1, intersection3, diff32);
                testThreeCliquesSeparatorTest(graphsCount, line, G, chosenCliques, clique3, clique1, clique2, 
                    intersection3, intersection1, diff12);
                ++intersectionsFound;
            }
        }
        if(intersection2.size() > 0 && intersection3.size() > 0) {
            testThreeCliquesSeparatorTest(graphsCount, line, G, chosenCliques, clique2, clique3, clique1, 
                intersection2, intersection3, diff31);
            testThreeCliquesSeparatorTest(graphsCount, line, G, chosenCliques, clique3, clique2, clique1, 
                intersection3, intersection2, diff21);
            ++intersectionsFound;
        }

        intersectionsFoundMin = std::min(intersectionsFoundMin, intersectionsFound);

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


void lookForGraphWhereEveryVertexIsInHighAmountOfCliques(int graphsCount, std::string line) {
    Graph GraphValue = Graph::parse_graph6(line);
    size_t s = 8;
    // size_t vertexInThisAmountOfCliques = s - 4;
    size_t vertexInThisAmountOfCliques = 5;

    Graph* G = &GraphValue;

    // get all cliques
    auto cliqueInfo = G->getMaximalCliques(999999);

    // only want three cliques
    if(cliqueInfo.cliqueList.size() != s) {
        // std::cout << "########### New graph "<<graphsCount<<": "<<line<<" has "<<cliqueInfo.cliqueList.size()<<" cliques - skipping.\n";
        return;
    }

    size_t minFound = 10000;
    for(unsigned int i=0; i<G->n(); ++i) {
        auto& cliquesOverlapping = cliqueInfo.vertexCliques[i];
        minFound = std::min(minFound, cliquesOverlapping.size());
        //std::cout << "\tvertex="<<i<<": "<<cliquesOverlapping.size()<<"\n";
        if(minFound < vertexInThisAmountOfCliques) {
            return;
        }
    }
    if(minFound < vertexInThisAmountOfCliques) {
        /*if(minFound == vertexInThisAmountOfCliques-1) {
            std::cout << "########### New graph "<<graphsCount<<": "<<line
                <<" cliques="<<Graph::vector_tostring(cliqueInfo.cliqueList)
                <<" verticesCliques="<<Graph::vector_tostring(cliqueInfo.vertexCliques)<<"\n";
        }*/
        return;
    }

    std::cout << "########### New graph "<<graphsCount<<": "<<line<<" is an example."
        <<" cliques="<<Graph::vector_tostring(cliqueInfo.cliqueList)
        <<" verticesCliques="<<Graph::vector_tostring(cliqueInfo.vertexCliques)<<"\n";
    exit(1);
}

void cliquesMinimumNumberOfCliquesPerVertex(std::string line, std::vector<int>& numberOfCliquesWithCHalf) {
    Graph GraphValue = Graph::parse_graph6(line);
    Graph* G = &GraphValue;

    // get all cliques
    auto cliqueInfo = G->getMaximalCliques(999999);
    size_t s = cliqueInfo.cliqueList.size();
    while(numberOfCliquesWithCHalf.size() < s) {
        numberOfCliquesWithCHalf.push_back(99+numberOfCliquesWithCHalf.size());
    }
    auto bound = s / 2;

    // for every clique
    int countCliques = 0;
    for(auto& clique : cliqueInfo.cliqueList) {
        for(auto v : clique) {
            auto& cliquesOverlapping = cliqueInfo.vertexCliques[v];
            if(cliquesOverlapping.size() > bound) continue;
            ++countCliques;
            break;
        }
    }
    numberOfCliquesWithCHalf[s] = std::min(countCliques, numberOfCliquesWithCHalf[s]);
}

void cliqueSeparatorWorstCaseFindBranch(int graphsCount, Graph* G, 
    std::vector<std::unordered_set<int>>& cliques, int& minFound, int& propositionMinimum,
    std::vector<int>& separators, std::vector<int>& separatorsMin, int separatorCount, size_t indexA, size_t indexB
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
                cliqueSeparatorWorstCaseFindBranch(graphsCount, G, cliques, 
                    minFound, propositionMinimum, separators, separatorsMin, separatorCountNew, indexA, indexB+1);
            }
            // branch by incrementing indexA
            else if(indexA + 2 < cliques.size()) {
                cliqueSeparatorWorstCaseFindBranch(graphsCount, G, cliques, 
                    minFound, propositionMinimum, separators, separatorsMin, separatorCountNew, indexA+1, indexA+2);
            }
            // finished with branching: check the separator size
            else {
                if(separatorCountNew < minFound) {
                    minFound = separatorCountNew;
                    separatorsMin = std::vector<int>();
                    for(size_t i=0; i<separators.size(); ++i) {
                        if(separators[i] == 0) continue;
                        separatorsMin.push_back(i);
                    }
                    // std::cout << __FILE__<<":"<<__LINE__<<" ######## Graph "<<G->to_graph6()<<" greedy finds minFound="<<minFound<<" separators="<<Graph::vector_tostring(separators)<<" separatorsMin="<<Graph::vector_tostring(separatorsMin)<<" for "<<Graph::vector_tostring(cliques)<<"\n";
                }
                if(minFound <= propositionMinimum) return;
            }

            // reset vector for other branches
            if(aIsNew) separators[a] = 0;
            if(bIsNew) separators[b] = 0;
        }
    }

}

int graphsCountPrinted = 0;
int counter = 0;
std::vector<int> cliqueSeparatorWorstCaseFind(int graphsCount, Graph* G, 
    std::vector<std::unordered_set<int>>& cliques, int& propositionMinimum
) {
    if(cliques.size() < 2) return {};

    // try all possible separators
    auto c = cliques.size();
    int minFound = c * (c - 1); // worst case upper bound is (c choose 2)
    auto separators = std::vector<int>(G->n(), 0);
    std::vector<int> separatorsMin = {};
    cliqueSeparatorWorstCaseFindBranch(graphsCount, G, cliques, minFound, propositionMinimum, separators, separatorsMin, 0, 0, 1);

    // set worst case as the minimum found
    // numberOfCliquesToSeparatorSize = std::max(minFound, numberOfCliquesToSeparatorSize);

    if(minFound > propositionMinimum) {
        std::cout << "######## Graph "<<graphsCount<<": "<<G->to_graph6()<<" needs "<<minFound<<" separators for "<<Graph::vector_tostring(cliques)<<"\n";
        // exit(0);
    }
    /*if(minFound == propositionMinimum && graphsCount != graphsCountPrinted) {
        graphsCountPrinted = graphsCount;
        ++counter;
        std::cout << "######## Graph "<<graphsCount<<": "<<line<<" needs "<<minFound<<" separators for "<<Graph::vector_tostring(cliques)<<" count="<<counter<<"\n";
        // exit(0);
    }*/
    return separatorsMin;
}

// trying all separators, we look for the smallest set of separators. What is the MAXIMUM of that smallest set (depending on the number of cliques)?
void cliqueSeparatorWorstCase(int graphsCount, std::string line, int& numberOfCliquesToSeparatorSize) {
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
    size_t c = 4;
    int propositionMinimum = 6;

    Graph GraphValue = Graph::parse_graph6(line);
    Graph* G = &GraphValue;

    // get all cliques
    auto cliqueInfo = G->getMaximalCliques(999999);

    // create sets out of the cliques
    std::vector<std::unordered_set<int>> cliques = {};
    for(auto& clique : cliqueInfo.cliqueList) {
        cliques.push_back(std::unordered_set<int>(clique.begin(), clique.end()));
    }
    
    // lambda to receive the indices and call the solver function
    auto lambda = [graphsCount,&line,G,&numberOfCliquesToSeparatorSize,&cliques,&propositionMinimum](size_t, std::vector<size_t> indices) {
        // make list of the chosen cliques
        std::vector<std::unordered_set<int>> chosenCliques = {};
        for(auto i : indices) {
            chosenCliques.push_back(cliques[i]);
        }
        auto result = cliqueSeparatorWorstCaseFind(graphsCount, G, chosenCliques, propositionMinimum);
        numberOfCliquesToSeparatorSize = result.size();
        return true;
    };

    // try ALL subsets of cliques: size at least 3, since for 2 cliques we need at most 2 separators
    // if(cliqueInfo.cliqueList.size() < 3) return;
    /*for(size_t s = 3; s <= cliqueInfo.cliqueList.size(); ++s) {
        SubsetsOfSizeLoop(cliques.size(), s, lambda);
    }*/

    // only care about =c cliques
    if(cliques.size() >= c) SubsetsOfSizeLoop(cliques.size(), c, lambda);
    if(++counter % 10000 == 0) std::cout << "Graph "<<graphsCount<<": "<<line<<" with n="<<G->n()<<" c="<<c<<" current size="<< numberOfCliquesToSeparatorSize<<"\n";
    

    // numberOfCliquesToSeparatorSize[s] = std::min(countCliques, numberOfCliquesToSeparatorSize[s]);
}

void findSeparatorsGreedyBranchSeparators() {

}

void findSeparatorsGreedyBranch(
    Graph* G, 
    std::vector<std::unordered_set<int>>& cliques,
    std::vector<std::vector<std::unordered_set<int>>>& cliqueDifferences,

    std::vector<std::unordered_set<int>>& separatorsInCliques, int& maxFound, int& propositionMinimum,
    std::vector<int>& separators, int separatorCount, size_t indexA, size_t indexB, std::vector<std::string>& separatorsOrder
) {
    /*auto& A = cliques[indexA];
    auto& B = cliques[indexB];*/

    // try all possible separators separating clique indexA and clique indexB, then branch further for a different clique pair
    auto AwithoutB = cliqueDifferences[indexA][indexB];
    auto BwithoutA = cliqueDifferences[indexB][indexA];

    // if overlaps
    auto AwithoutBintersectionAlready = Graph::set_intersection(AwithoutB, separatorsInCliques[indexA]);
    auto BwithoutAintersectionAlready = Graph::set_intersection(BwithoutA, separatorsInCliques[indexB]);
    if(!AwithoutBintersectionAlready.empty()) AwithoutB = AwithoutBintersectionAlready;
    if(!BwithoutAintersectionAlready.empty()) BwithoutA = BwithoutAintersectionAlready;

    for(auto a : AwithoutB) {
        for(auto b : BwithoutA) {
            // separators are not adjacent
            if(G->edge_has(a,b)) continue;

            // duplicate check by being a set
            auto aIsNew = separators[a] == 0;
            auto bIsNew = separators[b] == 0;

            separatorsOrder.push_back("\nsep (" + std::to_string(indexA) + "," + std::to_string(indexB)+") : sets (" + Graph::vector_tostring(AwithoutB) + "," + Graph::vector_tostring(BwithoutA)+")"+") : intersections (" + Graph::vector_tostring(AwithoutBintersectionAlready) + "," + Graph::vector_tostring(BwithoutAintersectionAlready)+")"+" : separators=" + Graph::vector_tostring(separators)+" : verticesInCliques=" + Graph::vector_tostring(separatorsInCliques));

            auto separatorCountNew = separatorCount;
            // count separators, then bound
            if(aIsNew) {
                ++separatorCountNew;
                separators[a] = 1;
                separatorsInCliques[indexA].insert(a);
                separatorsOrder.push_back(" a="+std::to_string(a));

                for(size_t cliqueIndex=0; cliqueIndex<cliques.size(); ++cliqueIndex){
                    auto& clique = cliques[cliqueIndex];
                    if(clique.find(a) != clique.end()) {
                        separatorsInCliques[cliqueIndex].insert(a);
                    }
                }
            }
            if(bIsNew) {
                ++separatorCountNew;
                separators[b] = 1;
                separatorsInCliques[indexB].insert(b);
                separatorsOrder.push_back(" b="+std::to_string(b));

                for(size_t cliqueIndex=0; cliqueIndex<cliques.size(); ++cliqueIndex){
                    auto& clique = cliques[cliqueIndex];
                    if(clique.find(b) != clique.end()) {
                        separatorsInCliques[cliqueIndex].insert(b);
                    }
                }
            }

            separatorsOrder.push_back("");

            // branch by incrementing indexB
            if(indexB+1 < cliques.size()) {
                findSeparatorsGreedyBranch(G, cliques, cliqueDifferences, separatorsInCliques,
                    maxFound, propositionMinimum, separators, separatorCountNew, indexA, indexB+1, separatorsOrder);
            }
            // branch by incrementing indexA
            else if(indexA + 2 < cliques.size()) {
                findSeparatorsGreedyBranch(G, cliques, cliqueDifferences, separatorsInCliques,
                    maxFound, propositionMinimum, separators, separatorCountNew, indexA+1, indexA+2, separatorsOrder);
            }
            // finished with branching: check the separator size
            else {
                maxFound = std::max(separatorCountNew, maxFound);
                if(maxFound > propositionMinimum) {
                    std::cout << __FILE__<<":"<<__LINE__<<" ######## Graph "<<G->to_graph6()<<" greedy finds "<<maxFound<<" separators="<<Graph::vector_tostring(separators)<<" for "<<Graph::vector_tostring(cliques)<<"\n";
                    std::cout << "clique differences="<<Graph::vector_tostring(cliqueDifferences)<<"\n";
                    std::cout << "separatorsOrder="<<Graph::stringvector_tostring(separatorsOrder)<<"\n";
                    exit(0);
                }
            }

            separatorsOrder.pop_back();
            separatorsOrder.pop_back();

            // reset vector for other branches
            if(aIsNew) {
                separators[a] = 0;
                separatorsInCliques[indexA].erase(a);
                separatorsOrder.pop_back();

                for(size_t cliqueIndex=0; cliqueIndex<cliques.size(); ++cliqueIndex){
                    auto& clique = cliques[cliqueIndex];
                    if(clique.find(a) != clique.end()) {
                        separatorsInCliques[cliqueIndex].erase(a);
                    }
                }
            }

            if(bIsNew) {
                separators[b] = 0;
                separatorsInCliques[indexB].erase(b);
                separatorsOrder.pop_back();

                for(size_t cliqueIndex=0; cliqueIndex<cliques.size(); ++cliqueIndex){
                    auto& clique = cliques[cliqueIndex];
                    if(clique.find(b) != clique.end()) {
                        separatorsInCliques[cliqueIndex].erase(b);
                    }
                }
            }
        }
    }
}

// calculate all clique differences once
std::vector<std::vector<std::unordered_set<int>>> getCliqueDifferences(std::vector<std::unordered_set<int>>& cliques) {
    auto cliqueDifferences = std::vector<std::vector<std::unordered_set<int>>>(cliques.size());
    for(size_t i=0; i<cliques.size(); ++i) {
        cliqueDifferences[i] = std::vector<std::unordered_set<int>>(cliques.size());
    }
    for(size_t i=0; i<cliques.size(); ++i) {
        for(size_t j=i+1; j<cliques.size(); ++j) {
            auto& A = cliques[i];
            auto& B = cliques[j];

            cliqueDifferences[i][j] = Graph::set_difference(A, B);
            cliqueDifferences[j][i] = Graph::set_difference(B, A);
        }
    }
    return cliqueDifferences;
}

void findSeparatorsGreedy(Graph* G, std::vector<std::unordered_set<int>>& cliques, int& propositionMinimum) {
    auto separatorsInCliques = std::vector<std::unordered_set<int>>(cliques.size());

    // calculate all set differences once
    auto cliqueDifferences = getCliqueDifferences(cliques);
    for(size_t i=0; i<cliques.size(); ++i) {
        separatorsInCliques[i] = std::unordered_set<int>(cliques.size());
    }
    
    /*if(G->to_graph6() == "G?AA@?"){
        std::cout << "cliques="<<Graph::vector_tostring(cliques)<<"\n";
        std::cout << "clique differences="<<Graph::vector_tostring(cliqueDifferences)<<"\n";
        exit(1);
    }*/

    // try algorithm
    int maxFound = 0;
    auto separators = std::vector<int>(G->n(), 0);
    auto separatorsOrder = std::vector<std::string>();
    findSeparatorsGreedyBranch(G, cliques, cliqueDifferences, separatorsInCliques,
                    maxFound, propositionMinimum, separators, 0, 0, 1, separatorsOrder);
}

void findSeparatorsGreedyFunction(int graphsCount, std::string line) {
    size_t c = 4;
    int propositionMinimum = 8;

    Graph GraphValue = Graph::parse_graph6(line);
    Graph* G = &GraphValue;
    std::cout << "Graph "<<graphsCount<<": "<<line<<" with n="<<G->n()<<" c="<<c<<"\n";

    // get all cliques
    auto cliqueInfo = G->getMaximalCliques(999999);

    // create sets out of the cliques
    std::vector<std::unordered_set<int>> cliques = {};
    for(auto& clique : cliqueInfo.cliqueList) {
        cliques.push_back(std::unordered_set<int>(clique.begin(), clique.end()));
    }
    
    // lambda to receive the indices and call the solver function
    auto lambda = [&propositionMinimum,G,&cliques](size_t, std::vector<size_t> indices) {
        // make list of the chosen cliques
        std::vector<std::unordered_set<int>> chosenCliques = {};
        for(auto i : indices) {
            chosenCliques.push_back(cliques[i]);
        }
        findSeparatorsGreedy(G, chosenCliques, propositionMinimum);
        return true;
    };

    // try ALL subsets of cliques: size at least 3, since for 2 cliques we need at most 2 separators
    // if(cliqueInfo.cliqueList.size() < 3) return;
    /*for(size_t s = 3; s <= cliqueInfo.cliqueList.size(); ++s) {
        SubsetsOfSizeLoop(cliques.size(), s, lambda);
    }*/

    // only care about =c cliques
    if(cliques.size() >= c) SubsetsOfSizeLoop(cliques.size(), c, lambda);
    //if(++counter % 10000 == 0) std::cout << "Graph "<<graphsCount<<": "<<line<<" with n="<<G->n()<<" c="<<c<<" current size="<< numberOfCliquesToSeparatorSize<<"\n";    
    
}


bool findExampleWhereSeparatorPropertyMinimalBranch(int graphsCount, Graph* G, 
    std::vector<std::unordered_set<int>>& cliques, int& propositionMinimum, 
    std::vector<std::vector<size_t>>& vertexInCliques, std::unordered_set<int>& removed, int v
) {
    // recursive: remove from the graph, then check again

    bool propertyOk = false;

    // 1. alone in a clique
    for(auto cliqueIndex : vertexInCliques[v]) {
        if(Graph::set_difference(cliques[cliqueIndex], removed).size() <= 1) {
            propertyOk = true;
            break;
        }
    }
    if(propertyOk) return true;

    // create subgraph without v
    /*std::vector<int> subgraphVertices = std::vector<int>();
    subgraphVertices.reserve(G->n() - 1);*/
    // auto subgraph = G->getSubgraph()

    removed.insert(v);

    // 2. there exists a clique $C$, there exists $w \not \in C$ not adjacent to $v$ and not in $C$,
    // that is adjacent to all other vertices in $C$
    for(auto cliqueIndex : vertexInCliques[v]) {
        auto& clique = cliques[cliqueIndex];
        
        for(int w=0; w<G->n(); ++w) {
            if(w == v) continue;
            // w is in C
            if(clique.find(w) != clique.end()) continue;
            // w is adjacent to v
            if(G->edge_has(v, w)) continue;
            // w already "removed"
            if(removed.find(w) != removed.end()) continue;

            bool found = false;
            for(int x : clique) {
                if(v == x) continue;
                // w,x adjacent - property is ok
                if(G->edge_has(w, x)) continue;
                // x already "removed"
                if(removed.find(x) != removed.end()) continue;
                found = true;
                break;
            }
            if(!found) {
                // w is necessary - but can we remove w too?
                std::cout << "\tGraph="<<G->to_graph6()<<" v="<<v<<" w="<<w<<" has the separator property with cliqueIndex="<<cliqueIndex<<" clique="<<Graph::vector_tostring(clique)<<" removed="<<Graph::vector_tostring(removed)<<"\n";
                propertyOk = findExampleWhereSeparatorPropertyMinimalBranch(graphsCount, G, cliques, propositionMinimum, vertexInCliques, removed, w);
                // if we need w we can't remove it
                if(propertyOk) {
                    std::cout << "\t\tGraph="<<G->to_graph6()<<" v="<<v<<" w="<<w<<" has the separator property with cliqueIndex="<<cliqueIndex<<" clique="<<Graph::vector_tostring(clique)<<" removed="<<Graph::vector_tostring(removed)<<"\n";
                    removed.erase(v);
                    return true;
                }
            }
        }

        // if(propertyOk) break;
    }

    removed.erase(v);

    // property not fulfilled for this vertex
    // std::cout << "Graph nr="<<graphsCount<<" "<<G->to_graph6()<<" with n="<<G->n()<<" cliques="<<Graph::vector_tostring(cliques)<<" doesn't have the separator property\n";
    return false;
}

void findExampleWhereSeparatorPropertyMinimal(int graphsCount, Graph* G, std::vector<std::unordered_set<int>>& cliques, int& propositionMinimum) {
    // check cliques cover all vertices
    auto vertexInCliques = std::vector<std::vector<size_t>>(G->n(), std::vector<size_t>());
    for(size_t cliqueIndex=0; cliqueIndex<cliques.size(); ++cliqueIndex) {
        auto& clique = cliques[cliqueIndex];

        for(auto v : clique) {
            vertexInCliques[v].push_back(cliqueIndex);
        }
    }

    // not in a clique - cliques do not cover all vertices
    for(int v=0; v<G->n(); ++v) {
        if(vertexInCliques[v].empty()) return;
    }

    // check separator property for every vertex $v$
    for(int v=0; v<G->n(); ++v) {
        // recursive: remove from the graph, then check again
        std::unordered_set<int> removed = std::unordered_set<int>(G->n());
        bool propertyOk = findExampleWhereSeparatorPropertyMinimalBranch(graphsCount, G, cliques, propositionMinimum, vertexInCliques, removed, v);
        if(propertyOk) continue;

        // 1. alone in a clique
        /*for(auto cliqueIndex : vertexInCliques[v]) {
            if(cliques[cliqueIndex].size() == 1) {
                propertyOk = true;
                break;
            }
        }
        if(propertyOk) continue;


        // 2. there exists a clique $C$, there exists $w \not \in C$ not adjacent to $v$ and not in $C$,
        // that is adjacent to all other vertices in $C$
        for(auto cliqueIndex : vertexInCliques[v]) {
            auto& clique = cliques[cliqueIndex];
            
            for(int w=0; w<G->n(); ++w) {
                if(w == v) continue;
                // w is in C
                if(clique.find(w) != clique.end()) continue;
                // w is adjacent to v
                if(G->edge_has(v, w)) continue;

                bool found = false;
                for(int x : clique) {
                    if(v == x) continue;
                    // w,x adjacent - property is ok
                    if(G->edge_has(w, x)) continue;
                    found = true;
                    break;
                }
                if(!found) {
                    std::cout << "\tGraph="<<G->to_graph6()<<" v="<<v<<" w="<<w<<" has the separator property with cliqueIndex="<<cliqueIndex<<" clique="<<Graph::vector_tostring(clique)<<"\n";
                    propertyOk = true;
                    break;
                }
            }

            if(propertyOk) break;
        }
        */

        // property not fulfilled for this vertex
        if(!propertyOk) {
            std::cout << "Graph nr="<<graphsCount<<" "<<G->to_graph6()<<" with n="<<G->n()<<" cliques="<<Graph::vector_tostring(cliques)<<" doesn't have the separator property\n";
            return;
        }
    }

    std::cout << "Graph nr="<<graphsCount<<" "<<G->to_graph6()<<" with n="<<G->n()<<" cliques="<<Graph::vector_tostring(cliques)<<" HAS the separator property\n";
    exit(1);
}

// assume the given graph IS a forbidden induced subgraph - check if minimal
void findExampleWhereSeparatorPropertyMinimal(int graphsCount, std::string line) {
    size_t c = 4;
    int propositionMinimum = 6;

    Graph GraphValue = Graph::parse_graph6(line);
    Graph* G = &GraphValue;
    // std::cout << "Graph "<<graphsCount<<": "<<line<<" with n="<<G->n()<<" c="<<c<<"\n";

    // get all cliques
    auto cliqueInfo = G->getMaximalCliques(999999);

    // create sets out of the cliques
    std::vector<std::unordered_set<int>> cliques = {};
    for(auto& clique : cliqueInfo.cliqueList) {
        cliques.push_back(std::unordered_set<int>(clique.begin(), clique.end()));
    }
    
    // lambda to receive the indices and call the solver function
    auto lambda = [graphsCount, &propositionMinimum,G,&cliques](size_t, std::vector<size_t> indices) {
        // make list of the chosen cliques
        std::vector<std::unordered_set<int>> chosenCliques = {};
        for(auto i : indices) {
            chosenCliques.push_back(cliques[i]);
        }
        findExampleWhereSeparatorPropertyMinimal(graphsCount, G, chosenCliques, propositionMinimum);
        return true;
    };

    // try ALL subsets of cliques: size at least 3, since for 2 cliques we need at most 2 separators
    // if(cliqueInfo.cliqueList.size() < 3) return;
    /*for(size_t s = 3; s <= cliqueInfo.cliqueList.size(); ++s) {
        SubsetsOfSizeLoop(cliques.size(), s, lambda);
    }*/

    // only care about =c cliques
    if(cliques.size() >= c) SubsetsOfSizeLoop(cliques.size(), c, lambda);
    //if(++counter % 10000 == 0) std::cout << "Graph "<<graphsCount<<": "<<line<<" with n="<<G->n()<<" c="<<c<<" current size="<< numberOfCliquesToSeparatorSize<<"\n";    
    
}


// find which pairs are already separated
bool checkCliquesSeparated(int graphsCount, Graph* G, 
    std::vector<std::unordered_set<int>>& cliques, 
    std::vector<std::vector<std::unordered_set<int>>>& cliqueDifferences,
    std::unordered_set<int>& separatorsSet
) {
    for(size_t cliqueIndex = 0; cliqueIndex < cliques.size(); ++cliqueIndex) {
        for(size_t cliqueIndexOther = cliqueIndex+1; cliqueIndexOther < cliques.size(); ++cliqueIndexOther) {
            auto& diff = cliqueDifferences[cliqueIndex][cliqueIndexOther];
            auto cliqueSeparators = Graph::set_intersection(diff, separatorsSet);

            // no separator possible for this pair
            if(cliqueSeparators.empty()) return false;

            auto& diffOther = cliqueDifferences[cliqueIndexOther][cliqueIndex];
            auto otherSeparators = Graph::set_intersection(diffOther, separatorsSet);

            // no separator possible for this pair
            if(otherSeparators.empty()) return false;

            // check if there is a non-edge between possible separators
            auto found = false;
            for(auto v : cliqueSeparators) {
                for(auto w : otherSeparators) {
                    if(G->edge_has(v, w)) continue;
                    found = true;
                    break;
                }
                if(found) break;
            }
            
            // no separator found
            if(!found) return false;
        }
    }

    // found separators for every pair of cliques
    return true;
}

void outsideVertexPropositionOnCliques(int graphsCount, Graph* G, 
    std::vector<std::unordered_set<int>>& cliques, int& propositionMinimum, int& propositionMinimum1Smaller
) {
    auto cliqueDifferences = getCliqueDifferences(cliques);

    // for every clique that has outside vertices
    for(size_t cliqueIndex = 0; cliqueIndex < cliques.size(); ++cliqueIndex) {
        std::unordered_set<int> outside = cliques[cliqueIndex];
        std::vector<std::unordered_set<int>> cliquesLess = {};
        for(size_t i = 0; i < cliques.size(); ++i) {
            if(i == cliqueIndex) continue;
            cliquesLess.push_back(cliques[i]);

            // slim down outside vertices
            outside = Graph::set_difference(outside, cliques[i]);
        }

        // only check if this clique has outside vertices
        if(outside.empty()) continue;

        // find min separator for other cliques
        auto separatorsList = cliqueSeparatorWorstCaseFind(graphsCount, G, cliquesLess, propositionMinimum1Smaller);
        auto separatorSet = std::unordered_set<int>(separatorsList.begin(), separatorsList.end());

        // for every possible outside vertex
        bool foundSolution = false;
        //size_t separatedCountBest = 0;
        for(auto v : outside) {
            // find which pairs are already separated
            std::vector<bool> separated = std::vector<bool>(cliques.size());
            separated[cliqueIndex] = true;
            size_t separatedCount = 1;

            for(size_t cliqueIndexOther = 0; cliqueIndexOther < cliques.size(); ++cliqueIndexOther) {
                if(cliqueIndex == cliqueIndexOther) continue;

                auto& diff = cliqueDifferences[cliqueIndex][cliqueIndexOther];
                // v is NOT in $A \setminus B$
                if(diff.find(v) == diff.end()) continue;

                // find separator in other clique
                auto& diff2 = cliqueDifferences[cliqueIndexOther][cliqueIndex];
                auto found = false;
                for(auto w : separatorsList) {
                    // v,w adjacent
                    if(G->edge_has(v, w)) continue;
                    // w is NOT in $B \setminus A$
                    if(diff2.find(w) == diff2.end()) continue;
                    found = true;
                    break;
                }
                if(!found) continue;

                // separator found
                if(!separated[cliqueIndexOther]){
                    separated[cliqueIndexOther] = true;
                    ++separatedCount;
                }
            }

            //separatedCountBest

            // v separates everything
            if(separatedCount == cliques.size()) {
                foundSolution = true;
                break;
            }

            // find other vertex that should fix everything
            bool oneOtherCliqueDiffSetSet = false;
            std::unordered_set<int> oneOtherCliqueDiffSet;
            for(size_t i=0; i<separated.size(); ++i) {
                if(separated[i]) continue;

                if(!oneOtherCliqueDiffSetSet) {
                    oneOtherCliqueDiffSet = cliqueDifferences[i][cliqueIndex];
                }
                else {
                    oneOtherCliqueDiffSet = Graph::set_intersection(oneOtherCliqueDiffSet, cliqueDifferences[i][cliqueIndex]);
                }
            }
            
            // set empty - cannot find perfect separator
            if(oneOtherCliqueDiffSet.empty()) continue;

            // check possible separators for non-adjacents
            int wFound = -1;
            for (auto w : oneOtherCliqueDiffSet) {
                if(G->edge_has(v,w)) continue;
                foundSolution = true;
                wFound = w;
                break;
            }
            if(foundSolution) {
                std::cout << __FILE__<<":"<<__LINE__<<" Graph "<<graphsCount<<": "<<G->to_graph6()<<" with n="<<G->n()<<" cliqueOutside="<<Graph::vector_tostring(cliques[cliqueIndex])<<" cliquesLess="<<Graph::vector_tostring(cliquesLess)<<" outside vertex v="<<v<<" separates "<< separatedCount<<" cliques with separators="<<Graph::vector_tostring(separatorsList)<<" and wFound="<<wFound<<"\n";    
                break;
            }
            else {
                std::cout << __FILE__<<":"<<__LINE__<<" Graph "<<graphsCount<<": "<<G->to_graph6()<<" with n="<<G->n()<<" cliqueOutside="<<Graph::vector_tostring(cliques[cliqueIndex])<<" cliquesLess="<<Graph::vector_tostring(cliquesLess)<<" outside vertex v="<<v<<" cannot find other perfect vertex\n";    
                exit(1);
            }
        }

        if(!foundSolution) {
            std::cout << __FILE__<<":"<<__LINE__<<" Graph "<<graphsCount<<": "<<G->to_graph6()<<" with n="<<G->n()<<" cliqueOutside="<<Graph::vector_tostring(cliques[cliqueIndex])<<" cliquesLess="<<Graph::vector_tostring(cliquesLess)<<" separatorsList="<<Graph::vector_tostring(separatorsList)<<" didn't find solution\n";    
            exit(1);
        }
    }
}

void iterativeTwoVerticesPropositionOnCliques(int graphsCount, Graph* G, 
    std::vector<std::unordered_set<int>>& cliques, int& propositionMinimum, int& propositionMinimum1Smaller
) {
    auto cliqueDifferences = getCliqueDifferences(cliques);

    // for every clique
    for(size_t cliqueIndex = 0; cliqueIndex < cliques.size(); ++cliqueIndex) {
        std::vector<std::unordered_set<int>> cliquesLess = {};
        for(size_t i = 0; i < cliques.size(); ++i) {
            if(i == cliqueIndex) continue;
            cliquesLess.push_back(cliques[i]);
        }

        // find min separator for other cliques
        auto separatorsList = cliqueSeparatorWorstCaseFind(graphsCount, G, cliquesLess, propositionMinimum1Smaller);
        auto separatorSet = std::unordered_set<int>(separatorsList.begin(), separatorsList.end());

        // for every possible vertex
        bool foundSolution = checkCliquesSeparated(graphsCount, G, cliques, cliqueDifferences, separatorSet);

        // lambda to receive the indices and call the solver function
        auto lambda = [graphsCount, &foundSolution, &cliqueDifferences, G, &cliques, &separatorSet](size_t, std::vector<size_t> indices) {
            auto separatorsAdd = std::unordered_set<int>(indices.begin(), indices.end());

            // only choose separators not chosen yet
            auto overlap = Graph::set_intersection(separatorSet, separatorsAdd);
            if(!overlap.empty()) return true;

            auto both = Graph::set_union(separatorSet, separatorsAdd);
            auto found = checkCliquesSeparated(graphsCount, G, cliques, cliqueDifferences, both);
            if(found) {
                foundSolution = true;
                return false;
            }
            return true;
        };
        if(!foundSolution) SubsetsOfSizeLoop(G->n(), 2 * cliques.size() - 2 - separatorSet.size(), lambda);

        if(!foundSolution) {
            std::cout << __FILE__<<":"<<__LINE__<<" Graph "<<graphsCount<<": "<<G->to_graph6()<<" with n="<<G->n()<<" cliques="<<Graph::vector_tostring(cliques)<<" cliqueOutside="<<Graph::vector_tostring(cliques[cliqueIndex])<<" cliquesLess="<<Graph::vector_tostring(cliquesLess)<<" separatorsList="<<Graph::vector_tostring(separatorsList)<<" didn't find solution\n";    
            exit(1);
        }
    }
}

// if there is an outside vertex, can we just find separators for the other cliques, then there must exist an outside vertex where we only have to add 2?
void outsideVertexProposition(int graphsCount, std::string line) {
    size_t c = 4;
    int propositionMinimum = 6;
    int propositionMinimum1Smaller = 4;

    Graph GraphValue = Graph::parse_graph6(line);
    Graph* G = &GraphValue;
    // std::cout << "Graph "<<graphsCount<<": "<<line<<" with n="<<G->n()<<" c="<<c<<"\n";

    // get all cliques
    auto cliqueInfo = G->getMaximalCliques(999999);

    // create sets out of the cliques
    std::vector<std::unordered_set<int>> cliques = {};
    for(auto& clique : cliqueInfo.cliqueList) {
        cliques.push_back(std::unordered_set<int>(clique.begin(), clique.end()));
    }
    
    // lambda to receive the indices and call the solver function
    auto lambda = [graphsCount, &propositionMinimum, &propositionMinimum1Smaller,G,&cliques](size_t, std::vector<size_t> indices) {
        // make list of the chosen cliques
        std::vector<std::unordered_set<int>> chosenCliques = {};
        for(auto i : indices) {
            chosenCliques.push_back(cliques[i]);
        }
        // outsideVertexPropositionOnCliques(graphsCount, G, chosenCliques, propositionMinimum, propositionMinimum1Smaller);
        iterativeTwoVerticesPropositionOnCliques(graphsCount, G, chosenCliques, propositionMinimum, propositionMinimum1Smaller);
        return true;
    };

    // only care about =c cliques
    if(cliques.size() >= c) SubsetsOfSizeLoop(cliques.size(), c, lambda);
    //if(++counter % 10000 == 0) std::cout << "Graph "<<graphsCount<<": "<<line<<" with n="<<G->n()<<" c="<<c<<" current size="<< numberOfCliquesToSeparatorSize<<"\n";    
    
}

int main(int argc, char* argv[]) {
    // std::ios::sync_with_stdio(false);
    // std::cin.tie(nullptr);
    std::cout << "\n\ntestWithNauty starting\n";

    /*
    Non-connected/connected graphs:
    n=8:         12 346
    n=9:        274 668
    n=10:    12 005 168
    n=11: 1 018 997 864
     */

    int workers = 2;

    // parse options
    for(int i=1; i<argc; ++i) {
        std::string option = argv[i];

        if(option == "-p" && i+1 < argc) {
            workers = std::stoi(argv[++i]);
        }
    }
    if(workers < 1) workers = 1;

    // create pipes
    std::vector<int[2]> pipes(workers);
    for(int i=0;i<workers;i++) {
        if(pipe(pipes[i]) != 0) {
            std::cout << "Could not create pipe\n";
            exit(1);
        }
    }

    // fork workers
    for(int w=0; w<workers; ++w) {
        pid_t pid = fork();

        // child
        if(pid == 0) {
            // close unused pipes
            for(int j = 0; j < workers; ++j) {
                if(j == w) {
                    close(pipes[j][1]); // close write end of own pipe
                } else {
                    close(pipes[j][0]);
                    close(pipes[j][1]);
                }
            }

            FILE* stream = fdopen(pipes[w][0], "r");
            char buffer[4096];

            // run actual program
            int numberOfCliquesToSeparatorSize = 0;
            while(fgets(buffer, sizeof(buffer), stream)) {
                std::string msg(buffer);
                if(msg.empty()) continue;

                // split at first space
                size_t pos = msg.find(' ');
                if(pos == std::string::npos) continue;

                int graphsCount = std::stoi(msg.substr(0, pos));
                std::string line = msg.substr(pos + 1);

                // remove trailing newline
                if(!line.empty() && line.back() == '\n')
                    line.pop_back();

                // testThreeCliquesOverlapping(graphsCount, line);
                // testFourCliquesOverlapping(graphsCount, line);
                // testThreeCliquesSeparator(graphsCount, line);
                // lookForGraphWhereEveryVertexIsInHighAmountOfCliques(graphsCount, line);
                // cliquesMinimumNumberOfCliquesPerVertex(graphsCount, line, numberOfCliquesWithCHalf);
                cliqueSeparatorWorstCase(graphsCount, line, numberOfCliquesToSeparatorSize);
                // findSeparatorsGreedyFunction(graphsCount, line);
                // findExampleWhereSeparatorPropertyMinimal(graphsCount, line);
                outsideVertexProposition(graphsCount, line);
            }

            std::cout << "worker id="<<w<<" finished: needed separators found="<< numberOfCliquesToSeparatorSize<<"\n";

            fclose(stream);
            exit(0);
        }

        close(pipes[w][0]); // parent closes read end
    }

    // parent distributes graphs
    std::string line;
    long graphsCount = 0;
    int currentWorker = 0;

    while (std::getline(std::cin, line)) {
        if(line.empty()) continue;

        ++graphsCount;
        std::string toSend = std::to_string(graphsCount) + " " + line + "\n";

        if( write(
            pipes[currentWorker][1],
            toSend.c_str(),
            toSend.size()
        ) < 0) {
            std::cout << "Failed to write to worker "<<currentWorker<<"\n";
        }

        currentWorker = (currentWorker + 1) % workers;
    }

    // close pipes
    for(int i=0;i<workers;i++){
        close(pipes[i][1]);
    }

    // wait for workers
    for(int i=0;i<workers;i++){
        wait(nullptr);
    }

    // std::cout << "Intersections min="<<intersectionsFoundMin<<"\n";
    // std::cout << "numberOfCliquesWithCHalf="<<Graph::vector_tostring(numberOfCliquesWithCHalf)<<"\n";
    // std::cout << "numberOfCliquesToSeparatorSize="<<Graph::vector_tostring(numberOfCliquesToSeparatorSize)<<"\n";
    std::cout << "testWithNauty finished\n";

    return 0;
}
