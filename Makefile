PREFIX?=/usr/local
all:

install:
	install -D bin/* ${PREFIX}/bin/.

.PHONY: all install
