.PHONY: run build test checker

CXX = g++
CXXFLAGS = -O3 -std=c++17 -Wall -Wextra
PROPFOLDER = proposition-checker

############################################
# graph drawing website targets

# run the typescript project
run:
	npm run dev

# build the typescript project
build:
	npm run build


############################################
# proposition checker targets

out-directory:
	-mkdir $(PROPFOLDER)/out

Graph.o: $(PROPFOLDER)/Graph.cpp $(PROPFOLDER)/Graph.h
	cd $(PROPFOLDER); $(CXX) $(CXXFLAGS) -c Graph.cpp

# checker script
checker.o: $(PROPFOLDER)/checker.cpp $(PROPFOLDER)/Graph.h
	cd $(PROPFOLDER); $(CXX) $(CXXFLAGS) -c checker.cpp

checker-compile: checker.o Graph.o out-directory
	cd $(PROPFOLDER); $(CXX) $(CXXFLAGS) checker.o Graph.o -o out/checker

# ran with 8: no graph where proposition algorithm finds a worse solution
# ran with 9: no graph where proposition algorithm finds a worse solution (checked 261080 connected graphs)
# ran with 10: ? / 11 716 571
# ran with 11:
# ran with 12: 1500

checker: checker-compile
	nauty-geng -c 10 | ./$(PROPFOLDER)/out/checker


# test script
test.o: test.cpp Graph.h
	cd $(PROPFOLDER); $(CXX) $(CXXFLAGS) -c test.cpp

test-compile: test.o Graph.o out-directory
	cd $(PROPFOLDER); $(CXX) $(CXXFLAGS) test.o Graph.o -o out/test

test: test-compile
	./$(PROPFOLDER)/out/test

clean:
	cd $(PROPFOLDER); rm -rf out; rm -f *.o
