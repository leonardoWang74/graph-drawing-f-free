.PHONY: test, checker

CXX = g++
CXXFLAGS = -O3 -std=c++17 -Wall -Wextra

all: checker

out-directory:
	-mkdir out

Graph.o: Graph.cpp Graph.h
	$(CXX) $(CXXFLAGS) -c Graph.cpp

# checker script
checker.o: checker.cpp Graph.h
	$(CXX) $(CXXFLAGS) -c checker.cpp

checker-compile: checker.o Graph.o out-directory
	$(CXX) $(CXXFLAGS) checker.o Graph.o -o out/checker

# n = 8: 
# n = 9: 261 080 connected graphs
# n = 10: 11 716 571 connected graphs
# n = 11: 
# n = 12: 1500

checker: checker-compile
	nauty-geng -c 9 | ./out/checker

# unique strings script
uniqueStrings.o: uniqueStrings.cpp Graph.h
	$(CXX) $(CXXFLAGS) -c uniqueStrings.cpp

uniqueStrings-compile: uniqueStrings.o Graph.o out-directory
	$(CXX) $(CXXFLAGS) uniqueStrings.o Graph.o -o out/uniqueStrings

# minimalforbidden script
minimalForbiddenGenerate.o: minimalForbiddenGenerate.cpp Graph.h
	$(CXX) $(CXXFLAGS) -c minimalForbiddenGenerate.cpp

minimalForbiddenGenerate-compile: minimalForbiddenGenerate.o Graph.o out-directory
	$(CXX) $(CXXFLAGS) minimalForbiddenGenerate.o Graph.o -o out/minimalForbiddenGenerate

# max (s+1)*s+1 = s^2+s+1
# s=2: 7
# s=3: 13
# s=4: 21
minimalForbidden: minimalForbiddenGenerate-compile uniqueStrings-compile
	nauty-geng -q -c 9 | ./out/minimalForbiddenGenerate | nauty-labelg -q | ./out/uniqueStrings -i -q

# test script
test.o: test.cpp Graph.h
	$(CXX) $(CXXFLAGS) -c test.cpp

test-compile: test.o Graph.o out-directory
	$(CXX) $(CXXFLAGS) test.o Graph.o -o out/test

test: test-compile
	./out/test

# testWithNauty script
testWithNauty.o: testWithNauty.cpp Graph.h
	$(CXX) $(CXXFLAGS) -c testWithNauty.cpp

testWithNauty-compile: testWithNauty.o Graph.o out-directory
	$(CXX) $(CXXFLAGS) testWithNauty.o Graph.o -o out/testWithNauty

testWithNauty: testWithNauty-compile
	nauty-geng -q -c 11 | ./out/testWithNauty



clean:
	rm -rf out
	rm -f *.o
